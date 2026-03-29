-- Create sequence for customer IDs
CREATE SEQUENCE IF NOT EXISTS organisations_customer_id_seq;

-- Add customer_id column with auto-increment default
ALTER TABLE "organisations" ADD COLUMN "customer_id" INTEGER NOT NULL DEFAULT nextval('organisations_customer_id_seq');

-- Backfill any existing rows (they already got a value from the default)
-- Set the sequence to continue from the max existing value
SELECT setval('organisations_customer_id_seq', COALESCE((SELECT MAX("customer_id") FROM "organisations"), 0));

-- Add unique constraint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_customer_id_key" UNIQUE ("customer_id");

-- Drop slug column and its unique index
DROP INDEX IF EXISTS "organisations_slug_key";
ALTER TABLE "organisations" DROP COLUMN IF EXISTS "slug";
