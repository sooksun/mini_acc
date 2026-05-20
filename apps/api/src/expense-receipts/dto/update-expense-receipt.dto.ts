import { UploadExpenseReceiptDto } from './upload-expense-receipt.dto';

/**
 * Editable fields for an already-uploaded expense receipt. Same shape as the
 * upload DTO (all fields optional, with the same money/taxId transforms) minus
 * the file itself — the stored file is not replaced here, only the metadata
 * (vendor proposal, dates, category, amounts) the operator corrects before
 * accounting.
 */
export class UpdateExpenseReceiptDto extends UploadExpenseReceiptDto {}
