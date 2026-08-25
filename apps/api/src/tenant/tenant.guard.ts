import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../auth/decorators';
import { SKIP_TENANT_KEY } from './decorators';

export const TENANT_HEADER = 'x-tenant-id';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skipTenant = this.reflector.getAllAndOverride<boolean>(
      SKIP_TENANT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const req = context.switchToHttp().getRequest();
    const user = req.user as
      | { role?: Role; tenantId?: string | null }
      | undefined;

    const headerTenant =
      (req.headers[TENANT_HEADER] as string | undefined) ??
      (req.headers['X-Tenant-Id'] as string | undefined);

    if (user?.role === Role.platform_admin) {
      req.tenantId = headerTenant ?? user.tenantId ?? null;
      return true;
    }

    if (skipTenant) {
      req.tenantId = user?.tenantId ?? headerTenant ?? null;
      return true;
    }

    const tenantId = user?.tenantId ?? headerTenant;
    if (!tenantId) {
      throw new BadRequestException(
        'Tenant context required (X-Tenant-Id header or user.tenantId)',
      );
    }

    if (user?.tenantId && headerTenant && user.tenantId !== headerTenant) {
      throw new ForbiddenException('Tenant mismatch');
    }

    req.tenantId = user?.tenantId ?? headerTenant;
    return true;
  }
}
