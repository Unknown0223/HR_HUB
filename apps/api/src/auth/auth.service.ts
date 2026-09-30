import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.tenant.findUnique({
      where: { code: dto.tenantCode },
    });
    if (existing) {
      throw new ConflictException('Tenant code already exists');
    }
    const emailTaken = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (emailTaken) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    // Public signup always creates the new company's own admin.
    // Client-supplied roles (including platform_admin) are ignored/rejected by DTO.
    const role = Role.tenant_admin;

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { code: dto.tenantCode, name: dto.tenantName },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email.toLowerCase(),
          fullName: dto.fullName,
          passwordHash,
          role,
        },
      });
      return { tenant, user };
    });

    return this.tokenResponse(result.user, result.tenant);
  }

  async login(dto: LoginDto) {
    const ident = dto.email.trim().toLowerCase();
    let user = await this.prisma.user.findUnique({
      where: { email: ident },
      include: { tenant: true },
    });
    // Mobile "login@tenant" → "login@tenant.local" (Settings/employee-card convention).
    if (!user && /^[^@\s]+@[^@.\s]+$/.test(ident)) {
      user = await this.prisma.user.findUnique({
        where: { email: `${ident}.local` },
        include: { tenant: true },
      });
    }
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.assertEmployeeAccess(user);
    return this.tokenResponse(user, user.tenant);
  }

  /**
   * Sliding session for the mobile app: a still-valid token is exchanged for a fresh one,
   * re-checking everything login checks (dismissal, HR-closed access) except the password.
   */
  async refresh(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    await this.assertEmployeeAccess(user);
    return this.tokenResponse(user, user.tenant);
  }

  /** HR HUB: «Закрыть доступ к системе» — linked employee cannot sign in. */
  private async assertEmployeeAccess(user: {
    tenantId: string | null;
    role: Role;
    email: string;
    meta: unknown;
  }) {
    if (user.tenantId && user.role === Role.employee) {
      const meta = user.meta && typeof user.meta === 'object' && !Array.isArray(user.meta)
        ? (user.meta as Record<string, unknown>)
        : {};
      const linkedId =
        typeof meta.employeeId === 'string' && /^[0-9a-f-]{36}$/i.test(meta.employeeId)
          ? meta.employeeId
          : '';
      const emp = await this.prisma.employee.findFirst({
        where: linkedId
          ? { tenantId: user.tenantId, id: linkedId, status: 'active' }
          : { tenantId: user.tenantId, email: user.email, status: 'active' },
        select: { id: true },
      });
      if (linkedId && !emp) {
        throw new UnauthorizedException('Сотрудник не активен (уволен или удалён)');
      }
      if (emp) {
        const closed = await this.prisma.employeeAccessGrant.findFirst({
          where: {
            tenantId: user.tenantId,
            employeeId: emp.id,
            accessType: 'profile_flag',
            resource: 'system_access_closed',
            isActive: true,
          },
        });
        if (closed) {
          throw new UnauthorizedException(
            'Доступ к системе закрыт для этого сотрудника (HR)',
          );
        }
      }
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });
    if (!user) throw new UnauthorizedException();
    const meta =
      user.meta && typeof user.meta === 'object' && !Array.isArray(user.meta)
        ? (user.meta as Record<string, unknown>)
        : {};
    const catalogRoleIds = Array.isArray(meta.catalogRoleIds)
      ? meta.catalogRoleIds.filter((x): x is string => typeof x === 'string')
      : [];
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId,
      catalogRoleIds,
      tenant: user.tenant
        ? { id: user.tenant.id, code: user.tenant.code, name: user.tenant.name }
        : null,
    };
  }

  private tokenResponse(
    user: {
      id: string;
      email: string;
      role: Role;
      tenantId: string | null;
      fullName: string;
      meta?: unknown;
    },
    tenant: { id: string; code: string; name: string } | null,
  ) {
    const meta =
      user.meta && typeof user.meta === 'object' && !Array.isArray(user.meta)
        ? (user.meta as Record<string, unknown>)
        : {};
    const catalogRoleIds = Array.isArray(meta.catalogRoleIds)
      ? meta.catalogRoleIds.filter((x): x is string => typeof x === 'string')
      : [];
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
        catalogRoleIds,
      },
      tenant: tenant
        ? { id: tenant.id, code: tenant.code, name: tenant.name }
        : null,
    };
  }
}
