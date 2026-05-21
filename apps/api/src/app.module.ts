import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuditLogInterceptor } from './audit-log/audit-log.interceptor';
import { NumberingModule } from './numbering/numbering.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { PartnersModule } from './partners/partners.module';
import { ProductsModule } from './products/products.module';
import { SalesModule } from './sales/sales.module';
import { PdfModule } from './pdf/pdf.module';
import { ExpenseReceiptsModule } from './expense-receipts/expense-receipts.module';
import { JournalModule } from './journal/journal.module';
import { PaymentsModule } from './payments/payments.module';
import { TaxModule } from './tax/tax.module';
import { RisksModule } from './risks/risks.module';
import { ClosingModule } from './closing/closing.module';
import { InventoryModule } from './inventory/inventory.module';
import { FixedAssetsModule } from './fixed-assets/fixed-assets.module';
import { ProjectsModule } from './projects/projects.module';
import { AccountantPackModule } from './accountant-pack/accountant-pack.module';
import { AiModule } from './ai/ai.module';
import { BankModule } from './bank/bank.module';
import { HealthModule } from './health/health.module';
import { ReportsModule } from './reports/reports.module';
import { SystemModule } from './system/system.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    AuditLogModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    NumberingModule,
    LifecycleModule,
    PartnersModule,
    ProductsModule,
    TaxModule,
    SalesModule,
    PdfModule,
    JournalModule,
    ExpenseReceiptsModule,
    PaymentsModule,
    RisksModule,
    ClosingModule,
    InventoryModule,
    FixedAssetsModule,
    ProjectsModule,
    AccountantPackModule,
    AiModule,
    BankModule,
    HealthModule,
    ReportsModule,
    SystemModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class AppModule {}
