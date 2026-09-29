import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { currentEmployeeScope, scopedEmployeeWhere } from '../common/data-scope';

const SCOPED_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

const MODELS_WITH_EMPLOYEE = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) =>
      m.fields.some((f) => f.name === 'employee' && f.type === 'Employee' && f.kind === 'object'),
    )
    .map((m) => m.name),
);

function withExtraWhere(args: unknown, extra: object) {
  const a = (args ?? {}) as { where?: Record<string, unknown> };
  const where = a.where ?? {};
  const prevAnd = where.AND;
  const and = Array.isArray(prevAnd) ? prevAnd : prevAnd ? [prevAnd] : [];
  return { ...a, where: { ...where, AND: [...and, extra] } };
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
    // Non-admin users only see employees inside their assigned locations/employees.
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const scope = currentEmployeeScope();
            if (!scope || !SCOPED_OPERATIONS.has(operation)) return query(args);
            if (model === 'Employee') {
              return query(withExtraWhere(args, scopedEmployeeWhere(scope)) as typeof args);
            }
            if (MODELS_WITH_EMPLOYEE.has(model)) {
              return query(
                withExtraWhere(args, { employee: { is: scopedEmployeeWhere(scope) } }) as typeof args,
              );
            }
            return query(args);
          },
        },
      },
    }) as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
