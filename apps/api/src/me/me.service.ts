import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DayStatus,
  PunchDirection,
  RequestStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { HrService } from '../hr/hr.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../auth/current-user.decorator';
import {
  MeCreateAbsenceDto,
  MeCreateRequestDto,
  MeFacePunchDto,
  MeGpsPunchDto,
  MeQrPunchDto,
  MeReviewAbsenceDto,
  MeReviewRequestDto,
} from './dto';

const MAX_GPS_ACCURACY_M = 100;

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
  ) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  /** Resolve linked Employee by matching user email within tenant. */
  async resolveEmployee(user: AuthUser) {
    const tenantId = this.requireTenant(user.tenantId);
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
    });
    if (!dbUser) throw new UnauthorizedException();

    const employee = await this.prisma.employee.findFirst({
      where: {
        tenantId,
        email: { equals: dbUser.email, mode: 'insensitive' },
        status: 'active',
      },
      include: {
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
      },
    });
    return { tenantId, dbUser, employee };
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
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    return {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.fullName,
      role: dbUser.role,
      tenantId,
      tenant: tenant
        ? { id: tenant.id, code: tenant.code, name: tenant.name }
        : null,
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
          }
        : null,
    };
  }

  async todayAttendance(user: AuthUser) {
    const { tenantId, employee } = await this.requireEmployee(user);
    const workDate = new Date();
    workDate.setHours(0, 0, 0, 0);

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
          gte: workDate,
          lt: new Date(workDate.getTime() + 24 * 60 * 60 * 1000),
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

  private inferNextDirection(
    marks: { direction: PunchDirection }[],
  ): PunchDirection {
    const last = marks[marks.length - 1];
    if (!last) return PunchDirection.IN;
    return last.direction === PunchDirection.IN
      ? PunchDirection.OUT
      : PunchDirection.IN;
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

    return this.attendance.punchGps(tenantId, {
      employeeId: employee.id,
      latitude: dto.latitude,
      longitude: dto.longitude,
      direction,
      locationId: dto.locationId,
    });
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

  /** Topbar global search — employees, persons, divisions (Verifix-like). */
  async globalSearch(user: AuthUser, q: string) {
    const query = q.trim();
    // Topbar search is tenant-scoped; without a tenant there is nothing to match.
    if (!user.tenantId || query.length < 1) {
      return { q: query, employees: [], persons: [], divisions: [] };
    }
    const tenantId = user.tenantId;
    const contains = { contains: query, mode: 'insensitive' as const };
    const [employees, persons, divisions] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          tenantId,
          OR: [
            { tabNumber: contains },
            { firstName: contains },
            { lastName: contains },
            { middleName: contains },
            { email: contains },
          ],
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
          OR: [
            { firstName: contains },
            { lastName: contains },
            { pinfl: contains },
            { passport: contains },
          ],
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
          OR: [{ code: contains }, { name: contains }],
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

  async payrollSummary(user: AuthUser) {
    const { tenantId, employee } = await this.requireEmployee(user);

    const advances = await this.prisma.payrollAdvance.findMany({
      where: { tenantId, employeeId: employee.id },
      include: {
        period: { select: { id: true, year: true, month: true, status: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 12,
    });

    const latestPeriod = await this.prisma.payrollPeriod.findFirst({
      where: { tenantId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    let periodLines: unknown[] = [];
    if (latestPeriod) {
      periodLines = await this.prisma.payrollLine.findMany({
        where: {
          tenantId,
          periodId: latestPeriod.id,
          employeeId: employee.id,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    }

    return {
      employeeId: employee.id,
      baseSalary: employee.baseSalary,
      latestPeriod: latestPeriod
        ? {
            id: latestPeriod.id,
            year: latestPeriod.year,
            month: latestPeriod.month,
            status: latestPeriod.status,
          }
        : null,
      advances,
      lines: periodLines,
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
