-- SESSION-46: free-text note about the fee, allowed for every fee type.
ALTER TABLE sessions ADD COLUMN fee_note VARCHAR(300);
