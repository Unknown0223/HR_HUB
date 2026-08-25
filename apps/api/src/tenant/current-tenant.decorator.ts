import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const req = ctx.switchToHttp().getRequest();
    return (req.tenantId as string | null | undefined) ?? null;
  },
);
