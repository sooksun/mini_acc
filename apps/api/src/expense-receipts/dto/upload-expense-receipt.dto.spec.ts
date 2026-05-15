import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UploadExpenseReceiptDto } from './upload-expense-receipt.dto';
import { ApproveExpenseVendorDto } from './approve-expense-vendor.dto';

async function validateDto<T extends object>(cls: new () => T, input: unknown): Promise<string[]> {
  const dto = plainToInstance(cls, input);
  const errors = await validate(dto as object, { whitelist: true, forbidNonWhitelisted: true });
  return errors.flatMap((e) =>
    Object.entries(e.constraints ?? {}).map(([code]) => `${e.property}:${code}`),
  );
}

describe('UploadExpenseReceiptDto', () => {
  describe('H2 — money fields', () => {
    it('accepts plain decimal', async () => {
      const errs = await validateDto(UploadExpenseReceiptDto, { subtotal: '1234.56' });
      expect(errs).toEqual([]);
    });

    it('accepts comma-formatted then strips to canonical', async () => {
      const dto = plainToInstance(UploadExpenseReceiptDto, { grandTotal: '1,234.56' });
      const errs = await validate(dto as object);
      expect(errs).toEqual([]);
      expect(dto.grandTotal).toBe('1234.56');
    });

    it('rejects non-numeric', async () => {
      const errs = await validateDto(UploadExpenseReceiptDto, { vatAmount: 'abc' });
      expect(errs).toContain('vatAmount:matches');
    });

    it('rejects scientific notation', async () => {
      const errs = await validateDto(UploadExpenseReceiptDto, { subtotal: '1e3' });
      expect(errs).toContain('subtotal:matches');
    });

    it('rejects 3 decimal places', async () => {
      const errs = await validateDto(UploadExpenseReceiptDto, { withholdingTaxAmount: '1.234' });
      expect(errs).toContain('withholdingTaxAmount:matches');
    });
  });

  describe('M6 — Thai tax id', () => {
    it('accepts plain 13 digits', async () => {
      const errs = await validateDto(UploadExpenseReceiptDto, { vendorTaxId: '0573567001472' });
      expect(errs).toEqual([]);
    });

    it('strips dashes/spaces then validates', async () => {
      const dto = plainToInstance(UploadExpenseReceiptDto, { vendorTaxId: '0573-567-001472' });
      const errs = await validate(dto as object);
      expect(errs).toEqual([]);
      expect(dto.vendorTaxId).toBe('0573567001472');
    });

    it('rejects 12 digits', async () => {
      const errs = await validateDto(UploadExpenseReceiptDto, { vendorTaxId: '057356700147' });
      expect(errs).toContain('vendorTaxId:matches');
    });

    it('rejects 14 digits', async () => {
      const errs = await validateDto(UploadExpenseReceiptDto, { vendorTaxId: '05735670014720' });
      expect(errs).toContain('vendorTaxId:matches');
    });

    it('rejects letters', async () => {
      const errs = await validateDto(UploadExpenseReceiptDto, { vendorTaxId: '057356700147A' });
      expect(errs).toContain('vendorTaxId:matches');
    });
  });

  describe('M5 — date strings', () => {
    it('rejects invalid month', async () => {
      // class-validator's IsDateString uses isISO8601; "2026-13-45" is not valid ISO.
      const errs = await validateDto(UploadExpenseReceiptDto, { documentDate: '2026-13-45' });
      expect(errs).toContain('documentDate:isDateString');
    });

    it('accepts ISO with timezone', async () => {
      const errs = await validateDto(UploadExpenseReceiptDto, {
        documentDate: '2026-05-15T00:00:00+07:00',
      });
      expect(errs).toEqual([]);
    });
  });
});

describe('ApproveExpenseVendorDto', () => {
  it('strips tax id separators', async () => {
    const dto = plainToInstance(ApproveExpenseVendorDto, { taxId: '0573 567 001472' });
    const errs = await validate(dto as object);
    expect(errs).toEqual([]);
    expect(dto.taxId).toBe('0573567001472');
  });

  it('rejects 13 digit tax id with letter mixed', async () => {
    const errs = await validateDto(ApproveExpenseVendorDto, { taxId: '057356700A472' });
    expect(errs).toContain('taxId:matches');
  });

  it('allows empty body (all fields optional)', async () => {
    const errs = await validateDto(ApproveExpenseVendorDto, {});
    expect(errs).toEqual([]);
  });
});
