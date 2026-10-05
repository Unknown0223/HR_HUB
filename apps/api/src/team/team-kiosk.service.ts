import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DayStatus, PunchDirection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { ATTENDANCE_TZ, startOfLocalDay, startOfNextLocalDay, workDateOnly } from '../attendance/attendance-day';
import { FaceMatchService } from '../face/face-match.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { runUnscoped } from '../common/data-scope';
import {
  MAX_GPS_ACCURACY_M,
  MOCK_LOCATION_WARNING,
  MeService,
  integrityFlagged,
  stripDataUrl,
} from '../me/me.service';
import { photoRef } from '../me/photo-ref';
import type { AuthUser } from '../auth/current-user.decorator';
import { pickKioskIdentity } from './kiosk-identify';
import type { TeamKioskPunchDto } from './dto';

/** ~6 KB JPEG — smaller than any real camera frame of a face. */
const MIN_KIOSK_PHOTO_B64 = 8_000;

const MEMBER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  middleName: true,
  tabNumber: true,
  position: { select: { name: true } },
  faceProfile: { select: { photoKey: true, photoUrl: true } },
  person: { select: { photoUrl: true } },
} as const;

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  tabNumber: string | null;
  position: { name: string } | null;
  faceProfile: { photoKey: string | null; photoUrl: string | null } | null;
  person: { photoUrl: string | null } | null;
};

function fullName(m: { lastName: string; firstName: string; middleName?: string | null }) {
  return [m.lastName, m.firstName, m.middleName].filter(Boolean).join(' ');
}

function isValidMark(raw: unknown) {
  return !(raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { isValid?: unknown }).isValid === false);
}

/**
 * «Device mode» of a manager's phone: where staff have no smartphones, the manager's phone
 * marks the people they lead. The employee is identified by face among the manager's own
 * subordinates only; the capability is granted per manager on «Доступы сотрудников».
 */
@Injectable()
export class TeamKioskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly me: MeService,
    private readonly attendance: AttendanceService,
    private readonly faceMatch: FaceMatchService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  async overview(user: AuthUser) {
    const { tenantId, manager, ids } = await this.requireKiosk(user);
    return runUnscoped(async () => {
      const now = new Date();
      const [members, marks, livenessDirections] = await Promise.all([
        this.prisma.employee.findMany({
          where: { tenantId, id: { in: ids } },
          select: MEMBER_SELECT,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        }),
        this.prisma.attendanceMark.findMany({
          where: {
            tenantId,
            employeeId: { in: ids },
            occurredAt: { gte: startOfLocalDay(now), lt: startOfNextLocalDay(now) },
          },
          select: { employeeId: true, occurredAt: true, rawPayload: true },
          orderBy: { occurredAt: 'asc' },
        }),
        this.attendance.livenessDirections(tenantId),
      ]);
      const marksBy = new Map<string, Date[]>();
      for (const m of marks) {
        if (!m.employeeId || !isValidMark(m.rawPayload)) continue;
        const list = marksBy.get(m.employeeId) ?? [];
        list.push(m.occurredAt);
        marksBy.set(m.employeeId, list);
      }
      const items = await Promise.all(
        members.map(async (m) => {
          const ref = await this.attendance.loadReferenceFace(m);
          const today = marksBy.get(m.id) ?? [];
          return {
            ...this.card(m),
            faceReady: !!ref?.ok,
            firstIn: today[0] ?? null,
            lastOut: today.length > 1 ? today[today.length - 1] : null,
          };
        }),
      );
      return {
        manager: fullName(manager),
        livenessDirections,
        total: items.length,
        faceReady: items.filter((i) => i.faceReady).length,
        items,
      };
    });
  }

  async punch(user: AuthUser, dto: TeamKioskPunchDto) {
    const { tenantId, manager, ids } = await this.requireKiosk(user);

    if (integrityFlagged(dto.integrity)) {
      await this.me.reportMockLocation(user, {
        integrity: dto.integrity!,
        latitude: dto.latitude,
        longitude: dto.longitude,
      });
      throw new ForbiddenException({ statusCode: 403, code: 'MOCK_LOCATION_DETECTED', message: MOCK_LOCATION_WARNING });
    }
    const steps = dto.liveness?.steps ?? [];
    if (!dto.liveness?.passed || new Set(steps).size !== steps.length) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'LIVENESS_FAILED',
        message: 'Yuz harakati tekshiruvidan o‘tilmadi — qayta urinib ko‘ring',
      });
    }
    if (dto.accuracy > MAX_GPS_ACCURACY_M) {
      throw new BadRequestException(
        `GPS aniqligi past: ${Math.round(dto.accuracy)} m (max ${MAX_GPS_ACCURACY_M} m)`,
      );
    }
    const selfie = stripDataUrl(dto.selfieBase64);
    const photo = dto.photoBase64 ? stripDataUrl(dto.photoBase64) : selfie;
    if (photo.length < MIN_KIOSK_PHOTO_B64 || !selfie) {
      throw new BadRequestException('Rasm topilmadi yoki juda kichik');
    }

    const geo = await this.attendance.phonePunchFence(tenantId, dto);
    const { member, faceMatch } = await this.identify(tenantId, ids, selfie);
    const name = fullName(member);
    await this.me.assertMarksAllowed(tenantId, member.id);

    const now = new Date();
    const today = await this.prisma.attendanceMark.findMany({
      where: { tenantId, employeeId: member.id, occurredAt: { gte: startOfLocalDay(now), lt: startOfNextLocalDay(now) } },
      select: { rawPayload: true },
    });
    const hasValidMark = today.some((m) => isValidMark(m.rawPayload));
    if (dto.direction === 'IN' && hasValidMark) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'KIOSK_ALREADY_IN',
        message: `${name}: bugun kirish allaqachon qayd etilgan`,
        employee: this.card(member),
      });
    }
    if (dto.direction === 'OUT' && !hasValidMark) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'KIOSK_NOT_IN',
        message: `${name}: bugun kirish belgisi yo‘q — avval «Kirish» rejimida belgilang`,
        employee: this.card(member),
      });
    }

    const direction = dto.direction === 'IN' ? PunchDirection.IN : PunchDirection.OUT;
    const result = await this.attendance.punchByManager(
      tenantId,
      {
        employeeId: member.id,
        direction,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        photoBase64: photo,
        selfieBase64: selfie,
        liveness: { steps, durationMs: dto.liveness.durationMs },
        comment: dto.comment,
        integrity: dto.integrity ? ({ ...dto.integrity } as Record<string, unknown>) : undefined,
        markedBy: { employeeId: manager.id, name: fullName(manager) },
        faceMatch,
      },
      geo,
    );

    const day = await this.prisma.attendanceDay.findUnique({
      where: { tenantId_employeeId_workDate: { tenantId, employeeId: member.id, workDate: workDateOnly(now) } },
      select: { status: true, lateMinutes: true },
    });
    void this.notifyEmployee(tenantId, member.id, fullName(manager), direction, result, day).catch(() => undefined);

    return {
      ...result,
      employee: this.card(member),
      score: faceMatch.score,
      day: day ? { status: day.status, lateMinutes: day.lateMinutes } : null,
    };
  }

  private async requireKiosk(user: AuthUser) {
    const { tenantId, employee } = await this.me.requireEmployee(user);
    if (!(await this.me.teamKioskEnabled(tenantId, employee.id))) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'TEAM_KIOSK_DISABLED',
        message: 'Xodimlarni telefoningiz orqali belgilash ruxsati berilmagan',
      });
    }
    const ids = await this.me.subordinateIds(tenantId, employee.id);
    if (!ids.length) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'TEAM_KIOSK_NO_TEAM',
        message: 'Sizga biriktirilgan xodimlar yo‘q',
      });
    }
    return { tenantId, manager: employee, ids };
  }

  /** Face of the person in front of the phone against the manager's own subordinates only. */
  private async identify(tenantId: string, ids: string[], selfie: string) {
    const probe = await this.faceMatch.embed(Buffer.from(selfie, 'base64'));
    if (!probe.ok) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'FACE_NOT_FOUND',
        message: 'Rasmda yuz aniqlanmadi — yorug‘ joyda yuzni kameraga to‘g‘ri qarating',
      });
    }
    const members = await runUnscoped(() =>
      this.prisma.employee.findMany({ where: { tenantId, id: { in: ids } }, select: MEMBER_SELECT }),
    );
    const byId = new Map(members.map((m) => [m.id, m]));
    const scored: { employeeId: string; score: number }[] = [];
    for (const m of members) {
      const ref = await this.attendance.loadReferenceFace(m);
      if (!ref?.ok) continue;
      scored.push({
        employeeId: m.id,
        score: Math.round(this.faceMatch.similarity(probe.embedding, ref.embedding) * 1000) / 1000,
      });
    }
    const threshold = this.faceMatch.threshold;
    const identity = pickKioskIdentity(scored, threshold);
    if (identity.status === 'unknown') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'KIOSK_FACE_UNKNOWN',
        message: 'Yuz sizga biriktirilgan xodimlardan hech biriga mos kelmadi — belgi qo‘yilmadi',
      });
    }
    if (identity.status === 'ambiguous') {
      throw new BadRequestException({
        statusCode: 400,
        code: 'KIOSK_FACE_AMBIGUOUS',
        message: 'Yuz bir nechta xodimga o‘xshab ketdi — yorug‘ joyda qayta urinib ko‘ring',
      });
    }
    return {
      member: byId.get(identity.best.employeeId)!,
      faceMatch: {
        status: 'match',
        mode: 'team_identify',
        score: identity.best.score,
        threshold,
        compared: scored.length,
        checkedAt: new Date().toISOString(),
      },
    };
  }

  private async notifyEmployee(
    tenantId: string,
    employeeId: string,
    managerName: string,
    direction: PunchDirection,
    result: { markId?: string; occurredAt: string; locationName: string | null },
    day: { status: DayStatus; lateMinutes: number } | null,
  ) {
    if (!result.markId) return;
    const time = new Intl.DateTimeFormat('ru-RU', {
      timeZone: ATTENDANCE_TZ,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(result.occurredAt));
    const label = direction === PunchDirection.IN ? 'Kirish' : 'Chiqish';
    const late = direction === PunchDirection.IN && day?.status === DayStatus.late;
    const verdict =
      direction !== PunchDirection.IN ? '' : late ? ` — ${day!.lateMinutes} daqiqa kechikish.` : ' — o‘z vaqtida.';
    await this.notifications.notifyEmployee(tenantId, employeeId, {
      kind: late ? 'alert' : 'info',
      title: `${label} qayd etildi · ${time}`,
      body:
        `Rahbaringiz ${managerName} sizni ${time} da telefoni orqali «${label}» deb belgiladi` +
        `${result.locationName ? ` (${result.locationName})` : ''}${verdict}`,
      entity: 'attendance_arrival',
      entityId: result.markId,
      href: '/calendar',
    });
  }

  private card(m: Member) {
    return {
      employeeId: m.id,
      fullName: fullName(m),
      tabNumber: m.tabNumber,
      position: m.position?.name ?? null,
      photoUrl: photoRef(
        m.id,
        this.storage.mediaUrl(m.faceProfile?.photoKey, m.faceProfile?.photoUrl ?? m.person?.photoUrl),
      ),
    };
  }
}
