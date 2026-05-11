import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { AuthUser, LoginResponse } from '@hj/shared-types';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../audit-log/audit-log.decorator';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @AuditAction('LOGIN', { entityType: 'User', getEntityId: (_req, res) => res?.user?.id })
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @AuditAction('LOGOUT')
  logout(): void {
    return;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
