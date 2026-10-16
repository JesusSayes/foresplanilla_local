-- Equivalencia PostgreSQL de los campos añadidos a AttendanceIncident en main.
-- Ejecutar manualmente y actualizar después el modelo/cliente Prisma.
-- No recalcula compensaciones ni modifica los importes de planillas existentes.
BEGIN;

ALTER TABLE public.attendance_incident
  ADD COLUMN IF NOT EXISTS overtime_minutes_25 INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_minutes_35 INTEGER DEFAULT 0;

COMMIT;
