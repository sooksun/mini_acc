import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Browser, chromium } from 'playwright';

// Preview requests, the BullMQ generate worker, and accountant-pack PDF builds
// all share the single Chromium instance below. Without a bound, they pile up
// concurrent newContext()/newPage() renders and multiply each other's latency.
// A small fixed pool keeps the interactive preview path snappy under batch load.
const MAX_CONCURRENT_RENDERS = 2;

@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRendererService.name);
  private browserPromise: Promise<Browser> | null = null;

  // Classic counting semaphore: a free permit is taken on acquire; on release
  // the permit is handed directly to the next waiter (if any) or returned.
  private permits = MAX_CONCURRENT_RENDERS;
  private readonly waiters: Array<() => void> = [];

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

  private async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.permits++;
  }

  async render(html: string): Promise<Buffer> {
    await this.acquire();
    try {
      const browser = await this.getBrowser();
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        // Templates are self-contained HTML/CSS with no external network, so
        // 'load' is sufficient. 'networkidle' would burn its fixed ~500ms
        // idle-wait window on every single render for no benefit here.
        await page.setContent(html, { waitUntil: 'load' });
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
    } finally {
      this.release();
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
