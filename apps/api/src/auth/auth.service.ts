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
    const role = dto.role ?? Role.tenant_admin;

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
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { tenant: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verifix: «Закрыть доступ к системе» — linked employee cannot sign in
    if (user.tenantId && user.role === Role.employee) {
      const emp = await this.prisma.employee.findFirst({
        where: {
          tenantId: user.tenantId,
          email: user.email,
          status: 'active',
        },
        select: { id: true },
      });
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

    return this.tokenResponse(user, user.tenant);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId,
      tenant: user.tenant
        ? { id: user.tenant.id, code: user.tenant.code, name: user.tenant.name }
        : null,
    };
  }

  private tokenResponse(
    user: { id: string; email: string; role: Role; tenantId: string | null; fullName: string },
    tenant: { id: string; code: string; name: string } | null,
  ) {
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
      },
      tenant: tenant
        ? { id: tenant.id, code: tenant.code, name: tenant.name }
        : null,
    };
  }
}
