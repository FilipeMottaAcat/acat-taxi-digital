-- Drivers self-manage availability now: no more system-enforced "em viagem" lock that only
-- "Finalizar corrida" could clear. A driver accepting a call defaults to indisponivel, but can
-- flip back to disponivel themselves at any time, same as any other status change.
UPDATE "Driver" SET "operationalStatus" = 'indisponivel' WHERE "operationalStatus" = 'em_viagem';

ALTER TYPE "OperationalStatus" RENAME TO "OperationalStatus_old";
CREATE TYPE "OperationalStatus" AS ENUM ('disponivel', 'indisponivel');
ALTER TABLE "Driver" ALTER COLUMN "operationalStatus" DROP DEFAULT;
ALTER TABLE "Driver" ALTER COLUMN "operationalStatus" TYPE "OperationalStatus" USING ("operationalStatus"::text::"OperationalStatus");
ALTER TABLE "Driver" ALTER COLUMN "operationalStatus" SET DEFAULT 'disponivel';
DROP TYPE "OperationalStatus_old";
