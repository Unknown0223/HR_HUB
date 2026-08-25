import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto';
import { Public } from './decorators';
import { CurrentUser, AuthUser } from './current-user.decorator';
import { SkipTenant } from '../tenant/decorators';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }
}
