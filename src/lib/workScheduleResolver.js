import { getScheduleForDate } from "./attendanceMetrics.js";
import { DEFAULT_LATE_TOLERANCE_MINUTES } from "./attendanceReconciliation.js";

/**
 * Resolver del horario aplicable a un trabajador en una fecha concreta.
 *
 * Respeta la vigencia de cada horario (effective_from / effective_to) y da
 * prioridad al horario del trabajador sobre el del departamento. Devuelve el día
 * aplicable (inicio, fin, tolerancia y refrigerio), con horas vacías en descansos.
 * Devuelve null cuando no hay horario aplicable.
 *
 * Fuente única para el descuento de tardanzas y la detección de faltas, de modo
 * que planilla y asistencia resuelvan el mismo horario.
 */
export const createScheduleDayResolver = ({ workSchedules = [], getEmployee }) => {
  const isActive = (ws) => ws.is_active !== false;

  const pickValid = (list, dateStr) => {
    const valid = list.filter((ws) => {
      const from = String(ws.effective_from || "").slice(0, 10) || "0000-01-01";
      const to = String(ws.effective_to || "").slice(0, 10) || "9999-12-31";
      return from <= dateStr && to >= dateStr;
    });
    valid.sort((a, b) =>
      String(b.effective_from || "0000-01-01").localeCompare(String(a.effective_from || "0000-01-01"))
    );
    const chosen = valid[0];
    if (!chosen) return null;

    const day = getScheduleForDate(chosen, new Date(dateStr + "T00:00:00"));

    return {
      start: day?.start || null,
      end: day?.end || null,
      tolerance_minutes: chosen.tolerance_minutes ?? DEFAULT_LATE_TOLERANCE_MINUTES,
      breakMinutes: chosen.break_duration_minutes ?? 0,
      breakStart: chosen.break_start || null,
      exempt_from_clocking: !!chosen.exempt_from_clocking,
    };
  };

  return (employeeId, dateStr) => {
    if (!employeeId || !dateStr) return null;

    const own = pickValid(
      workSchedules.filter((ws) => ws.employee_id === employeeId && isActive(ws)),
      dateStr
    );
    if (own) return own;

    const departmentName = getEmployee ? getEmployee(employeeId)?.department_name : null;
    if (!departmentName) return null;

    return pickValid(
      workSchedules.filter(
        (ws) =>
          !ws.employee_id &&
          isActive(ws) &&
          (ws.department_name === departmentName || (ws.departments || []).includes(departmentName))
      ),
      dateStr
    );
  };
};