import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(200)
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      throw new ServiceUnavailableException({
        status: 'DOWN',
        db: 'unreachable',
        error: (e as Error).message,
      });
    }
    return {
      status: 'UP',
      db: 'reachable',
      timestamp: new Date().toISOString(),
    };
  }
}
