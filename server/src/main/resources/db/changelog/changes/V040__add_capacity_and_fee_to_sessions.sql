-- SESSION-5: session capacity + fee/pricing. capacity is required going forward (enforced by
-- CreateSessionRequest, not just this column) but sessions created before this ticket (and
-- auto-generated group-recurring sessions, which have no capacity/fee input) have none - 9999 is
-- a sentinel meaning "uncapped". feeType defaults to FREE for the same rows. feeAmountVnd is
-- meaningful only when fee_type = 'FIXED', validated at the service layer, not the schema.
ALTER TABLE sessions ADD COLUMN capacity INTEGER NOT NULL DEFAULT 9999;
ALTER TABLE sessions ADD COLUMN fee_type VARCHAR(10) NOT NULL DEFAULT 'FREE';
ALTER TABLE sessions ADD COLUMN fee_amount_vnd BIGINT;
