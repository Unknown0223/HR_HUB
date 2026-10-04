import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AdvanceStatus,
  DayStatus,
  DocumentLifecycle,
  NotificationKind,
  Prisma,
  PunchDirection,
  RequestStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import {
  startOfLocalDay,
  startOfNextLocalDay,
  workDateOnly,
} from '../attendance/attendance-day';
import { HrService } from '../hr/hr.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../auth/current-user.decorator';
import {
  MeCreateAbsenceDto,
  MeCreateRequestDto,
  MeFacePunchDto,
  MeGpsCheckDto,
  MeGpsPunchDto,
  MeLocationIntegrityDto,
  MeFaceVerifyDto,
  MeMobilePunchDto,
  MeMockLocationReportDto,
  MeQrPunchDto,
  MeReviewAbsenceDto,
  MeReviewRequestDto,
} from './dto';
import {
  employeeNameSearchWhere,
  personNameSearchWhere,
  searchTokens,
} from '../common/name-search';
import { runUnscoped } from '../common/data-scope';
import { checkGpsJump } from '../tracking/gps-jump';
import { StorageService } from '../storage/storage.service';
import { summarizePayroll } from './payroll-summary';
import { decodeDataUrl, photoRef } from './photo-ref';

const MAX_GPS_ACCURACY_M = 100;
/** ~15 KB JPEG — anything smaller cannot hold a back photo plus a selfie inset. */
const MIN_PHOTO_REPORT_B64 = 20_000;

const MOCK_LOCATION_WARNING =
  'Telefoningizda soxta lokatsiya (uchinchi tomon ilovasi yoki o‘zgartirilgan GPS) aniqlandi. ' +
  'Siz ruxsatsiz tizimdan foydalanib davomat qoidalarini aylanib o‘tishga urindingiz — belgi qabul qilinmadi. ' +
  'Bu holat HR bo‘limiga yuborildi; takrorlansa akkauntingiz qora ro‘yxatga tushirilishi va bloklanishi mumkin. ' +
  'Soxta GPS ilovasini o‘chirib, «Dasturchi sozlamalari»dagi mock lokatsiyani bekor qiling.';

function integrityFlagged(i?: MeLocationIntegrityDto): boolean {
  return !!i && (i.mockLocation === true || !!i.activeMockApp?.trim());
}

function stripDataUrl(b64: string): string {
  const raw = (b64 ?? '').trim();
  return raw.startsWith('data:') && raw.includes(',')
    ? raw.slice(raw.indexOf(',') + 1)
    : raw;
}

function faceMobileMockEnabled(): boolean {
  const v = (process.env.FACE_MOBILE_MOCK ?? '1').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
}

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly hr: HrService,
    private readonly notificationsService: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  /** Resolve the caller's Employee: explicit meta.employeeId link first, then email match. */
  async resolveEmployee(user: AuthUser) {
    const tenantId = this.requireTenant(user.tenantId);
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
    });
    if (!dbUser) throw new UnauthorizedException();

    const meta = dbUser.meta && typeof dbUser.meta === 'object' && !Array.isArray(dbUser.meta)
      ? (dbUser.meta as Record<string, unknown>)
      : {};
    const linkedId =
      typeof meta.employeeId === 'string' && /^[0-9a-f-]{36}$/i.test(meta.employeeId)
        ? meta.employeeId
        : '';

    const include = {
      division: { select: { id: true, code: true, name: true } },
      position: { select: { id: true, code: true, name: true } },
      schedule: {
        select: {
          id: true,
          code: true,
          name: true,
          startTime: true,
          endTime: true,
          graceMinutes: true,
        },
      },
    } satisfies Prisma.EmployeeInclude;

    // The caller's own card must resolve even when their branch scope does not cover it.
    const employee = await runUnscoped(async () =>
      (linkedId
        ? await this.prisma.employee.findFirst({
            where: { tenantId, id: linkedId, status: 'active' },
            include,
          })
        : null) ??
      this.prisma.employee.findFirst({
        where: {
          tenantId,
          email: { equals: dbUser.email, mode: 'insensitive' },
          status: 'active',
        },
        include,
      }),
    );
    return { tenantId, dbUser, employee };
  }

  /**
   * Employees the given employee leads: everyone active in the divisions they
   * manage and all nested sub-divisions. Based on the org chart, so it ignores
   * the caller's branch scope.
   */
  async subordinateIds(tenantId: string, managerEmployeeId: string): Promise<string[]> {
    return runUnscoped(async () => {
      const divisions = await this.prisma.division.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, parentId: true, managerId: true },
      });
      const children = new Map<string, string[]>();
      for (const d of divisions) {
        if (!d.parentId) continue;
        const list = children.get(d.parentId) ?? [];
        list.push(d.id);
        children.set(d.parentId, list);
      }
      const led = new Set<string>();
      const queue = divisions.filter((d) => d.managerId === managerEmployeeId).map((d) => d.id);
      while (queue.length) {
        const id = queue.pop()!;
        if (led.has(id)) continue;
        led.add(id);
        queue.push(...(children.get(id) ?? []));
      }
      if (!led.size) return [];
      const rows = await this.prisma.employee.findMany({
        where: {
          tenantId,
          status: 'active',
          divisionId: { in: [...led] },
          NOT: { id: managerEmployeeId },
        },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    });
  }

  async requireEmployee(user: AuthUser) {
    const resolved = await this.resolveEmployee(user);
    if (!resolved.employee) {
      throw new BadRequestException(
        'User is not linked to an active employee (email must match)',
      );
    }
    return { ...resolved, employee: resolved.employee };
  }

  private async assertMarksAllowed(tenantId: string, employeeId: string) {
    const blocked = await this.prisma.employeeAccessGrant.findFirst({
      where: {
        tenantId,
        employeeId,
        accessType: 'profile_flag',
        resource: 'marks_blocked',
        isActive: true,
      },
    });
    if (blocked) {
      throw new BadRequestException(
        'Отметки заблокированы для этого сотрудника (HR)',
      );
    }
  }

  async getProfile(user: AuthUser) {
    const { tenantId, dbUser, employee } = await this.resolveEmployee(user);
    const [tenant, team, photoUrl] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      employee ? this.subordinateIds(tenantId, employee.id) : Promise.resolve([]),
      employee ? this.employeePhoto(tenantId, employee.id) : Promise.resolve(null),
    ]);

    return {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.fullName,
      role: dbUser.role,
      tenantId,
      tenant: tenant
        ? { id: tenant.id, code: tenant.code, name: tenant.name }
        : null,
      mustChangePassword:
        !!dbUser.meta &&
        typeof dbUser.meta === 'object' &&
        (dbUser.meta as Record<string, unknown>).mustChangePassword === true,
      employee: employee
        ? {
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            middleName: employee.middleName,
            tabNumber: employee.tabNumber,
            email: employee.email,
            phone: employee.phone,
            division: employee.division,
            position: employee.position,
            schedule: employee.schedule,
            photoUrl,
          }
        : null,
      teamSize: team.length,
    };
  }

  async todayAttendance(user: AuthUser) {
    const { tenantId, employee } = await this.requireEmployee(user);
    const now = new Date();
    const workDate = workDateOnly(now);

    const day = await this.prisma.attendanceDay.findUnique({
      where: {
        tenantId_employeeId_workDate: {
          tenantId,
          employeeId: employee.id,
          workDate,
        },
      },
    });

    const marks = await this.prisma.attendanceMark.findMany({
      where: {
        tenantId,
        employeeId: employee.id,
        occurredAt: {
          gte: startOfLocalDay(now),
          lt: startOfNextLocalDay(now),
        },
      },
      orderBy: { occurredAt: 'asc' },
    });

    const nextDirection = this.inferNextDirection(marks);

    return {
      date: workDate.toISOString().slice(0, 10),
      status: day?.status ?? DayStatus.not_started,
      firstIn: day?.firstInAt ?? null,
      lastOut: day?.lastOutAt ?? null,
      lateMinutes: day?.lateMinutes ?? 0,
      marks,
      nextDirection,
      schedule: employee.schedule,
    };
  }

  /** Day roles are positional (first = приход, later = уход), so any valid mark today means the next one is OUT. */
  private inferNextDirection(
    marks: { direction: PunchDirection; rawPayload?: Prisma.JsonValue }[],
  ): PunchDirection {
    const hasValid = marks.some((m) => {
      const p = m.rawPayload;
      return !(p && typeof p === 'object' && !Array.isArray(p) && p.isValid === false);
    });
    return hasValid ? PunchDirection.OUT : PunchDirection.IN;
  }

  async listMarks(user: AuthUser, from?: string, to?: string) {
    const { tenantId, employee } = await this.requireEmployee(user);
    return this.attendance.listMarks(tenantId, {
      employeeId: employee.id,
      from,
      to,
      limit: 200,
    });
  }

  async listMyRequests(user: AuthUser) {
    const { tenantId, employee } = await this.requireEmployee(user);

    const [absences, requests] = await Promise.all([
      this.prisma.absence.findMany({
        where: { tenantId, employeeId: employee.id },
        include: { absenceType: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.hrRequest.findMany({
        where: {
          tenantId,
          OR: [
            { employeeId: employee.id },
            { createdByUserId: user.userId },
          ],
        },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              tabNumber: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { absences, requests };
  }

  listAbsenceTypes(user: AuthUser) {
    const tenantId = this.requireTenant(user.tenantId);
    return this.hr.listAbsenceTypes(tenantId);
  }

  async createAbsence(user: AuthUser, dto: MeCreateAbsenceDto) {
    const { tenantId, employee } = await this.requireEmployee(user);
    return this.hr.createAbsence(tenantId, {
      employeeId: employee.id,
      absenceTypeId: dto.absenceTypeId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      note: dto.note,
    });
  }

  async createRequest(user: AuthUser, dto: MeCreateRequestDto) {
    const { tenantId, employee } = await this.requireEmployee(user);
    return this.hr.createRequest(
      tenantId,
      {
        employeeId: employee.id,
        type: dto.type,
        title: dto.title,
        payload: dto.payload ?? (dto.note ? { note: dto.note } : undefined),
        visibility: 'inbox',
        createdByUserId: user.userId,
      },
      user.userId,
    );
  }

  async inbox(user: AuthUser) {
    this.assertApprover(user);
    const tenantId = this.requireTenant(user.tenantId);

    const [absences, requests] = await Promise.all([
      this.prisma.absence.findMany({
        where: { tenantId, status: RequestStatus.pending },
        include: {
          absenceType: true,
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              tabNumber: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.hr.listRequests(tenantId, {
        status: RequestStatus.pending,
        scope: 'available',
        userId: user.userId,
      }),
    ]);

    return { absences, requests };
  }

  async reviewRequest(user: AuthUser, id: string, dto: MeReviewRequestDto) {
    this.assertApprover(user);
    const tenantId = this.requireTenant(user.tenantId);
    return this.hr.reviewRequest(
      tenantId,
      id,
      dto,
      user.email ?? user.userId,
    );
  }

  async reviewAbsence(user: AuthUser, id: string, dto: MeReviewAbsenceDto) {
    this.assertApprover(user);
    const tenantId = this.requireTenant(user.tenantId);
    return this.hr.updateAbsenceStatus(tenantId, id, dto.status);
  }

  async punchGps(user: AuthUser, dto: MeGpsPunchDto) {
    const { tenantId, employee } = await this.requireEmployee(user);
    await this.assertMarksAllowed(tenantId, employee.id);

    if (dto.accuracy != null && dto.accuracy > MAX_GPS_ACCURACY_M) {
      throw new BadRequestException(
        `GPS accuracy too low: ${Math.round(dto.accuracy)} m (max ${MAX_GPS_ACCURACY_M} m)`,
      );
    }

    const today = await this.todayAttendance(user);
    const direction = dto.direction ?? today.nextDirection;

    const result = await this.attendance.punchGps(tenantId, {
      employeeId: employee.id,
      latitude: dto.latitude,
      longitude: dto.longitude,
      direction,
      locationId: dto.locationId,
      accuracy: dto.accuracy,
      comment: dto.comment,
    });
    void this.checkPunchJump(tenantId, employee, dto, result);
    return result;
  }

  /** A punch far from where background tracking saw the phone minutes ago is flagged for HR. */
  private checkPunchJump(
    tenantId: string,
    employee: { id: string; lastName: string; firstName: string },
    at: { latitude: number; longitude: number; accuracy?: number },
    result: object,
  ) {
    return checkGpsJump(
      { prisma: this.prisma, notifications: this.notificationsService },
      {
        tenantId,
        employeeId: employee.id,
        employeeName: [employee.lastName, employee.firstName].filter(Boolean).join(' '),
        source: 'punch',
        markId: 'markId' in result && typeof result.markId === 'string' ? result.markId : undefined,
        points: [
          { lat: at.latitude, lng: at.longitude, at: Date.now(), accuracy: at.accuracy ?? null, speed: null },
        ],
      },
    );
  }

  /** Phone check-in / check-out with liveness + composite photo report. */
  async punchMobile(user: AuthUser, dto: MeMobilePunchDto) {
    const { tenantId, employee } = await this.requireEmployee(user);
    await this.assertMarksAllowed(tenantId, employee.id);

    if (integrityFlagged(dto.integrity)) {
      await this.reportMockLocation(user, {
        integrity: dto.integrity!,
        latitude: dto.latitude,
        longitude: dto.longitude,
      });
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MOCK_LOCATION_DETECTED',
        message: MOCK_LOCATION_WARNING,
      });
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

    const photo = stripDataUrl(dto.photoBase64);
    if (photo.length < MIN_PHOTO_REPORT_B64) {
      throw new BadRequestException('Foto-hisobot topilmadi yoki juda kichik');
    }

    const today = await this.todayAttendance(user);
    const hasValidMark = today.marks.some((m) => {
      const p = m.rawPayload;
      return !(p && typeof p === 'object' && !Array.isArray(p) && p.isValid === false);
    });
    if (dto.direction === 'OUT' && !hasValidMark) {
      throw new BadRequestException('Avval kirish belgisini qo‘ying');
    }
    if (dto.direction === 'IN' && hasValidMark) {
      throw new BadRequestException('Bugun kirish allaqachon qayd etilgan');
    }

    const result = await this.attendance.punchMobile(tenantId, {
      employeeId: employee.id,
      direction: dto.direction === 'IN' ? PunchDirection.IN : PunchDirection.OUT,
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracy: dto.accuracy,
      photoBase64: photo,
      selfieBase64: dto.selfieBase64 ? stripDataUrl(dto.selfieBase64) || undefined : undefined,
      liveness: { steps, durationMs: dto.liveness.durationMs },
      comment: dto.comment,
      integrity: dto.integrity
        ? ({ ...dto.integrity } as Record<string, unknown>)
        : undefined,
    });
    void this.checkPunchJump(tenantId, employee, dto, result);
    return result;
  }

  async faceReference(user: AuthUser) {
    const { tenantId, employee } = await this.requireEmployee(user);
    return this.attendance.faceReference(tenantId, employee.id);
  }

  async verifyFace(user: AuthUser, dto: MeFaceVerifyDto) {
    const { tenantId, employee } = await this.requireEmployee(user);
    const selfie = stripDataUrl(dto.selfieBase64);
    if (!selfie) throw new BadRequestException('Selfi topilmadi');
    return this.attendance.verifyFaceAttempt(
      tenantId,
      employee.id,
      dto.direction === 'IN' ? PunchDirection.IN : PunchDirection.OUT,
      selfie,
    );
  }

  /**
   * Fake-GPS detected on the phone: warn the employee and alert HR.
   * HR alerts are throttled to one per employee per 10 minutes.
   */
  async reportMockLocation(user: AuthUser, dto: MeMockLocationReportDto) {
    const { tenantId, employee } = await this.requireEmployee(user);
    const name = [employee.lastName, employee.firstName].filter(Boolean).join(' ');
    const apps = [dto.integrity.activeMockApp, ...(dto.integrity.mockApps ?? [])]
      .filter((a): a is string => !!a)
      .filter((a, i, all) => all.indexOf(a) === i);

    const recent = await this.prisma.problemMark.findFirst({
      where: {
        tenantId,
        reason: 'mock_location',
        createdAt: { gte: new Date(Date.now() - 10 * 60_000) },
        payload: { path: ['employeeId'], equals: employee.id },
      },
      select: { id: true },
    });

    await this.prisma.problemMark.create({
      data: {
        tenantId,
        reason: 'mock_location',
        payload: {
          employeeId: employee.id,
          employeeName: name,
          userId: user.userId,
          integrity: { ...dto.integrity },
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    if (!recent) {
      await this.prisma.notification.create({
        data: {
          tenantId,
          userId: user.userId,
          kind: NotificationKind.alert,
          title: 'Soxta lokatsiya aniqlandi',
          body: MOCK_LOCATION_WARNING,
        },
      });
      await this.notificationsService.notifyApprovers(tenantId, {
        kind: NotificationKind.alert,
        title: `Soxta lokatsiya: ${name}`,
        body:
          `Xodim telefonda lokatsiyani soxtalashtiruvchi ilovadan foydalanib belgi qo‘yishga urindi.` +
          (apps.length ? ` Ilova: ${apps.join(', ')}.` : ''),
        entity: 'employee',
        entityId: employee.id,
      });
    }

    return { ok: true, blocked: true, message: MOCK_LOCATION_WARNING };
  }

  /**
   * Pre-flight for the app before a phone punch: is this point inside a geofence
   * (comment needed?) and how many head-turn directions the liveness check uses.
   */
  async checkGps(user: AuthUser, dto: MeGpsCheckDto) {
    const { tenantId } = await this.requireEmployee(user);
    const [fence, livenessDirections] = await Promise.all([
      this.attendance.resolveGeofence(tenantId, dto.latitude, dto.longitude, dto.locationId),
      this.attendance.livenessDirections(tenantId),
    ]);
    if (!fence) {
      return { configured: false, inside: false, commentRequired: false, livenessDirections };
    }
    return { configured: true, ...fence, commentRequired: !fence.inside, livenessDirections };
  }

  async punchQr(user: AuthUser, dto: MeQrPunchDto) {
    const { tenantId, employee } = await this.requireEmployee(user);
    await this.assertMarksAllowed(tenantId, employee.id);
    const today = await this.todayAttendance(user);
    const direction = dto.direction ?? today.nextDirection;

    return this.attendance.punchQr(tenantId, {
      qrCode: dto.qrCode,
      employeeId: employee.id,
      direction,
    });
  }

  /**
   * In-app Face ID punch. Uses enrolled FaceProfile metadata when present;
   * otherwise (or when FACE_MOBILE_MOCK≠0) accepts a camera selfie / mock
   * so emulators and demos work without Hikvision/ZK hardware.
   */
  async punchFace(user: AuthUser, dto: MeFacePunchDto) {
    const { tenantId, employee } = await this.requireEmployee(user);
    await this.assertMarksAllowed(tenantId, employee.id);
    const today = await this.todayAttendance(user);
    const direction = dto.direction ?? today.nextDirection;

    const face = await this.prisma.faceProfile.findUnique({
      where: { employeeId: employee.id },
    });

    const rawImage = (dto.faceImageBase64 ?? '').trim();
    const image =
      rawImage.includes(',') && rawImage.startsWith('data:')
        ? rawImage.slice(rawImage.indexOf(',') + 1)
        : rawImage;
    const hasImage = image.length >= 80;
    const mockOk = faceMobileMockEnabled() || dto.mock === true;

    let mode: string;
    if (hasImage && face?.photoUrl) {
      mode = 'mobile_camera_vs_profile_mock';
    } else if (hasImage) {
      mode = 'mobile_camera_mock';
    } else if (mockOk) {
      mode = 'mock_no_camera';
    } else {
      throw new BadRequestException(
        'Face selfie required (set FACE_MOBILE_MOCK=1 for emulator demo)',
      );
    }

    const occurredAt = new Date().toISOString();
    const result = await this.attendance.ingestPunch({
      tenantId,
      employeeId: employee.id,
      direction,
      occurredAt,
      source: 'mobile_face',
      raw: {
        product: 'HR HUB',
        verified: true,
        mode,
        faceProfileId: face?.id ?? null,
        faceSyncStatus: face?.syncStatus ?? null,
        imageProvided: hasImage,
        imageBytesApprox: hasImage ? Math.round((image.length * 3) / 4) : 0,
        client: 'flutter_mobile',
      },
    });

    return {
      ...result,
      direction,
      occurredAt,
      verified: true,
      mode,
      source: 'mobile_face',
      faceProfile: face
        ? {
            id: face.id,
            syncStatus: face.syncStatus,
            hasPhoto: !!face.photoUrl,
          }
        : null,
    };
  }

  async teamToday(user: AuthUser) {
    this.assertApprover(user);
    const tenantId = this.requireTenant(user.tenantId);
    return this.attendance.listDays(tenantId, { date: undefined, limit: 500 });
  }

  async listNotifications(user: AuthUser, unreadOnly?: boolean) {
    // The app shell polls this on every page. A platform_admin has no tenant,
    // so return an empty feed instead of erroring the whole topbar.
    if (!user.tenantId) return [];
    return this.notificationsService.list(
      user.tenantId,
      user.userId,
      !!unreadOnly,
    );
  }

  async markNotificationRead(user: AuthUser, id: string) {
    const tenantId = this.requireTenant(user.tenantId);
    return this.notificationsService.markRead(tenantId, user.userId, id);
  }

  async markAllNotificationsRead(user: AuthUser) {
    const tenantId = this.requireTenant(user.tenantId);
    return this.notificationsService.markAllRead(tenantId, user.userId);
  }

  async deleteNotification(user: AuthUser, id: string) {
    const tenantId = this.requireTenant(user.tenantId);
    return this.notificationsService.deleteOne(tenantId, user.userId, id);
  }

  async clearNotifications(user: AuthUser) {
    if (!user.tenantId) return { deleted: 0 };
    return this.notificationsService.clearAll(user.tenantId, user.userId);
  }

  /** Topbar global search — employees, persons, divisions (catalog-like). */
  async globalSearch(user: AuthUser, q: string) {
    const query = q.trim();
    // Topbar search is tenant-scoped; without a tenant there is nothing to match.
    if (!user.tenantId || query.length < 1) {
      return { q: query, employees: [], persons: [], divisions: [] };
    }
    const tenantId = user.tenantId;
    const empWhere = employeeNameSearchWhere(query);
    const personWhere = personNameSearchWhere(query);
    const divTokens = searchTokens(query);
    const [employees, persons, divisions] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          tenantId,
          ...(empWhere ?? {}),
        },
        select: {
          id: true,
          tabNumber: true,
          firstName: true,
          lastName: true,
          status: true,
        },
        take: 12,
        orderBy: { lastName: 'asc' },
      }),
      this.prisma.person.findMany({
        where: {
          tenantId,
          ...(personWhere ?? {}),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          pinfl: true,
          passport: true,
        },
        take: 8,
        orderBy: { lastName: 'asc' },
      }),
      this.prisma.division.findMany({
        where: {
          tenantId,
          ...(divTokens.length
            ? {
                AND: divTokens.map((token) => ({
                  OR: [
                    { code: { contains: token, mode: 'insensitive' as const } },
                    { name: { contains: token, mode: 'insensitive' as const } },
                  ],
                })),
              }
            : {}),
        },
        select: { id: true, code: true, name: true },
        take: 8,
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      q: query,
      employees: employees.map((e) => ({
        ...e,
        href: `/employees/${e.id}`,
        label: `${e.lastName} ${e.firstName} (${e.tabNumber})`,
      })),
      persons: persons.map((p) => ({
        ...p,
        href: `/catalog/persons`,
        label: `${p.lastName} ${p.firstName}`,
      })),
      divisions: divisions.map((d) => ({
        ...d,
        href: `/divisions?tab=divisions`,
        label: `${d.name} (${d.code})`,
      })),
    };
  }

  /** Face-profile photo first (what the web card shows), then the person's photo. */
  private async employeePhotoRaw(tenantId: string, employeeId: string): Promise<string | null> {
    const row = await runUnscoped(() =>
      this.prisma.employee.findFirst({
        where: { tenantId, id: employeeId },
        select: {
          faceProfile: { select: { photoUrl: true, photoKey: true } },
          person: { select: { photoUrl: true } },
        },
      }),
    );
    return this.storage.mediaUrl(
      row?.faceProfile?.photoKey,
      row?.faceProfile?.photoUrl ?? row?.person?.photoUrl,
    );
  }

  private async employeePhoto(tenantId: string, employeeId: string): Promise<string | null> {
    return photoRef(employeeId, await this.employeePhotoRaw(tenantId, employeeId));
  }

  /** Bytes behind a `photoRef` link: the caller's own photo, their team's, or any for HR. */
  async photo(user: AuthUser, employeeId: string) {
    const { tenantId, employee } = await this.resolveEmployee(user);
    const staff = user.role === Role.platform_admin || user.role === Role.tenant_admin || user.role === Role.hr;
    if (!staff && employee?.id !== employeeId) {
      const team = employee ? await this.subordinateIds(tenantId, employee.id) : [];
      if (!team.includes(employeeId)) throw new ForbiddenException();
    }
    const url = await this.employeePhotoRaw(tenantId, employeeId);
    const decoded = url ? decodeDataUrl(url) : null;
    if (!decoded?.body.length) throw new NotFoundException('Фото не найдено');
    return decoded;
  }

  /**
   * Nearest leader up the org chart: the head of the employee's division, or of a parent
   * division when the employee heads their own.
   */
  private async managerOf(tenantId: string, employeeId: string, divisionId: string | null) {
    if (!divisionId) return null;
    const divisions = await this.prisma.division.findMany({
      where: { tenantId },
      select: { id: true, parentId: true, managerId: true },
    });
    const byId = new Map(divisions.map((d) => [d.id, d]));
    const seen = new Set<string>();
    let cur = byId.get(divisionId);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.managerId && cur.managerId !== employeeId) {
        const m = await this.prisma.employee.findFirst({
          where: { tenantId, id: cur.managerId },
          select: { id: true, firstName: true, lastName: true, middleName: true, phone: true },
        });
        if (m) {
          return {
            id: m.id,
            fullName: [m.lastName, m.firstName, m.middleName].filter(Boolean).join(' '),
            phone: m.phone,
          };
        }
      }
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return null;
  }

  /** Own HR card for the mobile profile: personal data, contacts, work info, ids, documents. */
  async getDetails(user: AuthUser) {
    const { tenantId, employee } = await this.requireEmployee(user);
    return runUnscoped(async () => {
      const emp = await this.prisma.employee.findFirstOrThrow({
        where: { tenantId, id: employee.id },
        include: {
          region: { select: { name: true } },
          person: { include: { region: { select: { name: true } } } },
        },
      });
      const person = emp.person;
      const [manager, docs, docTypes] = await Promise.all([
        this.managerOf(tenantId, emp.id, emp.divisionId),
        this.prisma.personDocument.findMany({
          where: {
            tenantId,
            OR: [{ employeeId: emp.id }, ...(person ? [{ personId: person.id }] : [])],
          },
          orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
        }),
        this.prisma.dictionary.findFirst({
          where: { tenantId, code: 'doc_types' },
          include: { items: { select: { code: true, name: true } } },
        }),
      ]);
      const typeName = new Map((docTypes?.items ?? []).map((i) => [i.code, i.name]));
      const schedule = employee.schedule;

      return {
        id: emp.id,
        tabNumber: emp.tabNumber,
        lastName: emp.lastName,
        firstName: emp.firstName,
        middleName: emp.middleName,
        birthDate: person?.birthDate ?? null,
        gender: person?.gender ?? null,
        nationality: person?.nationality ?? null,
        phone: emp.phone ?? person?.phone ?? null,
        email: emp.email ?? person?.email ?? null,
        telegram: emp.telegramUsername?.replace(/^@/, '') || null,
        region: emp.region?.name ?? person?.region?.name ?? null,
        addressResidence: person?.addressResidence ?? null,
        addressRegistration: person?.addressRegistration ?? null,
        division: employee.division?.name ?? null,
        position: employee.position?.name ?? null,
        employmentType: emp.employmentType,
        hiredAt: emp.hiredAt,
        schedule: schedule
          ? { name: schedule.name, startTime: schedule.startTime, endTime: schedule.endTime }
          : null,
        manager,
        pinfl: person?.pinfl ?? null,
        inn: person?.inn ?? null,
        inps: person?.inps ?? null,
        photoUrl: await this.employeePhoto(tenantId, emp.id),
        documents: docs.map((d) => ({
          id: d.id,
          type: d.docType,
          typeName: typeName.get(d.docType) ?? d.docType,
          number: d.docNumber,
          issuedAt: d.issuedAt,
          expiresAt: d.expiresAt,
          issuer: d.issuer,
        })),
      };
    });
  }

  /** One payroll month (defaults to the current one) split into accruals, withholdings and advances. */
  async payrollSummary(user: AuthUser, year?: number, month?: number) {
    const { tenantId, employee } = await this.requireEmployee(user);
    const now = new Date();
    const y = year && Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : now.getFullYear();
    const m = month && Number.isInteger(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1;
    const baseSalary = employee.baseSalary == null ? null : Number(employee.baseSalary);

    const period = await this.prisma.payrollPeriod.findUnique({
      where: { tenantId_year_month: { tenantId, year: y, month: m } },
    });
    if (!period) {
      return {
        employeeId: employee.id,
        year: y,
        month: m,
        baseSalary,
        period: null,
        ...summarizePayroll([], []),
        periodAdvances: [],
      };
    }

    const [lines, advances] = await Promise.all([
      this.prisma.payrollLine.findMany({
        where: {
          tenantId,
          periodId: period.id,
          employeeId: employee.id,
          status: DocumentLifecycle.posted,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.payrollAdvance.findMany({
        where: {
          tenantId,
          periodId: period.id,
          employeeId: employee.id,
          status: AdvanceStatus.paid,
        },
        orderBy: { paidAt: 'asc' },
      }),
    ]);

    return {
      employeeId: employee.id,
      year: y,
      month: m,
      baseSalary,
      period: { id: period.id, year: period.year, month: period.month, status: period.status },
      ...summarizePayroll(lines, advances.map((a) => a.amount)),
      periodAdvances: advances.map((a) => ({
        id: a.id,
        amount: Number(a.amount),
        paidAt: a.paidAt,
        note: a.note,
      })),
    };
  }

  private assertApprover(user: AuthUser) {
    const allowed: string[] = [
      Role.platform_admin,
      Role.tenant_admin,
      Role.hr,
      Role.manager,
    ];
    if (!allowed.includes(user.role)) {
      throw new ForbiddenException('Insufficient role for inbox/team');
    }
  }
}
