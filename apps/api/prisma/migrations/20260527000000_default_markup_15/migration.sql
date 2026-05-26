-- Change the company default sell-price markup from 30% to 15% (buy-and-resell house default).
ALTER TABLE `Company` MODIFY `defaultMarkupPercent` DECIMAL(5, 2) NOT NULL DEFAULT 15;

-- Bring existing companies still sitting on the old untouched default in line with the new one.
-- Guarded to 30 so a value an owner deliberately configured is never clobbered.
UPDATE `Company` SET `defaultMarkupPercent` = 15.00 WHERE `defaultMarkupPercent` = 30.00;
