import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto, UpdateTenantDto } from './dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async create(dto: CreateTenantDto) {
    try {
      return await this.prisma.tenant.create({
        data: { code: dto.code, name: dto.name },
      });
    } catch {
      throw new ConflictException('Tenant code already exists');
    }
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.findOne(id);
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }
}
