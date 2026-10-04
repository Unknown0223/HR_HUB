import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_COOKIE_NAME, readCookie } from './auth-cookie';
import { resolveJwtSecret } from './jwt-secret';
import { SessionsService } from './sessions.service';
import { SCOPED_ROLES, setRequestScope } from '../common/data-scope';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string | null;
  sid?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req) =>
          readCookie(req?.headers?.cookie, AUTH_COOKIE_NAME) || null,
      ]),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config),
    });
  }

  async validate(payload: JwtPayload) {
    const [user, sessionActive] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: payload.sub } }),
      payload.sid ? this.sessions.isActive(payload.sid, payload.sub) : Promise.resolve(true),
    ]);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User inactive or not found');
    }
    if (!sessionActive) {
      throw new UnauthorizedException('Сеанс завершён');
    }
    if (SCOPED_ROLES.has(user.role)) {
      const rows = await this.prisma.userAccessScope.findMany({
        where: { userId: user.id },
        select: { kind: true, resourceId: true },
      });
      setRequestScope({
        locationIds: rows.filter((r) => r.kind === 'location').map((r) => r.resourceId),
        employeeIds: rows.filter((r) => r.kind === 'employee').map((r) => r.resourceId),
      });
    } else {
      setRequestScope(null);
    }
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      sessionId: payload.sid ?? null,
    };
  }
}
