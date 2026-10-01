import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { Prisma, Role, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { employeeNameSearchWhere } from '../common/name-search';
import { runUnscoped } from '../common/data-scope';

const LOGIN_RE = /^[a-z0-9._-]{3,32}$/;
/** HR-issued passwords are one-time (the app forces a change), so they may be short. */
const ISSUED_PASSWORD_MIN = 6;
const STAFF_PASSWORD_MIN = 8;

export type MobileAccountView = {
  userId: string;
  loginName: string;
  login: string;
  isActive: boolean;
  createdAt: Date;
  passwordChangedAt: string | null;
  mustChangePassword: boolean;
};

export type IssuedCredential = {
  employeeId: string;
  tabNumber: string;
  fullName: string;
  division: string | null;
  position: string | null;
  login: string;
  password: string;
};

function metaOf(u: { meta: unknown }): Record<string, unknown> {
  return u.meta && typeof u.meta === 'object' && !Array.isArray(u.meta)
    ? (u.meta as Record<string, unknown>)
    : {};
}

export function temporaryPassword() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

/** `Lastname Firstname …` → `firstname.lastname`; falls back to the tab number. */
export function suggestLogin(fullName: string, tabNumber: string) {
  const latin = Array.from(fullName.toLowerCase(), (c) => TRANSLIT[c] ?? c)
    .join('')
    .replace(/[ʻʼ'`‘’]/g, '');
  const [last = '', first = ''] = latin.split(/\s+/);
  const byName = [first, last]
    .map((p) => p.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .join('.')
    .slice(0, 28);
  if (LOGIN_RE.test(byName)) return byName;
  return `emp${tabNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}`.slice(0, 28);
}

/**
 * Employee mobile-app accounts: a `User` (role employee) whose meta.employeeId points
 * at the card, stored as `<login>@<tenant code>.local`. In the app the employee types
 * the bare login, so logins are unique across all companies (see assertLoginFree).
 * Passwords are only ever written as bcrypt hashes — nobody can read them back.
 */
@Injectable()
export class MobileAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  private async tenantCode(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { code: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant.code.toLowerCase();
  }

  private view(u: User, tenantCode: string): MobileAccountView {
    const meta = metaOf(u);
    const isTenantLocal = u.email.toLowerCase().endsWith(`@${tenantCode}.local`);
    const loginName = isTenantLocal
      ? (typeof meta.login === 'string' && meta.login) || u.email.split('@')[0]
      : u.email;
    return {
      userId: u.id,
      loginName,
      login: loginName,
      isActive: u.isActive,
      createdAt: u.createdAt,
      passwordChangedAt:
        typeof meta.passwordChangedAt === 'string' ? meta.passwordChangedAt : null,
      mustChangePassword: meta.mustChangePassword === true,
    };
  }

  /** Linked by meta.employeeId; legacy accounts are matched by the employee e-mail. */
  private async findLinked(tenantId: string, employeeId: string, employeeEmail?: string | null) {
    const byMeta = await this.prisma.user.findFirst({
      where: { tenantId, meta: { path: ['employeeId'], equals: employeeId } },
    });
    if (byMeta || !employeeEmail) return byMeta;
    return this.prisma.user.findFirst({
      where: {
        tenantId,
        role: Role.employee,
        email: { equals: employeeEmail.trim(), mode: 'insensitive' },
      },
    });
  }

  private async requireEmployee(tenantId: string, employeeId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true, firstName: true, lastName: true, middleName: true, email: true },
    });
    if (!emp) throw new NotFoundException('Сотрудник не найден');
    return emp;
  }

  /**
   * The app signs in with a bare login, so it must not exist in any company: otherwise two
   * companies' employees with the same login could end up in each other's accounts.
   */
  private async assertLoginFree(loginName: string, exceptUserId?: string) {
    const candidates = await runUnscoped(() =>
      this.prisma.user.findMany({
        where: {
          email: { startsWith: `${loginName}@`, mode: 'insensitive' },
          ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
        },
        select: { email: true },
        take: 50,
      }),
    );
    if (candidates.some((u) => u.email.toLowerCase().split('@')[0] === loginName)) {
      throw new ConflictException(`Логин «${loginName}» уже занят — придумайте другой`);
    }
  }

  async list(tenantId: string, q?: string, filter?: 'with' | 'without' | 'blocked') {
    const code = await this.tenantCode(tenantId);
    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(q?.trim() ? employeeNameSearchWhere(q) ?? {} : {}),
      },
      select: {
        id: true,
        tabNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        email: true,
        division: { select: { name: true } },
        position: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 1000,
    });
    const users = await this.prisma.user.findMany({
      where: { tenantId, role: Role.employee },
    });
    const byEmployeeId = new Map<string, User>();
    const byEmail = new Map<string, User>();
    for (const u of users) {
      const id = metaOf(u).employeeId;
      if (typeof id === 'string') byEmployeeId.set(id, u);
      byEmail.set(u.email.toLowerCase(), u);
    }
    const items = employees.map((e) => {
      const u =
        byEmployeeId.get(e.id) ?? (e.email ? byEmail.get(e.email.trim().toLowerCase()) : undefined);
      return {
        employeeId: e.id,
        tabNumber: e.tabNumber,
        fullName: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' '),
        division: e.division?.name ?? null,
        position: e.position?.name ?? null,
        account: u ? this.view(u, code) : null,
      };
    });
    const filtered = items.filter((i) =>
      filter === 'with'
        ? !!i.account
        : filter === 'without'
          ? !i.account
          : filter === 'blocked'
            ? !!i.account && !i.account.isActive
            : true,
    );
    return {
      total: filtered.length,
      withAccount: items.filter((i) => i.account).length,
      items: filtered,
    };
  }

  async get(tenantId: string, employeeId: string) {
    const emp = await this.requireEmployee(tenantId, employeeId);
    const code = await this.tenantCode(tenantId);
    const u = await this.findLinked(tenantId, employeeId, emp.email);
    return { account: u ? this.view(u, code) : null };
  }

  /** Creates or updates the account; a new account requires a password. */
  async sync(
    tenantId: string,
    employeeId: string,
    rawLogin: string,
    password: string,
  ): Promise<{ login: string; loginName: string; created: boolean; passwordChanged: boolean } | null> {
    const loginName = rawLogin.trim().toLowerCase().split('@')[0];
    if (!loginName && !password) return null;
    if (!loginName) throw new BadRequestException('Укажите логин');
    if (!LOGIN_RE.test(loginName)) {
      throw new BadRequestException('Логин: 3–32 символа (латиница, цифры, . _ -)');
    }
    if (password && password.length < ISSUED_PASSWORD_MIN) {
      throw new BadRequestException(`Пароль: минимум ${ISSUED_PASSWORD_MIN} символов`);
    }
    const code = await this.tenantCode(tenantId);
    const emp = await runUnscoped(() =>
      this.prisma.employee.findFirst({
        where: { id: employeeId, tenantId },
        select: { firstName: true, lastName: true, middleName: true, email: true },
      }),
    );
    if (!emp) throw new NotFoundException('Сотрудник не найден');
    const linked = await this.findLinked(tenantId, employeeId, emp.email);
    const email = `${loginName}@${code}.local`;
    const login = loginName;
    const fullName =
      [emp.lastName, emp.firstName, emp.middleName].filter(Boolean).join(' ') || loginName;
    const now = new Date().toISOString();
    try {
      if (linked && linked.role !== Role.employee) {
        // Staff accounts (HR, managers…) keep their login; only the password can be reset here.
        const current = this.view(linked, code);
        if (password && password.length < STAFF_PASSWORD_MIN) {
          throw new BadRequestException(
            `Служебный аккаунт: пароль минимум ${STAFF_PASSWORD_MIN} символов`,
          );
        }
        if (password) {
          await this.prisma.user.update({
            where: { id: linked.id },
            data: {
              passwordHash: await bcrypt.hash(password, 10),
              meta: { ...metaOf(linked), passwordChangedAt: now } as Prisma.InputJsonValue,
            },
          });
        }
        return {
          login: current.login,
          loginName: current.loginName,
          created: false,
          passwordChanged: !!password,
        };
      }
      if (linked) {
        const meta = metaOf(linked);
        if (linked.email === email && !password && meta.employeeId === employeeId) {
          return { login, loginName, created: false, passwordChanged: false };
        }
        if (linked.email !== email) await this.assertLoginFree(loginName, linked.id);
        await this.prisma.user.update({
          where: { id: linked.id },
          data: {
            email,
            fullName,
            ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
            meta: {
              ...meta,
              login: loginName,
              employeeId,
              updatedAt: now,
              ...(password ? { passwordChangedAt: now, mustChangePassword: true } : {}),
            } as Prisma.InputJsonValue,
          },
        });
        return { login, loginName, created: false, passwordChanged: !!password };
      }
      if (!password) {
        throw new BadRequestException('Для нового аккаунта задайте пароль');
      }
      await this.assertLoginFree(loginName);
      await this.prisma.user.create({
        data: {
          tenantId,
          email,
          fullName,
          role: Role.employee,
          passwordHash: await bcrypt.hash(password, 10),
          meta: {
            login: loginName,
            employeeId,
            createdAt: now,
            updatedAt: now,
            passwordChangedAt: now,
            mustChangePassword: true,
          } as Prisma.InputJsonValue,
        },
      });
      return { login, loginName, created: true, passwordChanged: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Логин «${loginName}» уже занят — придумайте другой`);
      }
      throw e;
    }
  }

  /** First free variant of `base` (base, base2, base3…) across all companies and this batch. */
  private async freeLogin(base: string, reserved: Set<string>) {
    const rows = await runUnscoped(() =>
      this.prisma.user.findMany({
        where: { email: { startsWith: base, mode: 'insensitive' } },
        select: { email: true },
      }),
    );
    const taken = new Set(rows.map((r) => r.email.toLowerCase().split('@')[0]));
    for (let i = 1; i < 1000; i++) {
      const candidate = i === 1 ? base : `${base}${i}`;
      if (!taken.has(candidate) && !reserved.has(candidate)) return candidate;
    }
    throw new ConflictException(`Не удалось подобрать свободный логин для «${base}»`);
  }

  /**
   * Issues one-time numeric passwords to active employees in bulk (`without` — only those
   * without an account, `all` — also resets existing employee accounts). The plain passwords
   * are returned once and never stored; staff accounts (HR, managers…) are left untouched.
   */
  async issueTemporaryPasswords(tenantId: string, scope: 'without' | 'all') {
    const { items } = await this.list(tenantId);
    const issued: IssuedCredential[] = [];
    const skipped: { employeeId: string; fullName: string; reason: string }[] = [];
    const reserved = new Set<string>();
    for (const it of items) {
      if (it.account && scope === 'without') continue;
      if (it.account?.loginName.includes('@')) {
        skipped.push({
          employeeId: it.employeeId,
          fullName: it.fullName,
          reason: 'Служебный аккаунт — пароль меняется в «Пользователи»',
        });
        continue;
      }
      try {
        const login =
          it.account?.loginName ??
          (await this.freeLogin(suggestLogin(it.fullName, it.tabNumber), reserved));
        reserved.add(login);
        const password = temporaryPassword();
        const res = await this.sync(tenantId, it.employeeId, login, password);
        issued.push({
          employeeId: it.employeeId,
          tabNumber: it.tabNumber,
          fullName: it.fullName,
          division: it.division,
          position: it.position,
          login: res?.loginName ?? login,
          password,
        });
      } catch (e) {
        skipped.push({
          employeeId: it.employeeId,
          fullName: it.fullName,
          reason: e instanceof Error ? e.message : 'Ошибка',
        });
      }
    }
    return { issued, skipped };
  }

  async setActive(tenantId: string, employeeId: string, isActive: boolean) {
    const emp = await this.requireEmployee(tenantId, employeeId);
    const u = await this.findLinked(tenantId, employeeId, emp.email);
    if (!u) throw new NotFoundException('У сотрудника нет аккаунта');
    await this.prisma.user.update({ where: { id: u.id }, data: { isActive } });
    return this.get(tenantId, employeeId);
  }

  async remove(tenantId: string, employeeId: string) {
    const emp = await this.requireEmployee(tenantId, employeeId);
    const u = await this.findLinked(tenantId, employeeId, emp.email);
    if (!u) throw new NotFoundException('У сотрудника нет аккаунта');
    if (u.role !== Role.employee) {
      throw new BadRequestException('Это не мобильный аккаунт сотрудника — удалите его в «Пользователи»');
    }
    await this.prisma.user.delete({ where: { id: u.id } });
    return { ok: true };
  }
}
