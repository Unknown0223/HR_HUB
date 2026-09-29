-- Fix recorded while the phone had no working internet (uploaded later from its queue).
ALTER TABLE "gps_track_points" ADD COLUMN IF NOT EXISTS "offline" BOOLEAN;
