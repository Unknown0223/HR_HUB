import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePersonDto, UpdatePersonDto } from './persons.dto';

@Injectable()
export class PersonsService {
  constructor(private readonly prisma: PrismaService) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  private fioWhere(q: string): Prisma.PersonWhereInput {
    const parts = q.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return {};
    return {
      AND: parts.map((p) => ({
        OR: [
          { lastName: { contains: p, mode: 'insensitive' as const } },
          { firstName: { contains: p, mode: 'insensitive' as const } },
          { middleName: { contains: p, mode: 'insensitive' as const } },
          { code: { contains: p, mode: 'insensitive' as const } },
          { inn: { contains: p, mode: 'insensitive' as const } },
          { phone: { contains: p, mode: 'insensitive' as const } },
          { pinfl: { contains: p, mode: 'insensitive' as const } },
        ],
      })),
    };
  }

  async list(
    tenantId: string,
    opts: {
      unattached?: boolean;
      q?: string;
      fio?: string;
      gender?: string;
      birthFrom?: string;
      birthTo?: string;
      regionId?: string;
      phone?: string;
      blacklisted?: string;
      isActive?: string;
      pinned?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 50));
    const paginate = opts.page != null || opts.limit != null;
    const where: Prisma.PersonWhereInput = {
      tenantId,
      ...(opts.unattached ? { employees: { none: {} } } : {}),
      ...(opts.q ? this.fioWhere(opts.q) : {}),
      ...(opts.fio ? this.fioWhere(opts.fio) : {}),
      ...(opts.gender
        ? {
            gender: {
              in: opts.gender
                .split(',')
                .map((g) => g.trim())
                .filter(Boolean),
            },
          }
        : {}),
      ...(opts.birthFrom || opts.birthTo
        ? {
            birthDate: {
              ...(opts.birthFrom ? { gte: new Date(opts.birthFrom) } : {}),
              ...(opts.birthTo ? { lte: new Date(opts.birthTo) } : {}),
            },
          }
        : {}),
      ...(opts.regionId ? { regionId: opts.regionId } : {}),
      ...(opts.phone
        ? { phone: { contains: opts.phone, mode: 'insensitive' } }
        : {}),
      ...(opts.blacklisted === '1' || opts.blacklisted === 'true'
        ? { isBlacklisted: true }
        : opts.blacklisted === '0' || opts.blacklisted === 'false'
          ? { isBlacklisted: false }
          : {}),
      ...(opts.isActive === '1' || opts.isActive === 'true'
        ? { isActive: true }
        : opts.isActive === '0' || opts.isActive === 'false'
          ? { isActive: false }
          : {}),
      ...(opts.pinned === '1' || opts.pinned === 'true'
        ? { isPinned: true }
        : opts.pinned === '0' || opts.pinned === 'false'
          ? { isPinned: false }
          : {}),
    };

    const findArgs: Prisma.PersonFindManyArgs = {
      where,
      include: {
        region: { select: { id: true, code: true, name: true } },
        employees: {
          select: { id: true, tabNumber: true, status: true },
          take: 3,
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    };
    if (paginate) {
      findArgs.skip = (page - 1) * limit;
      findArgs.take = limit;
    } else {
      findArgs.take = 500;
    }

    const [total, items] = await Promise.all([
      this.prisma.person.count({ where }),
      this.prisma.person.findMany(findArgs),
    ]);

    if (!paginate) {
      return items;
    }

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(tenantId: string, id: string) {
    const row = await this.prisma.person.findFirst({
      where: { id, tenantId },
      include: {
        region: { select: { id: true, code: true, name: true } },
        employees: true,
      },
    });
    if (!row) throw new NotFoundException('Person not found');
    return row;
  }

  private mapCreate(dto: CreatePersonDto | UpdatePersonDto) {
    return {
      firstName: dto.firstName,
      lastName: dto.lastName,
      middleName: dto.middleName,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      gender: dto.gender,
      pinfl: dto.pinfl,
      passport: dto.passport,
      phone: dto.phone,
      email: dto.email,
      code: dto.code,
      inn: dto.inn,
      inps: dto.inps,
      nationality: dto.nationality,
      regionId: dto.regionId || null,
      addressResidence: dto.addressResidence,
      addressRegistration: dto.addressRegistration,
      photoUrl: dto.photoUrl,
      useForFaceRecognition: dto.useForFaceRecognition,
      isKeyPerson: dto.isKeyPerson,
      accessAllEmployees: dto.accessAllEmployees,
      isBlacklisted: dto.isBlacklisted,
      isActive: dto.isActive,
      isPinned: dto.isPinned,
    };
  }

  create(tenantId: string, dto: CreatePersonDto) {
    if (!dto.firstName?.trim()) {
      throw new BadRequestException('Имя обязательно');
    }
    const data = this.mapCreate(dto);
    return this.prisma.person.create({
      data: {
        tenantId,
        firstName: data.firstName!.trim(),
        lastName: (data.lastName || '').trim() || '—',
        middleName: data.middleName,
        birthDate: data.birthDate,
        gender: data.gender,
        pinfl: data.pinfl,
        passport: data.passport,
        phone: data.phone,
        email: data.email,
        code: data.code,
        inn: data.inn,
        inps: data.inps,
        nationality: data.nationality,
        regionId: data.regionId,
        addressResidence: data.addressResidence,
        addressRegistration: data.addressRegistration,
        photoUrl: data.photoUrl,
        useForFaceRecognition: data.useForFaceRecognition !== false,
        isKeyPerson: Boolean(data.isKeyPerson),
        accessAllEmployees: Boolean(data.accessAllEmployees),
        isBlacklisted: Boolean(data.isBlacklisted),
        isActive: data.isActive !== false,
        isPinned: Boolean(data.isPinned),
      },
      include: {
        region: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdatePersonDto) {
    await this.findOne(tenantId, id);
    const data = this.mapCreate(dto);
    const patch: Prisma.PersonUpdateInput = {};
    if (dto.firstName !== undefined) patch.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) patch.lastName = dto.lastName.trim();
    if (dto.middleName !== undefined) patch.middleName = dto.middleName;
    if (dto.birthDate !== undefined)
      patch.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    if (dto.gender !== undefined) patch.gender = dto.gender;
    if (dto.pinfl !== undefined) patch.pinfl = dto.pinfl;
    if (dto.passport !== undefined) patch.passport = dto.passport;
    if (dto.phone !== undefined) patch.phone = dto.phone;
    if (dto.email !== undefined) patch.email = dto.email;
    if (dto.code !== undefined) patch.code = dto.code;
    if (dto.inn !== undefined) patch.inn = dto.inn;
    if (dto.inps !== undefined) patch.inps = dto.inps;
    if (dto.nationality !== undefined) patch.nationality = dto.nationality;
    if (dto.regionId !== undefined) {
      patch.region = dto.regionId
        ? { connect: { id: dto.regionId } }
        : { disconnect: true };
    }
    if (dto.addressResidence !== undefined)
      patch.addressResidence = dto.addressResidence;
    if (dto.addressRegistration !== undefined)
      patch.addressRegistration = dto.addressRegistration;
    if (dto.photoUrl !== undefined) patch.photoUrl = dto.photoUrl;
    if (dto.useForFaceRecognition !== undefined)
      patch.useForFaceRecognition = dto.useForFaceRecognition;
    if (dto.isKeyPerson !== undefined) patch.isKeyPerson = dto.isKeyPerson;
    if (dto.accessAllEmployees !== undefined)
      patch.accessAllEmployees = dto.accessAllEmployees;
    if (dto.isBlacklisted !== undefined) patch.isBlacklisted = dto.isBlacklisted;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    if (dto.isPinned !== undefined) patch.isPinned = dto.isPinned;

    return this.prisma.person.update({
      where: { id },
      data: patch,
      include: {
        region: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.person.delete({ where: { id } });
    return { ok: true };
  }

  async bulkStatus(tenantId: string, ids: string[], isActive: boolean) {
    if (!ids.length) throw new BadRequestException('ids required');
    const result = await this.prisma.person.updateMany({
      where: { tenantId, id: { in: ids } },
      data: { isActive },
    });
    return { ok: true, count: result.count };
  }

  async bulkPin(tenantId: string, ids: string[], isPinned: boolean) {
    if (!ids.length) throw new BadRequestException('ids required');
    const result = await this.prisma.person.updateMany({
      where: { tenantId, id: { in: ids } },
      data: { isPinned },
    });
    return { ok: true, count: result.count };
  }

  async bulkDelete(tenantId: string, ids: string[]) {
    if (!ids.length) throw new BadRequestException('ids required');
    const result = await this.prisma.person.deleteMany({
      where: { tenantId, id: { in: ids } },
    });
    return { ok: true, count: result.count };
  }
}
