import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthUser, DocumentStatus } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TRANSITIONS, getAvailableTransitions } from './transitions';

@Controller('lifecycle')
@UseGuards(JwtAuthGuard)
export class LifecycleController {
  @Get('transitions')
  registry() {
    return TRANSITIONS;
  }

  @Get('available')
  available(@CurrentUser() user: AuthUser, @Query('from') from?: DocumentStatus) {
    if (!from) return [];
    return getAvailableTransitions(from, user.role);
  }
}
