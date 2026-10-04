import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService, WrongCurrentPasswordException } from './auth.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto';
import { Public } from './decorators';
import { CurrentUser, AuthUser } from './current-user.decorator';
import { SkipTenant } from '../tenant/decorators';
import { clearAuthCookie, setAuthCookie, AUTH_COOKIE_NAME, readCookie } from './auth-cookie';
import { LoginRateLimitService } from './login-rate-limit.service';
import { SessionsService, sessionClient } from './sessions.service';

function rawToken(req: Request): string | null {
  const auth = String(req.headers.authorization ?? '');
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return bearer || readCookie(req.headers.cookie, AUTH_COOKIE_NAME) || null;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly loginLimit: LoginRateLimitService,
    private readonly sessions: SessionsService,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Req() req: Request,
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(dto, sessionClient(req));
    setAuthCookie(res, result.accessToken);
    return result;
  }

  @Public()
  @Post('login')
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: LoginDto,
  ) {
    await this.loginLimit.assertAllowed(req, dto.email);
    try {
      const result = await this.auth.login(dto, sessionClient(req));
      await this.loginLimit.recordSuccess(req, dto.email);
      setAuthCookie(res, result.accessToken);
      return result;
    } catch (e) {
      if (e instanceof UnauthorizedException) {
        await this.loginLimit.recordFailure(req, dto.email);
      }
      throw e;
    }
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Post('change-password')
  async changePassword(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    const limitKey = `change-password:${user.userId}`;
    await this.loginLimit.assertAllowed(req, limitKey);
    try {
      const result = await this.auth.changePassword(
        user.userId,
        dto.currentPassword,
        dto.newPassword,
      );
      await this.loginLimit.recordSuccess(req, limitKey);
      return result;
    } catch (e) {
      if (e instanceof WrongCurrentPasswordException) {
        await this.loginLimit.recordFailure(req, limitKey);
      }
      throw e;
    }
  }

  @Public()
  @SkipTenant()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(rawToken(req));
    clearAuthCookie(res);
    return { ok: true };
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.refresh(user.userId, user.sessionId ?? null, sessionClient(req));
    setAuthCookie(res, result.accessToken);
    return result;
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId, user.sessionId ?? null);
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Get('sessions')
  listSessions(@CurrentUser() user: AuthUser) {
    return this.sessions.list(user.userId, user.sessionId ?? null);
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Post('sessions/revoke-others')
  revokeOtherSessions(@CurrentUser() user: AuthUser) {
    return this.sessions.revokeOthers(user.userId, user.sessionId ?? null);
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Delete('sessions/:id')
  revokeSession(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.revoke(user.userId, id);
  }

  /** JWT for <img src>?access_token= when httpOnly cookie cannot be read by JS. */
  @ApiBearerAuth()
  @SkipTenant()
  @Get('media-token')
  mediaToken(@Req() req: Request) {
    const raw = rawToken(req);
    if (!raw) throw new UnauthorizedException();
    return { accessToken: raw };
  }
}
