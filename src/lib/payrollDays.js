/**
 * Días trabajados y no laborados de la boleta, coherentes con las faltas
 * descontables del período de asistencia.
 *
 * Regla única: cada falta descontable (y cada permiso sin goce de día completo)
 * resta un día de los días trabajados. El prorrateo de la remuneración básica
 * —fórmula del concepto `(base_salary / 30) * worked_days`— y de los costos por
 * día es el ÚNICO descuento de ese día: no se aplica además un descuento
 * monetario separado por inasistencia, para no cobrar dos veces la misma falta.
 *
 * Las jornadas pendientes de regularización (marcación incompleta o cobertura
 * pendiente) NO restan días: se regularizan antes de descontarlas.
 */

/** Días del mes que se computan como trabajados para la remuneración (convención Perú). */
export const MONTH_DAYS = 30;

export const applyAbsenceDays = ({
  baseWorkedDays,
  payrollType,
  absenceDays = 0,
  sinGoceFullDays = 0,
}) => {
  const base = Math.max(0, Number(baseWorkedDays) || 0);

  // La planilla quincenal es un adelanto: no descuenta inasistencias ni permisos.
  if (payrollType === "Quincenal") {
    return { workedDays: base, nonWorkedDays: 0 };
  }

  const absences = Math.max(0, Math.floor(Number(absenceDays) || 0));
  const sinGoce = Math.max(0, Math.floor(Number(sinGoceFullDays) || 0));

  return {
    workedDays: Math.max(0, base - absences - sinGoce),
    nonWorkedDays: absences + sinGoce,
  };
};