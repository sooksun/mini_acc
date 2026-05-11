import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { NumberingService } from './numbering.service';
import { PeekNumberDto } from './dto/peek.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('numbering')
@UseGuards(JwtAuthGuard)
export class NumberingController {
  constructor(
    private numbering: NumberingService,
    private prisma: PrismaService,
  ) {}

  @Get('rules')
  rules(@CurrentUser() user: AuthUser) {
    return this.prisma.documentNumberingRule.findMany({
      where: { companyId: user.companyId },
      orderBy: { type: 'asc' },
    });
  }

  @Post('peek')
  async peek(@CurrentUser() user: AuthUser, @Body() dto: PeekNumberDto) {
    const number = await this.numbering.peek(user.companyId, dto.type, dto.documentDate);
    return { number };
  }
}
