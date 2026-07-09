-- Capture a user's global display name and profile banner, distinct from
-- username/avatar. Both nullable: historical users (captured before this
-- migration) have nulls, and most gateway payloads don't carry the banner
-- hash, so banner stays null until a profile fetch populates it.
ALTER TABLE users ADD COLUMN display_name TEXT;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN banner_url TEXT;