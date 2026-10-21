-- Aplicar manualmente antes de desplegar este merge.
-- Agrega los campos nuevos de base44/entities/Loan.jsonc, sin borrar datos.
-- Después actualizar Prisma por introspección y regenerar su cliente manualmente.
-- Requiere también los importes decimales de 2026-10-21-loan-decimal-amounts.sql.
BEGIN;
ALTER TABLE public.loan
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp(3) with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by text;
COMMIT;
