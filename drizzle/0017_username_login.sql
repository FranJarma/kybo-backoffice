ALTER TABLE "user" ADD COLUMN username text;
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT user_username_unique UNIQUE (username);
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT user_username_valid CHECK (username IS NULL OR username ~ '^[a-z0-9_.]{3,30}$');
