-- Ejecutar manualmente antes de desplegar el flujo RMV. No modifica contratos históricos.
BEGIN;
ALTER TABLE public.contract_renewal_rule
  ADD COLUMN IF NOT EXISTS rule_type text NOT NULL DEFAULT 'expiration',
  ADD COLUMN IF NOT EXISTS renewal_months integer NOT NULL DEFAULT 12;
COMMIT;
