-- Comissários: rode uma vez no Postgres de produção se o deploy ainda não aplicou o schema.
-- Alternativa: na máquina local, com DATABASE_URL de produção:
--   cd backend && npx prisma db push

DO $$ BEGIN
  CREATE TYPE "CommissionerCourtesyMode" AS ENUM ('none', 'immediate', 'on_goal');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EventCommissioner" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "producerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "validUntil" TIMESTAMP(3),
  "courtesyMode" "CommissionerCourtesyMode" NOT NULL DEFAULT 'none',
  "courtesyGoal" INTEGER,
  "courtesyTicketTierId" TEXT,
  "courtesyIssuedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventCommissioner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventCommissioner_eventId_code_key"
  ON "EventCommissioner"("eventId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "EventCommissioner_eventId_userId_key"
  ON "EventCommissioner"("eventId", "userId");
CREATE INDEX IF NOT EXISTS "EventCommissioner_producerId_idx"
  ON "EventCommissioner"("producerId");

DO $$ BEGIN
  ALTER TABLE "EventCommissioner"
    ADD CONSTRAINT "EventCommissioner_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventCommissioner"
    ADD CONSTRAINT "EventCommissioner_producerId_fkey"
    FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventCommissioner"
    ADD CONSTRAINT "EventCommissioner_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "EventCommissioner" ADD COLUMN IF NOT EXISTS "validFrom" TIMESTAMP(3);
ALTER TABLE "EventCommissioner" ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "EventCommissioner" ADD COLUMN IF NOT EXISTS "maxUses" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "EventCommissioner" ADD COLUMN IF NOT EXISTS "usedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EventCommissioner" ADD COLUMN IF NOT EXISTS "maxUsesPerBuyer" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "EventCommissionerTicketTier" (
  "id" TEXT NOT NULL,
  "commissionerId" TEXT NOT NULL,
  "ticketTierId" TEXT NOT NULL,
  CONSTRAINT "EventCommissionerTicketTier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventCommissionerTicketTier_commissionerId_ticketTierId_key"
  ON "EventCommissionerTicketTier"("commissionerId", "ticketTierId");
CREATE INDEX IF NOT EXISTS "EventCommissionerTicketTier_ticketTierId_idx"
  ON "EventCommissionerTicketTier"("ticketTierId");

DO $$ BEGIN
  ALTER TABLE "EventCommissionerTicketTier"
    ADD CONSTRAINT "EventCommissionerTicketTier_commissionerId_fkey"
    FOREIGN KEY ("commissionerId") REFERENCES "EventCommissioner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EventCommissionerTicketTier"
    ADD CONSTRAINT "EventCommissionerTicketTier_ticketTierId_fkey"
    FOREIGN KEY ("ticketTierId") REFERENCES "TicketTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "commissionerId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Order"
    ADD CONSTRAINT "Order_commissionerId_fkey"
    FOREIGN KEY ("commissionerId") REFERENCES "EventCommissioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
