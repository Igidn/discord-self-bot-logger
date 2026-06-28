-- Persist how many attachments a message had, independent of whether the
-- attachment downloader is enabled. This gives a reliable signal that a
-- message had images/files even when no rows exist in the `attachments`
-- table, so the UI can distinguish real system events from image-only logs.
ALTER TABLE messages ADD COLUMN attachment_count INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Backfill counts for messages whose attachments were already stored.
-- Messages captured while attachment downloading was disabled keep 0 and
-- remain indistinguishable from true system events (unavoidable).
UPDATE messages
SET attachment_count = COALESCE((
  SELECT count(*) FROM attachments WHERE attachments.message_id = messages.id
), 0);