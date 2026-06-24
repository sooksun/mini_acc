import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, NormalBalance, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChartAccountDto } from './dto/create-chart-account.dto';
import { UpdateChartAccountDto } from './dto/update-chart-account.dto';

@Injectable()
export class ChartAccountsService {
  constructor(private prisma: PrismaService) {}

  list(companyId: string, opts?: { activeOnly?: boolean; type?: AccountType }) {
    return this.prisma.chartAccount.findMany({
      where: {
        companyId,
        ...(opts?.activeOnly ? { isActive: true } : {}),
        ...(opts?.type ? { type: opts.type } : {}),
      },
      orderBy: { code: 'asc' },
    });
  }

  async create(companyId: string, dto: CreateChartAccountDto) {
    const code = dto.code.trim();
    const normalBalance =
      dto.normalBalance ?? this.defaultNormalBalance(dto.type);
    try {
      return await this.prisma.chartAccount.create({
        data: {
          companyId,
          code,
          name: dto.name.trim(),
          type: dto.type,
          normalBalance,
          isSystem: false,
          isActive: dto.isActive ?? true,
          note: dto.note?.trim() || null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({ code: 'ACCOUNT_CODE_EXISTS', accountCode: code });
      }
      throw e;
    }
  }

  async update(companyId: string, id: string, dto: UpdateChartAccountDto) {
    const account = await this.requireOwn(companyId, id);

    const data: Prisma.ChartAccountUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.note !== undefined) data.note = dto.note.trim() || null;

    if (account.isSystem) {
      // System accounts: only the display name and note are editable. Their
      // code, type, normalBalance, and active flag are structural — automated
      // posting and report classification depend on them.
      if (dto.type !== undefined || dto.normalBalance !== undefined || dto.isActive !== undefined) {
        throw new ForbiddenException({
          code: 'SYSTEM_ACCOUNT_STRUCTURE_LOCKED',
          message: 'บัญชีระบบแก้ไขได้เฉพาะชื่อและหมายเหตุ',
        });
      }
    } else {
      // Re-typing an account retroactively reclassifies every historical posting
      // to that code across the trial balance, balance sheet, and year-end close
      // — so once it has posted lines, its type/normalBalance are frozen (rename
      // + deactivate are still allowed). Create a new account instead.
      const changingClass =
        (dto.type !== undefined && dto.type !== account.type) ||
        (dto.normalBalance !== undefined && dto.normalBalance !== account.normalBalance);
      if (changingClass) {
        const used = await this.prisma.journalEntryLine.count({
          where: { accountCode: account.code, journalEntry: { companyId } },
        });
        if (used > 0) {
          throw new ConflictException({
            code: 'ACCOUNT_TYPE_LOCKED_IN_USE',
            message: `บัญชีนี้ถูกใช้ในสมุดรายวัน ${used} รายการ — เปลี่ยนประเภท/ด้านยอดไม่ได้ ให้สร้างบัญชีใหม่แทน`,
            usageCount: used,
          });
        }
      }
      if (dto.type !== undefined) data.type = dto.type;
      if (dto.normalBalance !== undefined) data.normalBalance = dto.normalBalance;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
    }

    return this.prisma.chartAccount.update({ where: { id }, data });
  }

  async remove(companyId: string, id: string) {
    const account = await this.requireOwn(companyId, id);
    if (account.isSystem) {
      throw new ForbiddenException({
        code: 'SYSTEM_ACCOUNT_PROTECTED',
        message: 'ลบบัญชีระบบไม่ได้ — ปิดใช้งานแทนหากไม่ต้องการใช้',
      });
    }
    // A code referenced by any journal line must survive so historical reports
    // can still resolve it. Deactivate instead of delete.
    const used = await this.prisma.journalEntryLine.count({
      where: { accountCode: account.code, journalEntry: { companyId } },
    });
    if (used > 0) {
      throw new ConflictException({
        code: 'ACCOUNT_IN_USE',
        message: `บัญชีนี้ถูกใช้ในสมุดรายวัน ${used} รายการ — ปิดใช้งานแทนการลบ`,
        usageCount: used,
      });
    }
    await this.prisma.chartAccount.delete({ where: { id } });
    return { deleted: true };
  }

  private async requireOwn(companyId: string, id: string) {
    const account = await this.prisma.chartAccount.findFirst({ where: { id, companyId } });
    if (!account) throw new NotFoundException('Chart account not found');
    return account;
  }

  private defaultNormalBalance(type: AccountType): NormalBalance {
    return type === AccountType.ASSET || type === AccountType.EXPENSE
      ? NormalBalance.DEBIT
      : NormalBalance.CREDIT;
  }
}
