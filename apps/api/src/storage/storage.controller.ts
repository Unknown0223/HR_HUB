import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { EmploymentStatus, FaceSyncStatus, Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { Public, Roles } from '../auth/decorators';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { SkipTenant } from '../tenant/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_COOKIE_NAME, readCookie } from '../auth/auth-cookie';
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
    private readonly jwt: JwtService,
  ) {}

  private requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  /**
   * Employee face / attendance mark photos.
   * Auth: Bearer or access_token query (so <img src> still works).
   * Tenant: key must be faces|{marks}/{callerTenantId}/… (platform_admin: any tenant).
   */
  @Public()
  @SkipTenant()
  @Get('file')
  @ApiQuery({ name: 'key', required: true })
  @ApiQuery({
    name: 'access_token',
    required: false,
    description: 'JWT if Authorization header cannot be sent (img tags)',
  })
  async file(
    @Query('key') key: string,
    @Query('access_token') accessToken: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = await this.requireFileUser(req, accessToken);
    if (!this.storage.isSafeKey(key || '')) {
      throw new BadRequestException('Invalid file key');
    }
    const keyTenantId = this.storage.tenantIdFromKey(key);
    if (!keyTenantId) {
      throw new BadRequestException('Invalid file key');
    }
    if (user.role !== Role.platform_admin && user.tenantId !== keyTenantId) {
      throw new ForbiddenException('Tenant mismatch');
    }
    let buf = await this.storage.getObjectBuffer(key);
    if (!buf?.length) {
      const profile = await this.prisma.faceProfile.findFirst({
        where: { photoKey: key, tenantId: keyTenantId },
        select: { photoUrl: true },
      });
      buf = decodeDataUrl(profile?.photoUrl);
      // Seed / import often keeps an external avatar URL while MinIO has no object yet
      if (!buf?.length && isSafeExternalPhotoUrl(profile?.photoUrl)) {
        return res.redirect(302, profile!.photoUrl!);
      }
    }
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

  private async requireFileUser(
    req: Request,
    accessToken?: string,
  ): Promise<{ role: Role; tenantId: string | null }> {
    const auth = String(req.headers.authorization ?? '');
    const bearer = auth.toLowerCase().startsWith('bearer ')
      ? auth.slice(7).trim()
      : '';
    const raw =
      bearer ||
      String(accessToken ?? '').trim() ||
      readCookie(req.headers.cookie, AUTH_COOKIE_NAME) ||
      '';
    if (!raw) throw new UnauthorizedException();
    let sub: string;
    try {
      const payload = this.jwt.verify<{ sub?: string }>(raw);
      sub = String(payload?.sub || '');
    } catch {
      throw new UnauthorizedException();
    }
    if (!sub) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({
      where: { id: sub },
      select: { role: true, tenantId: true, isActive: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    return { role: user.role, tenantId: user.tenantId };
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

function decodeDataUrl(photoUrl?: string | null): Buffer | null {
  if (!photoUrl?.startsWith('data:')) return null;
  const idx = photoUrl.indexOf('base64,');
  if (idx < 0) return null;
  try {
    const buf = Buffer.from(photoUrl.slice(idx + 7), 'base64');
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

/** Allow redirect only to http(s) avatar hosts we already stored — not open redirect. */
function isSafeExternalPhotoUrl(photoUrl?: string | null): boolean {
  if (!photoUrl) return false;
  try {
    const u = new URL(photoUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    // Never bounce back into our own file proxy (loop)
    if (u.pathname.includes('/api/storage/file')) return false;
    return true;
  } catch {
    return false;
  }
}
