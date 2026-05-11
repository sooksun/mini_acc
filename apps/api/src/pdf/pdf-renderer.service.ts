import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Browser, chromium } from 'playwright';

@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRendererService.name);
  private browserPromise: Promise<Browser> | null = null;

  private getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.logger.log('Launching shared Chromium instance');
      this.browserPromise = chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browserPromise;
  }

  async render(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
        preferCSSPageSize: true,
      });
      return pdf;
    } finally {
      await ctx.close();
    }
  }

  async onModuleDestroy() {
    if (this.browserPromise) {
      const browser = await this.browserPromise;
      await browser.close().catch(() => undefined);
      this.browserPromise = null;
      this.logger.log('Closed Chromium instance');
    }
  }
}
