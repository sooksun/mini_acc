import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { SystemService } from './system.service';
import { ResetBaselineDto } from './dto/reset-baseline.dto';

@Controller('system')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Post('reset-baseline')
  @Roles('OWNER')
  resetBaseline(@CurrentUser() user: AuthUser, @Body() _dto: ResetBaselineDto) {
    return this.system.resetBaseline(user.companyId, user.id);
  }
}
