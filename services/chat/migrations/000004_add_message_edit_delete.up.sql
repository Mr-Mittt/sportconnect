-- CHAT-13: edit/delete support. Both are nullable "when" markers, not
-- booleans — matches this app's existing soft-delete convention
-- (User.isActive/Group.isActive use a flag, but chat needs a timestamp to
-- show "edited at 3:04pm"-style UI, so a nullable timestamp does double
-- duty as both the flag and the display value).
--
-- Deleting a message also scrubs content (application-side, see
-- internal/message.Repository.Delete) so a soft-deleted row's original text
-- is never re-served by the history endpoint — deleted_at alone marks that
-- it happened; content is intentionally not retained here.
ALTER TABLE chat_messages
    ADD COLUMN edited_at TIMESTAMPTZ NULL,
    ADD COLUMN deleted_at TIMESTAMPTZ NULL;
