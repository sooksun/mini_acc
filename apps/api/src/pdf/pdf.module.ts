import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PdfController } from './pdf.controller';
import { PdfGenerationService, PDF_QUEUE } from './pdf-generation.service';
import { PdfJobProcessor } from './pdf-job.processor';
import { PdfRendererService } from './pdf-renderer.service';
import { PdfTemplateService } from './pdf-template.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const url = cfg.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        const u = new URL(url);
        return {
          connection: {
            host: u.hostname,
            port: Number(u.port || 6379),
            ...(u.username ? { username: u.username } : {}),
            ...(u.password ? { password: u.password } : {}),
          },
        };
      },
    }),
    BullModule.registerQueue({ name: PDF_QUEUE }),
  ],
  controllers: [PdfController],
  providers: [
    PdfRendererService,
    PdfTemplateService,
    PdfGenerationService,
    PdfJobProcessor,
  ],
  exports: [PdfGenerationService],
})
export class PdfModule {}
