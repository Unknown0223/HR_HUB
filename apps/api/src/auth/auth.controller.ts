import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto';
import { Public } from './decorators';
import { CurrentUser, AuthUser } from './current-user.decorator';
import { SkipTenant } from '../tenant/decorators';
import { clearAuthCookie, setAuthCookie, AUTH_COOKIE_NAME, readCookie } from './auth-cookie';
import { LoginRateLimitService } from './login-rate-limit.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly loginLimit: LoginRateLimitService,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(dto);
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
    this.loginLimit.assertAllowed(req, dto.email);
    try {
      const result = await this.auth.login(dto);
      this.loginLimit.recordSuccess(req, dto.email);
      setAuthCookie(res, result.accessToken);
      return result;
    } catch (e) {
      if (e instanceof UnauthorizedException) {
        this.loginLimit.recordFailure(req, dto.email);
      }
      throw e;
    }
  }

  @Public()
  @SkipTenant()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookie(res);
    return { ok: true };
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }

  /** JWT for <img src>?access_token= when httpOnly cookie cannot be read by JS. */
  @ApiBearerAuth()
  @SkipTenant()
  @Get('media-token')
  mediaToken(@Req() req: Request) {
    const auth = String(req.headers.authorization ?? '');
    const bearer = auth.toLowerCase().startsWith('bearer ')
      ? auth.slice(7).trim()
      : '';
    const raw =
      bearer ||
      readCookie(req.headers.cookie, AUTH_COOKIE_NAME) ||
      '';
    if (!raw) throw new UnauthorizedException();
    return { accessToken: raw };
  }
}
