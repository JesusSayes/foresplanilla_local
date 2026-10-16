-- Ejecutar manualmente antes de desplegar. No modifica boletas históricas.
-- Después, actualizar el esquema y regenerar el cliente Prisma manualmente.
BEGIN;

ALTER TABLE public.attendance_record
  ADD COLUMN IF NOT EXISTS overtime_destination text DEFAULT 'pago',
  ADD COLUMN IF NOT EXISTS early_departure_minutes integer DEFAULT 0;

ALTER TABLE public.horasextrasmanual
  ADD COLUMN IF NOT EXISTS attendance_record_id varchar(255),
  ADD COLUMN IF NOT EXISTS attendance_date date,
  ADD COLUMN IF NOT EXISTS overtime_destination text DEFAULT 'pago';

ALTER TABLE public.payslip
  ADD COLUMN IF NOT EXISTS early_departure_discount numeric(18,2) DEFAULT 0;

-- No se transforma la política antigua por empleado en destinos por jornada:
-- esa asignación requiere identificar las jornadas correspondientes.
COMMIT;
