-- Drivers now start "disponivel" (available) instead of "indisponivel" — sessions
-- persist indefinitely (30-day rolling cookie, no auto-logout), so a newly created
-- driver should be dispatchable right away rather than requiring a manual first toggle.
ALTER TABLE "Driver" ALTER COLUMN "operationalStatus" SET DEFAULT 'disponivel';

-- Backfill: drivers that are currently stuck at the old default should become available too.
UPDATE "Driver" SET "operationalStatus" = 'disponivel' WHERE "operationalStatus" = 'indisponivel';
