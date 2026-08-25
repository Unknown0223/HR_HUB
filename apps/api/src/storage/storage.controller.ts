import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { EmploymentStatus, FaceSyncStatus, Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { Public, Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import {
  employeeLabel,
  isPhotoTemplate,
  matchPhotoEmployees,
} from './photo-match';

@ApiTags('storage')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('storage')
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  private requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  @Public()
  @Get('file')
  async file(@Query('key') key: string, @Res() res: Response) {
    if (!this.storage.isSafeKey(key || '')) {
      throw new BadRequestException('Invalid file key');
    }
    const buf = await this.storage.getObjectBuffer(key);
    if (!buf?.length) throw new NotFoundException('File not found');
    const lower = key.toLowerCase();
    const type = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.webp')
        ? 'image/webp'
        : lower.endsWith('.gif')
          ? 'image/gif'
          : 'image/jpeg';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(buf);
  }

  private async attachPhoto(
    tenantId: string,
    emp: { id: string; tabNumber: string; firstName: string; lastName: string },
    file: Express.Multer.File,
  ) {
    const ext = (file.mimetype?.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const key = `faces/${tenantId}/${emp.id}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    const { url, key: storedKey } = await this.storage.putObject(
      key,
      file.buffer,
      file.mimetype || 'image/jpeg',
    );
    const profile = await this.prisma.faceProfile.upsert({
      where: { employeeId: emp.id },
      create: {
        tenantId,
        employeeId: emp.id,
        photoUrl: url,
        photoKey: storedKey,
        contentType: file.mimetype,
        syncStatus: FaceSyncStatus.pending,
        lastError: null,
      },
      update: {
        photoUrl: url,
        photoKey: storedKey,
        contentType: file.mimetype,
        syncStatus: FaceSyncStatus.pending,
        lastError: null,
      },
    });
    return {
      employee: {
        id: emp.id,
        tabNumber: emp.tabNumber,
        fullName: [emp.lastName, emp.firstName].filter(Boolean).join(' '),
      },
      faceProfile: {
        id: profile.id,
        photoUrl: profile.photoUrl,
        photoKey: profile.photoKey,
        syncStatus: profile.syncStatus,
      },
    };
  }

  /**
   * Upload employee photo to MinIO (or data-URL fallback) and attach to FaceProfile.
   * Keeps Face ID sync path intact (syncStatus → pending).
   * Resolve employee via employeeId, tabNumber, or tab number in filename (e.g. 0001.jpg).
   */
  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string' },
        employeeId: { type: 'string' },
        tabNumber: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async upload(
    @CurrentTenant() tenantId: string | null,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: { kind?: string; employeeId?: string; tabNumber?: string } = {},
  ) {
    const tid = this.requireTenant(tenantId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Photo file required');
    }

    let emp =
      body.employeeId
        ? await this.prisma.employee.findFirst({
            where: { id: body.employeeId, tenantId: tid },
          })
        : null;

    if (!emp && body.tabNumber?.trim()) {
      emp = await this.prisma.employee.findFirst({
        where: { tenantId: tid, tabNumber: body.tabNumber.trim() },
      });
    }

    if (!emp) {
      const base = (file.originalname || '').replace(/\.[^.]+$/, '').trim();
      const tabFromName = base.match(/^(\d[\w-]*)/)?.[1];
      if (tabFromName) {
        emp = await this.prisma.employee.findFirst({
          where: { tenantId: tid, tabNumber: tabFromName },
        });
      }
    }

    if (!emp) {
      throw new BadRequestException(
        'Employee not found — pass employeeId/tabNumber or name file as {tabNumber}.jpg',
      );
    }

    const attached = await this.attachPhoto(tid, emp, file);
    return {
      ok: true,
      kind: body.kind ?? 'employee_photo',
      storageReady: this.storage.isReady,
      ...attached,
    };
  }

  @Roles(Role.platform_admin, Role.tenant_admin, Role.hr)
  @Post('photos/import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', 200, {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async importPhotos(
    @CurrentTenant() tenantId: string | null,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { template?: string } = {},
  ) {
    const tid = this.requireTenant(tenantId);
    if (!isPhotoTemplate(body.template)) {
      throw new BadRequestException('Шаблон обязателен');
    }
    const list = (files || []).filter((f) => f?.buffer?.length);
    if (!list.length) {
      throw new BadRequestException('Выберите папку с фотографиями');
    }

    const employees = await this.prisma.employee.findMany({
      where: { tenantId: tid, status: EmploymentStatus.active },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tabNumber: true,
        externalId: true,
      },
    });

    const items: {
      file: string;
      status: 'success' | 'warning' | 'not_found';
      employees: { id: string; tabNumber: string; fullName: string }[];
    }[] = [];

    for (const file of list) {
      const name = file.originalname || 'file';
      const matches = matchPhotoEmployees(name, body.template, employees);
      const mapped = matches.map((e) => ({
        id: e.id,
        tabNumber: e.tabNumber,
        fullName: employeeLabel(e),
      }));
      if (matches.length === 0) {
        items.push({ file: name, status: 'not_found', employees: [] });
        continue;
      }
      if (matches.length > 1) {
        items.push({ file: name, status: 'warning', employees: mapped });
        continue;
      }
      await this.attachPhoto(tid, matches[0], file);
      items.push({ file: name, status: 'success', employees: mapped });
    }

    const counts = {
      success: items.filter((i) => i.status === 'success').length,
      warning: items.filter((i) => i.status === 'warning').length,
      not_found: items.filter((i) => i.status === 'not_found').length,
    };
    return { ok: true, storageReady: this.storage.isReady, counts, items };
  }
}
