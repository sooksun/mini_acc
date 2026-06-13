-- Drop three single-column indexes on JournalEntryLine that no query ever
-- filters on. Lines are always loaded via the parent JournalEntry relation and
-- filtered in JS (reports P&L, journal list, accountant-pack), so these indexes
-- were pure write-side overhead on a fast-growing table.

-- DropIndex
DROP INDEX `JournalEntryLine_accountCode_idx` ON `JournalEntryLine`;

-- DropIndex
DROP INDEX `JournalEntryLine_partnerId_idx` ON `JournalEntryLine`;

-- DropIndex
DROP INDEX `JournalEntryLine_projectId_idx` ON `JournalEntryLine`;
