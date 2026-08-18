-- Factory production pipeline for FACTORY_CONVERSION orders:
-- NEW → IN_PRODUCTION → PRODUCED → READY (then ASSIGNED via transporter later).

DO $$ BEGIN
  ALTER TYPE "OrderStatus" ADD VALUE 'IN_PRODUCTION';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "OrderStatus" ADD VALUE 'PRODUCED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "OrderStatus" ADD VALUE 'READY';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
