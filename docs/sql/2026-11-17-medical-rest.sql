-- Ejecutar manualmente antes de guardar el nuevo sustento de descansos médicos.
-- Conserva los registros existentes. No requiere regenerar Prisma para esta integración.
BEGIN;

ALTER TABLE public.attendance_incident
  ADD COLUMN IF NOT EXISTS citt_number text,
  ADD COLUMN IF NOT EXISTS citt_status text,
  ADD COLUMN IF NOT EXISTS subsidy_daily_base numeric(18,6),
  ADD COLUMN IF NOT EXISTS subsidy_daily_base_reason text;

COMMENT ON COLUMN public.attendance_incident.citt_number IS 'Número de CITT, sin diagnóstico médico';
COMMENT ON COLUMN public.attendance_incident.citt_status IS 'Sin definir, Pendiente, Validado o No aplica';
COMMENT ON COLUMN public.attendance_incident.subsidy_daily_base IS 'Base diaria manual sustentada; NULL cuando no existe';
COMMENT ON COLUMN public.attendance_incident.subsidy_daily_base_reason IS 'Fuente y sustento de la base diaria manual';

COMMIT;
