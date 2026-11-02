ALTER TABLE attendance_settings ADD COLUMN require_location boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE attendance_settings DROP CONSTRAINT attendance_enabled_location;
--> statement-breakpoint
ALTER TABLE attendance_settings ADD CONSTRAINT attendance_enabled_location CHECK (
 NOT (enabled AND require_location) OR
 (latitude IS NOT NULL AND longitude IS NOT NULL AND max_accuracy_meters <= radius_meters)
);
