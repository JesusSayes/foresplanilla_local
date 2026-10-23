-- Ejecutar manualmente antes de usar el campo nuevo en Datos Maestros.
-- NULL exige configurar la tasa explícitamente; no se inventan porcentajes.
BEGIN;
ALTER TABLE public.afp
  ADD COLUMN IF NOT EXISTS mixed_commission_percentage NUMERIC(18, 2);
COMMENT ON COLUMN public.afp.mixed_commission_percentage IS
  'Porcentaje de comisión mixta sobre remuneración para planilla; no corresponde a la comisión sobre saldo del fondo.';
COMMIT;
