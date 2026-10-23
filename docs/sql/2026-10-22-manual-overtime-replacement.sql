-- Ejecutar manualmente antes de utilizar la corrección de HE manuales.
BEGIN;
ALTER TABLE public.horasextrasmanual
  ADD COLUMN IF NOT EXISTS replaces_record_id text;
CREATE UNIQUE INDEX IF NOT EXISTS horasextrasmanual_replaces_record_id_unique
  ON public.horasextrasmanual (replaces_record_id)
  WHERE replaces_record_id IS NOT NULL AND replaces_record_id <> '';
COMMIT;
