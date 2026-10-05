import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto';
import { SessionsService, type SessionClient } from './sessions.service';

/** 400, not 401: clients treat 401 as an expired session and sign the user out. */
export class WrongCurrentPasswordException extends BadRequestException {
  constructor() {
    super('Текущий пароль неверный');
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
  ) {}

  async register(dto: RegisterDto, client: SessionClient = {}) {
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

    const sid = await this.sessions.start(result.user.id, client);
    return this.tokenResponse(result.user, result.tenant, sid);
  }

  async login(dto: LoginDto, client: SessionClient = {}) {
    const user = await this.findLoginUser(dto.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.assertEmployeeAccess(user);
    const sid = await this.sessions.start(user.id, client);
    return this.tokenResponse(user, user.tenant, sid);
  }

  /** Ends the session the token belongs to; an expired or foreign token is simply ignored. */
  async logout(rawToken: string | null) {
    if (!rawToken) return;
    try {
      const payload = this.jwt.verify<{ sub: string; sid?: string }>(rawToken, { ignoreExpiration: true });
      if (payload.sid) await this.sessions.revoke(payload.sub, payload.sid);
    } catch {
      /* already ended or not ours */
    }
  }

  /**
   * Accepted identifiers: full email; `login@<tenant code>` (stored as `login@<code>.local`);
   * a bare `login`, which must match exactly one account across all companies — never guess
   * between same-named accounts of different companies.
   */
  async findLoginUser(rawIdent: string) {
    const ident = rawIdent.trim().toLowerCase();
    const byEmail = (email: string) =>
      this.prisma.user.findUnique({ where: { email }, include: { tenant: true } });

    if (ident.includes('@')) {
      const suffix = ident.slice(ident.indexOf('@') + 1);
      return (await byEmail(ident)) ?? (suffix && !suffix.includes('.') ? byEmail(`${ident}.local`) : null);
    }
    if (!ident) return null;
    const matches = (
      await this.prisma.user.findMany({
        where: { email: { startsWith: `${ident}@` } },
        include: { tenant: true },
        take: 50,
      })
    ).filter((u) => u.email.toLowerCase().split('@')[0] === ident);
    return matches.length === 1 ? matches[0] : null;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new WrongCurrentPasswordException();
    await this.storeNewPassword(user, newPassword);
    return { ok: true };
  }

  /** Forgot-password: the caller has already verified a one-time code; every session is ended. */
  async resetPassword(userId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    await this.storeNewPassword(user, newPassword);
    await this.sessions.revokeOthers(user.id, null);
    return { ok: true };
  }

  private async storeNewPassword(
    user: { id: string; passwordHash: string; meta: unknown },
    newPassword: string,
  ) {
    const next = newPassword.trim();
    if (next.length < 8) throw new BadRequestException('Пароль: минимум 8 символов');
    if (await bcrypt.compare(next, user.passwordHash)) {
      throw new BadRequestException('Новый пароль совпадает с текущим');
    }
    const meta: Record<string, unknown> =
      user.meta && typeof user.meta === 'object' && !Array.isArray(user.meta)
        ? { ...(user.meta as Record<string, unknown>) }
        : {};
    delete meta.mustChangePassword;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(next, 10),
        meta: { ...meta, passwordChangedAt: new Date().toISOString() } as Prisma.InputJsonValue,
      },
    });
  }

  /** Sign-in without a password, after the user approved it from the linked Telegram chat. */
  async loginApproved(userId: string, client: SessionClient = {}) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    await this.assertEmployeeAccess(user);
    const sid = await this.sessions.start(user.id, client);
    return this.tokenResponse(user, user.tenant, sid);
  }

  /** Same gate as login (dismissed / HR-closed employees), without throwing. */
  async canSignIn(user: { tenantId: string | null; role: Role; email: string; meta: unknown }) {
    try {
      await this.assertEmployeeAccess(user);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sliding session for the mobile app: a still-valid token is exchanged for a fresh one,
   * re-checking everything login checks (dismissal, HR-closed access) except the password.
   */
  async refresh(userId: string, sessionId: string | null, client: SessionClient = {}) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    await this.assertEmployeeAccess(user);
    const sid = sessionId ?? (await this.sessions.start(user.id, client));
    return this.tokenResponse(user, user.tenant, sid);
  }

  /** Worklyn: «Закрыть доступ к системе» — linked employee cannot sign in. */
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

  async me(userId: string, sessionId: string | null = null) {
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
    const [employeeId, previousLoginAt] = await Promise.all([
      this.linkedEmployeeId(user.tenantId, user.email, meta),
      this.sessions.previousLoginAt(user.id, sessionId),
    ]);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId,
      catalogRoleIds,
      employeeId,
      previousLoginAt,
      tenant: user.tenant
        ? {
            id: user.tenant.id,
            code: user.tenant.code,
            name: user.tenant.name,
          }
        : null,
    };
  }

  /** Same rule as MeService.resolveEmployee: explicit meta.employeeId link first, then e-mail. */
  private async linkedEmployeeId(tenantId: string | null, email: string, meta: Record<string, unknown>) {
    if (!tenantId) return null;
    const linkedId =
      typeof meta.employeeId === 'string' && /^[0-9a-f-]{36}$/i.test(meta.employeeId) ? meta.employeeId : null;
    const emp = await this.prisma.employee.findFirst({
      where: linkedId
        ? { tenantId, id: linkedId }
        : { tenantId, email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    return emp?.id ?? null;
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
    sid: string,
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
      sid,
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
        ? {
            id: tenant.id,
            code: tenant.code,
            name: tenant.name,
          }
        : null,
    };
  }
}
