import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PunchDirection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { TelegramBotClient } from '../telegram/telegram-bot.client';
import { AttendanceService } from '../attendance/attendance.service';
import { AccessService } from '../access/access.service';
import type { AuthUser } from '../auth/current-user.decorator';
import { assertVideoPunch, parsePunchVideoSettings, pickDayCode, spokenCodeRequired, type PunchVideoSettings } from './punch-video';

type Emp = { id: string; lastName: string | null; firstName: string | null };

function workDateOnly(d = new Date()): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

@Injectable()
export class PunchVideoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly telegram: TelegramBotClient,
    private readonly attendance: AttendanceService,
    private readonly access: AccessService,
  ) {}

  async flags(tenantId: string): Promise<{ punchVideo: boolean; punchVideoCode: boolean }> {
    const s = await this.settings(tenantId);
    return { punchVideo: s.enabled, punchVideoCode: s.enabled && s.codeRequired };
  }

  async getSettings(tenantId: string) {
    return this.settings(tenantId);
  }

  async saveSettings(tenantId: string, patch: Partial<PunchVideoSettings>) {
    const current = await this.settings(tenantId);
    const next: PunchVideoSettings = {
      enabled: patch.enabled ?? current.enabled,
      codeRequired: patch.codeRequired ?? current.codeRequired,
      chatId: patch.chatId !== undefined ? patch.chatId.trim() : current.chatId,
    };
    const row = await this.prisma.tenantSetting.findUnique({ where: { tenantId } });
    const extras = (row?.extras && typeof row.extras === 'object' && !Array.isArray(row.extras) ? row.extras : {}) as Record<string, unknown>;
    const merged = { ...extras, punchVideo: next };
    if (row) {
      await this.prisma.tenantSetting.update({ where: { tenantId }, data: { extras: merged } });
    } else {
      await this.prisma.tenantSetting.create({ data: { tenantId, extras: merged } });
    }
    return next;
  }

  /** Today's code for the signed-in employee. Null when the spoken-code switch is off. */
  async today(tenantId: string, employeeId: string) {
    const s = await this.settings(tenantId);
    const grant = await this.videoGrant(tenantId, employeeId);
    if (!s.enabled || !grant) return { enabled: false, codeRequired: false, code: null as number | null };
    const codeRequired = spokenCodeRequired(grant.note, s.codeRequired);
    const code = codeRequired ? await this.issueCode(tenantId, employeeId) : null;
    return { enabled: true, codeRequired, code };
  }

  async punch(
    tenantId: string,
    employee: Emp,
    marks: { rawPayload: unknown }[],
    body: {
      direction: 'IN' | 'OUT';
      latitude: number;
      longitude: number;
      accuracy: number;
      durationSec: number;
      captureMode: 'simultaneous' | 'sequential';
      spokenCode?: number;
      comment?: string;
    },
    files: { front: Buffer; back?: Buffer },
  ) {
    const s = await this.settings(tenantId);
    const grant = await this.videoGrant(tenantId, employee.id);
    if (!grant) {
      throw new ForbiddenException('Video bilan belgilash bu xodim uchun yoqilmagan');
    }
    const codeRequired = spokenCodeRequired(grant.note, s.codeRequired);
    const dayCode = codeRequired ? await this.issueCode(tenantId, employee.id) : null;
    const check = assertVideoPunch({
      durationSec: body.durationSec,
      bytes: files.front.length,
      enabled: s.enabled,
      codeRequired,
      code: dayCode,
      spokenCode: body.spokenCode,
    });
    if (!check.ok) {
      throw new BadRequestException({ statusCode: 400, code: check.code, message: check.message });
    }
    if (body.accuracy > 100) {
      throw new BadRequestException(`GPS aniqligi past: ${Math.round(body.accuracy)} m`);
    }

    const hasValid = marks.some((m) => {
      const p = m.rawPayload;
      return !(p && typeof p === 'object' && !Array.isArray(p) && (p as { isValid?: boolean }).isValid === false);
    });
    if (body.direction === 'OUT' && !hasValid) throw new BadRequestException('Avval kirish belgisini qo‘ying');
    if (body.direction === 'IN' && hasValid) throw new BadRequestException('Bugun kirish allaqachon qayd etilgan');

    const geo = await this.attendance.phonePunchFence(tenantId, body);
    const stamp = Date.now();
    const front = await this.storage.putObject(`punch-video/${tenantId}/${employee.id}/${stamp}-front.mp4`, files.front, 'video/mp4');
    const back = files.back
      ? await this.storage.putObject(`punch-video/${tenantId}/${employee.id}/${stamp}-back.mp4`, files.back, 'video/mp4')
      : null;

    const result = await this.attendance.ingestPunch({
      tenantId,
      employeeId: employee.id,
      direction: body.direction === 'IN' ? PunchDirection.IN : PunchDirection.OUT,
      occurredAt: new Date().toISOString(),
      source: 'mobile_video',
      raw: {
        videoFrontKey: front.key,
        videoBackKey: back?.key ?? null,
        captureMode: body.captureMode,
        durationSec: body.durationSec,
        dayCode,
        latitude: body.latitude,
        longitude: body.longitude,
        accuracy: body.accuracy,
        outsideGeofence: geo.outside,
        comment: geo.comment || undefined,
        locationName: geo.fence?.locationName ?? null,
      },
    });

    if (s.chatId) {
      const name = [employee.lastName, employee.firstName].filter(Boolean).join(' ');
      const caption = [
        `${name}`,
        `${body.direction === 'IN' ? 'Kirish' : 'Chiqish'} · ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}`,
        dayCode ? `Kunlik kod: ${dayCode}` : 'Kunlik kod so‘ralmagan',
        `Kamera: ${body.captureMode === 'simultaneous' ? 'bir vaqtda' : 'ketma-ket'}`,
        geo.fence?.locationName ? `Joy: ${geo.fence.locationName}` : '',
      ].filter(Boolean).join('\n');
      await this.telegram.sendVideo(s.chatId, files.front, caption, tenantId, 'old-kamera.mp4');
      if (files.back) {
        await this.telegram.sendVideo(s.chatId, files.back, `${name}: orqa kamera`, tenantId, 'orqa-kamera.mp4');
      }
    }

    return { ...result, dayCode, captureMode: body.captureMode, telegram: Boolean(s.chatId) };
  }

  async staff(tenantId: string, q: string, employeeId?: string) {
    const accounts = await this.prisma.user.findMany({
      where: { tenantId, role: 'employee', isActive: true },
      select: { email: true, meta: true },
    });
    const loginByEmployee = new Map<string, string>();
    for (const u of accounts) {
      const meta = u.meta && typeof u.meta === 'object' && !Array.isArray(u.meta) ? (u.meta as Record<string, unknown>) : {};
      const id = typeof meta.employeeId === 'string' ? meta.employeeId : '';
      if (!id) continue;
      loginByEmployee.set(id, u.email.split('@')[0]);
    }
    const ids = employeeId ? [employeeId].filter((id) => loginByEmployee.has(id)) : [...loginByEmployee.keys()];
    if (!ids.length) return { items: [] };
    const query = q.trim().toLowerCase();
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, status: 'active', id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, tabNumber: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const matched = query
      ? employees.filter((e) => {
          const name = `${e.lastName} ${e.firstName} ${e.tabNumber} ${loginByEmployee.get(e.id) ?? ''}`.toLowerCase();
          return name.includes(query);
        })
      : employees;
    const grants = await this.prisma.employeeAccessGrant.findMany({
      where: {
        tenantId,
        employeeId: { in: matched.map((e) => e.id) },
        accessType: 'punch_video',
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { employeeId: true, note: true },
    });
    const grantByEmployee = new Map(grants.map((g) => [g.employeeId, g.note]));
    const company = await this.settings(tenantId);
    return {
      items: matched.map((e) => ({
        id: e.id,
        fullName: [e.lastName, e.firstName].filter(Boolean).join(' '),
        tabNumber: e.tabNumber,
        login: loginByEmployee.get(e.id) ?? '',
        enabled: grantByEmployee.has(e.id),
        codeRequired: grantByEmployee.has(e.id)
          ? spokenCodeRequired(grantByEmployee.get(e.id), company.codeRequired)
          : false,
      })),
    };
  }

  async assign(
    tenantId: string,
    actor: AuthUser,
    employeeIds: string[],
    enabled: boolean,
    codeRequired?: boolean,
  ) {
    const current = await this.settings(tenantId);
    if (enabled && !current.enabled) await this.saveSettings(tenantId, { enabled: true });
    const result = await this.access.bulk(tenantId, actor, {
      action: enabled ? 'grant' : 'revoke',
      employeeIds,
      accessType: 'punch_video',
      reason: enabled ? 'Video-otmetka yoqildi' : 'Video-otmetka ochirildi',
    });
    if (enabled) {
      const wantCode = codeRequired ?? current.codeRequired;
      const note = wantCode ? 'code' : 'nocode';
      await this.prisma.employeeAccessGrant.updateMany({
        where: { tenantId, employeeId: { in: employeeIds }, accessType: 'punch_video', isActive: true },
        data: { note },
      });
    }
    return result;
  }

  private async videoGrant(tenantId: string, employeeId: string) {
    return this.prisma.employeeAccessGrant.findFirst({
      where: {
        tenantId,
        employeeId,
        accessType: 'punch_video',
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true, note: true },
    });
  }

  private async settings(tenantId: string): Promise<PunchVideoSettings> {
    const row = await this.prisma.tenantSetting.findUnique({ where: { tenantId }, select: { extras: true } });
    return parsePunchVideoSettings(row?.extras);
  }

  private async issueCode(tenantId: string, employeeId: string): Promise<number> {
    const workDate = workDateOnly();
    const existing = await this.prisma.punchDayCode.findUnique({
      where: { tenantId_employeeId_workDate: { tenantId, employeeId, workDate } },
    });
    if (existing) return existing.code;
    const taken = await this.prisma.punchDayCode.findMany({
      where: { tenantId, workDate },
      select: { code: true },
    });
    const code = pickDayCode(new Set(taken.map((t) => t.code)));
    if (!code) throw new ForbiddenException('Bugungi kodlar tugadi (999)');
    try {
      const row = await this.prisma.punchDayCode.create({ data: { tenantId, employeeId, workDate, code } });
      return row.code;
    } catch {
      const again = await this.prisma.punchDayCode.findUnique({
        where: { tenantId_employeeId_workDate: { tenantId, employeeId, workDate } },
      });
      if (again) return again.code;
      throw new BadRequestException('Kunlik kod berilmadi, qayta urinib ko‘ring');
    }
  }
}
