-- No-op migration.
-- This folder was present but migration.sql was missing, which breaks
-- `prisma migrate status/deploy`. Keeping it empty is safe as long as the
-- real invoice-audience changes are covered by later migrations.

