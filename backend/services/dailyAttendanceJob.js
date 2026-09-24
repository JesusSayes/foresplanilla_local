// Comparte el bloqueo entre el arranque y los reintentos del mismo proceso.
export function createDailyAttendanceJob({ generate, updateStatuses, getDate, logger = console }) {
  let running = false;
  let completedDate = null;
  return async function runDailyAttendance() {
    if (running || completedDate === getDate()) return;
    running = true;
    try {
      let statusesUpdated = false;
      try {
        const result = await updateStatuses();
        statusesUpdated = true;
        logger.log(`[Cron] Empleados actualizados a Cesado: ${result.updated}`);
      } catch (error) {
        // El generador también valida la fecha de cese por empleado.
        logger.error('[Cron] Error actualizando ceses:', error.message);
      }
      const result = await generate();
      logger.log(`[Cron] Asistencia ${result.date}: ${result.employees_processed} empleados, ${result.records_created} registros creados`);
      if (result.errors?.length) {
        logger.error('[Cron] Errores por empleado en generación diaria:', result.errors);
      } else if (result.success && statusesUpdated) {
        completedDate = result.date;
      }
      return result;
    } catch (error) {
      logger.error('[Cron] Error en generación diaria de asistencia:', error.message);
    } finally {
      running = false;
    }
  };
}
