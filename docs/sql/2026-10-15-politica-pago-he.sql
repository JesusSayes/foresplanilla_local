-- Ejecutar manualmente ANTES de desplegar el backend que valida esta política.
-- No modifica asistencias, saldos de compensación ni boletas históricas.
BEGIN;

ALTER TABLE public.employee
  ADD COLUMN IF NOT EXISTS overtime_payment_mode varchar(20) NOT NULL DEFAULT 'payment';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.employee'::regclass
      AND conname = 'employee_overtime_payment_mode_check'
  ) THEN
    ALTER TABLE public.employee
      ADD CONSTRAINT employee_overtime_payment_mode_check
      CHECK (overtime_payment_mode IN ('payment', 'compensation_only'));
  END IF;
END $$;

COMMENT ON COLUMN public.employee.overtime_payment_mode IS
  'payment: conserva el flujo de pago de HE; compensation_only: prohíbe pagar HE en boletas.';

COMMIT;

-- Configurar únicamente los empleados confirmados por RRHH, mediante la API
-- PUT /api/employees/:id con {"overtime_payment_mode":"compensation_only"}.
-- Alternativa manual (reemplazar el ID antes de ejecutar):
-- UPDATE public.employee
-- SET overtime_payment_mode = 'compensation_only', updated_date = NOW()
-- WHERE id = 'ID_CONFIRMADO_POR_RRHH'
-- RETURNING id, overtime_payment_mode;
