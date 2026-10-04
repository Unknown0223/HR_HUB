import { Injectable, Logger } from '@nestjs/common';
import { EmploymentStatus, NotificationKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FaceMatchService } from '../face/face-match.service';
import { AttendanceService } from './attendance.service';
import type { IngestAdminAuditDto } from './dto';

const REASON = 'device_admin_login';
/** The heartbeat that creates the problem mark normally lands first; give it a moment. */
const MARK_RETRY_DELAYS_MS = [2_000, 4_000, 8_000];
const MAX_SNAPSHOTS = 6;
const MAX_OPERATIONS = 200;
const MAX_STORED_CHANGES = 500;
const MAX_IDENTITY_CANDIDATES = 1_500;
const TOP_CANDIDATES = 3;
/** Second-best above the threshold and this close to the best → HR must look at the photo. */
const AMBIGUOUS_MARGIN = 0.05;
const PROBLEMS_HREF = '/attendance/problems';
/** Gateway resends after a timeout; the same session phase is stored and announced once. */
const DUPLICATE_WINDOW_MS = 10 * 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Json = Record<string, unknown>;
type TerminalPerson = { id: string; name: string; tabNumber: string };
type LoginBy = { employeeId: string | null; name: string; employeeNo: string };
type Candidate = { employeeId: string; name: string; tabNumber: string; score: number };
type Identity = {
  status: 'match' | 'unknown' | 'no_face' | 'no_frames';
  frames: number;
  facesFound: number;
  threshold: number;
  compared: number;
  ambiguous: boolean;
  candidates: Candidate[];
};
type Session = { tenantId: string; device: { id: string; name: string }; serial: number; adminLoginAt: string | null };

function asJson(v: unknown): Json {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

function personName(e: { lastName: string; firstName: string }) {
  return [e.lastName, e.firstName].filter(Boolean).join(' ');
}

/** Terminal employeeNo is our tab number / external id with leading zeros stripped. */
function terminalNoVariants(no: string): string[] {
  if (!/^\d+$/.test(no)) return [no];
  const bare = String(Number(no));
  const out = new Set([no, bare]);
  for (let len = bare.length + 1; len <= 10; len++) out.add(bare.padStart(len, '0'));
  return [...out];
}

function normalizeTerminalNo(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  return /^\d+$/.test(s) ? String(Number(s)) : s;
}

/**
 * Local admin sessions on Hikvision terminals: who entered the admin password (camera
 * frames matched against staff photos) and what they changed (journal + config diff),
 * stored on the `device_admin_login` problem mark that the heartbeat raised.
 */
@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly faceMatch: FaceMatchService,
    private readonly notifications: NotificationsService,
  ) {}

  async recordAdminAudit(input: IngestAdminAuditDto): Promise<{ ok: boolean }> {
    try {
      const tenantId = text(input.tenantId);
      const deviceId = text(input.deviceId);
      if (!UUID_RE.test(tenantId) || !deviceId) return { ok: false };
      const device = await this.prisma.device.findFirst({
        where: {
          tenantId,
          OR: [...(UUID_RE.test(deviceId) ? [{ id: deviceId }] : []), { gatewayRef: deviceId }],
        },
        select: { id: true, name: true },
      });
      if (!device) return { ok: false };
      const session: Session = {
        tenantId,
        device,
        serial: Number(input.adminLoginSerial) || 0,
        adminLoginAt: text(input.adminLoginAt) || null,
      };
      if (session.serial && this.isDuplicate(`${device.id}:${session.serial}:${input.phase}`)) {
        return { ok: true };
      }
      if (input.phase === 'login') await this.onLogin(session, input);
      else if (input.phase === 'complete') await this.onComplete(session, input);
      else return { ok: false };
      return { ok: true };
    } catch (e) {
      this.logger.warn(`admin audit failed: ${e instanceof Error ? e.message : e}`);
      return { ok: false };
    }
  }

  private async onLogin(s: Session, input: IngestAdminAuditDto) {
    const shots = (Array.isArray(input.snapshots) ? input.snapshots : [])
      .filter((b64): b64 is string => typeof b64 === 'string' && b64.length > 100)
      .slice(0, MAX_SNAPSHOTS);
    const photos: { photoKey: string; photoUrl: string }[] = [];
    for (const b64 of shots) {
      const stored = await this.attendance.storeCapturePhoto(s.tenantId, b64, {
        maxEdge: 1280,
        quality: 80,
      });
      if (stored) photos.push({ photoKey: stored.key, photoUrl: stored.url });
    }
    const loginBy = await this.resolveLoginBy(s.tenantId, input.loginBy);
    await this.mergeAudit(
      s,
      { snapshotsAt: new Date().toISOString(), photos, ...(loginBy ? { loginBy } : {}) },
      loginBy?.employeeId ? { employeeName: loginBy.name } : {},
    );

    if (loginBy?.employeeId) {
      await this.notify(s, `Пароль администратора на терминале «${s.device.name}»`, `Вошёл: ${loginBy.name}.`);
      return;
    }
    // Matching against every staff photo can outlast the gateway's request timeout
    // (it would then resend over NATS), so it finishes in the background.
    void this.identifyAndNotify(s, shots, loginBy);
  }

  private async identifyAndNotify(s: Session, shots: string[], loginBy: LoginBy | null) {
    const identity = await this.identify(s.tenantId, shots);
    const top = identity.candidates[0];
    const probable = identity.status === 'match' && top ? top : null;
    try {
      await this.mergeAudit(s, { identity }, probable ? { employeeName: `${probable.name} (вероятно)` } : {});
    } catch (e) {
      this.logger.warn(`admin identity save failed: ${e instanceof Error ? e.message : e}`);
    }
    await this.notify(
      s,
      `Пароль администратора на терминале «${s.device.name}»`,
      this.identityLine(identity, loginBy),
    );
  }

  private async onComplete(s: Session, input: IngestAdminAuditDto) {
    const operations = (Array.isArray(input.operations) ? input.operations : [])
      .map(asJson)
      .slice(-MAX_OPERATIONS);
    const changes = await this.withEmployeeNames(
      s.tenantId,
      (Array.isArray(input.changes) ? input.changes : []).map(asJson),
    );
    const loginBy = await this.resolveLoginBy(s.tenantId, input.loginBy);
    const diffAvailable = input.diffAvailable === true;
    await this.mergeAudit(s, {
      completedAt: text(input.endedAt) || new Date().toISOString(),
      endReason: text(input.endReason) || null,
      baselineAt: text(input.baselineAt) || null,
      diffAvailable,
      operations,
      changes: changes.slice(0, MAX_STORED_CHANGES),
      changesTotal: changes.length,
      ...(loginBy ? { loginBy } : {}),
    });

    const byAdmin = changes.filter((c) => c.byServer !== true);
    const persons = byAdmin.filter((c) => c.section === 'persons');
    const added = persons.filter((c) => c.kind === 'added').length;
    const removed = persons.filter((c) => c.kind === 'removed').length;
    const parts: string[] = [];
    if (!diffAvailable) {
      parts.push('Снимка настроек до входа нет — сравнение недоступно, смотрите журнал терминала.');
    } else if (!byAdmin.length) {
      parts.push('Настройки и список персон не изменились.');
    } else {
      parts.push(
        `Изменений: ${byAdmin.length}` +
          (added || removed ? ` (персоны: добавлено ${added}, удалено ${removed})` : '') +
          '.',
      );
    }
    parts.push(`Записей в журнале терминала: ${operations.length}.`);
    await this.notify(s, `Сессия администратора на терминале «${s.device.name}» завершена`, parts.join(' '));
  }

  /** Appends to `payload.audit` of the session's problem mark (one writer per session). */
  private mergeAudit(s: Session, audit: Json, top: Json = {}) {
    return this.serialize(`${s.device.id}:${s.serial}`, async () => {
      const mark = await this.ensureMark(s);
      const payload = asJson(mark.payload);
      const prev = asJson(payload.audit);
      const next = { ...prev, ...audit };
      // The terminal's own record of who logged in beats a later, weaker one.
      if (prev.loginBy && asJson(prev.loginBy).employeeId) next.loginBy = prev.loginBy;
      await this.prisma.problemMark.update({
        where: { id: mark.id },
        data: { payload: { ...payload, ...top, audit: next } as Prisma.InputJsonValue },
      });
    });
  }

  private async ensureMark(s: Session) {
    const find = () =>
      this.prisma.problemMark.findFirst({
        where: {
          tenantId: s.tenantId,
          reason: REASON,
          AND: [
            { payload: { path: ['deviceId'], equals: s.device.id } },
            { payload: { path: ['adminLoginSerial'], equals: s.serial } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    let mark = await find();
    for (const delay of MARK_RETRY_DELAYS_MS) {
      if (mark) return mark;
      await new Promise((r) => setTimeout(r, delay));
      mark = await find();
    }
    if (mark) return mark;
    return this.prisma.problemMark.create({
      data: {
        tenantId: s.tenantId,
        reason: REASON,
        payload: {
          deviceId: s.device.id,
          deviceName: s.device.name,
          adminLoginAt: s.adminLoginAt,
          adminLoginSerial: s.serial,
          note: 'На терминале введён пароль администратора',
        },
      },
    });
  }

  private isDuplicate(key: string): boolean {
    const now = Date.now();
    for (const [k, at] of this.seen) if (now - at > DUPLICATE_WINDOW_MS) this.seen.delete(k);
    if (this.seen.has(key)) return true;
    this.seen.set(key, now);
    return false;
  }

  private serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    const tail = next.catch(() => undefined);
    this.queues.set(key, tail);
    void tail.then(() => {
      if (this.queues.get(key) === tail) this.queues.delete(key);
    });
    return next;
  }

  private async terminalPersons(tenantId: string, nos: string[]): Promise<Map<string, TerminalPerson>> {
    const wanted = [...new Set(nos.map((n) => n.trim()).filter(Boolean))];
    const out = new Map<string, TerminalPerson>();
    if (!wanted.length) return out;
    const variants = [...new Set(wanted.flatMap(terminalNoVariants))];
    const emps = await this.prisma.employee.findMany({
      where: { tenantId, OR: [{ externalId: { in: variants } }, { tabNumber: { in: variants } }] },
      select: { id: true, firstName: true, lastName: true, tabNumber: true, externalId: true },
    });
    for (const no of wanted) {
      const n = normalizeTerminalNo(no);
      const emp =
        emps.find((e) => normalizeTerminalNo(e.externalId) === n) ??
        emps.find((e) => normalizeTerminalNo(e.tabNumber) === n);
      if (emp) out.set(no, { id: emp.id, name: personName(emp), tabNumber: emp.tabNumber });
    }
    return out;
  }

  private async resolveLoginBy(tenantId: string, raw: unknown): Promise<LoginBy | null> {
    const src = asJson(raw);
    const employeeNo = text(src.employeeNo);
    const name = text(src.name);
    if (!employeeNo && !name) return null;
    const emp = employeeNo ? (await this.terminalPersons(tenantId, [employeeNo])).get(employeeNo) : undefined;
    return { employeeId: emp?.id ?? null, name: emp?.name || name || `№ ${employeeNo}`, employeeNo };
  }

  private async withEmployeeNames(tenantId: string, changes: Json[]): Promise<Json[]> {
    const nos = changes
      .filter((c) => c.section === 'persons')
      .map((c) => text(c.employeeNo))
      .filter(Boolean);
    const people = await this.terminalPersons(tenantId, nos);
    return changes.map((c) => {
      const emp = c.section === 'persons' ? people.get(text(c.employeeNo)) : undefined;
      return emp ? { ...c, employeeName: emp.name, employeeId: emp.id } : c;
    });
  }

  /** Best matches of the terminal camera frames among staff reference photos. */
  private async identify(tenantId: string, shots: string[]): Promise<Identity> {
    const threshold = this.faceMatch.threshold;
    const base: Identity = {
      status: 'no_frames',
      frames: shots.length,
      facesFound: 0,
      threshold,
      compared: 0,
      ambiguous: false,
      candidates: [],
    };
    if (!shots.length) return base;
    try {
      const probes: Float32Array[] = [];
      for (const b64 of shots) {
        const r = await this.faceMatch.embed(Buffer.from(b64, 'base64'));
        if (r.ok) probes.push(r.embedding);
      }
      if (!probes.length) return { ...base, status: 'no_face' };

      const emps = await this.prisma.employee.findMany({
        where: {
          tenantId,
          status: EmploymentStatus.active,
          OR: [
            { faceProfile: { OR: [{ photoKey: { not: null } }, { photoUrl: { not: null } }] } },
            { person: { photoUrl: { not: null } } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          tabNumber: true,
          faceProfile: { select: { photoKey: true, photoUrl: true } },
          person: { select: { photoUrl: true } },
        },
        take: MAX_IDENTITY_CANDIDATES,
      });
      const scored: Candidate[] = [];
      for (const emp of emps) {
        const ref = await this.attendance.loadReferenceFace(emp);
        if (!ref?.ok) continue;
        const score = Math.max(...probes.map((p) => this.faceMatch.similarity(p, ref.embedding)));
        scored.push({
          employeeId: emp.id,
          name: personName(emp),
          tabNumber: emp.tabNumber,
          score: Math.round(score * 1000) / 1000,
        });
      }
      scored.sort((a, b) => b.score - a.score);
      const [best, second] = scored;
      return {
        ...base,
        status: best && best.score >= threshold ? 'match' : 'unknown',
        facesFound: probes.length,
        compared: scored.length,
        ambiguous: Boolean(
          best && second && second.score >= threshold && best.score - second.score < AMBIGUOUS_MARGIN,
        ),
        candidates: scored.slice(0, TOP_CANDIDATES),
      };
    } catch (e) {
      this.logger.warn(`admin face identify failed: ${e instanceof Error ? e.message : e}`);
      return { ...base, status: 'unknown' };
    }
  }

  private identityLine(identity: Identity, loginBy: LoginBy | null) {
    const top = identity.candidates[0];
    const prefix = loginBy ? `Терминал: ${loginBy.name}. ` : '';
    if (identity.status === 'match' && top) {
      const pct = Math.round(top.score * 100);
      return `${prefix}Вероятно: ${top.name} (${pct}%)${identity.ambiguous ? ' — похож и на другого сотрудника, проверьте фото' : ''}.`;
    }
    if (identity.status === 'no_frames') return `${prefix}Камера терминала не отдала снимок.`;
    if (identity.status === 'no_face') return `${prefix}На снимках камеры лицо не найдено.`;
    return `${prefix}Лицо не совпало ни с одним сотрудником — проверьте снимки.`;
  }

  private async notify(s: Session, title: string, body: string) {
    try {
      await this.notifications.notifyTenantAdmins(s.tenantId, {
        kind: NotificationKind.alert,
        title,
        body,
        entity: 'device',
        entityId: s.device.id,
        href: PROBLEMS_HREF,
      });
    } catch (e) {
      this.logger.warn(`admin audit notify failed: ${e instanceof Error ? e.message : e}`);
    }
  }
}
