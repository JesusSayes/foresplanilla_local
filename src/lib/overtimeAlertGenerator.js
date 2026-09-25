/**
 * Genera/actualiza las alertas de Horas Extras (HE) no autorizadas
 * revisando TODOS los registros de asistencia guardados (no solo los
 * visibles en la página).
 *
 * Enriquece cada registro con scheduled_start/end desde el horario
 * vigente (WorkSchedule) para que la sincronización funcione incluso
 * si el registro no fue recalculado recientemente.
 *
 * @param {Object} opts
 * @param {Object} opts.currentUser - Usuario actual (para resolved_by).
 * @param {Array}  opts.workSchedules - Lista de WorkSchedule vigentes.
 * @param {Array}  opts.allEmployees - Lista de empleados (para department_name).
 * @param {Function} opts.onProgress - Callback ({done, total}) para progreso.
 * @returns {Promise<{total: number, pending: number}>}
 */
import { entitiesAPI } from "@/api/entitiesClient";
import { syncOvertimeAlertsBatch } from "@/lib/overtimeAlertSync";

// Obtiene el horario vigente de un empleado para una fecha (misma lógica
// que getEmployeeScheduleForDate en AttendanceManagement.jsx)
function getScheduleForDate(empId, dateStr, workSchedules, allEmployees) {
  const emp = allEmployees.find((e) => e.id === empId);
  const candidates = workSchedules.filter((s) => {
    if (!s.is_active) return false;
    const isForEmployee = s.employee_id === empId;
    const isForDept =
      !s.employee_id &&
      emp?.department_name &&
      (s.departments?.includes(emp.department_name) ||
        s.department_name === emp.department_name);
    return isForEmployee || isForDept;
  });

  const empSchedules = candidates.filter((s) => s.employee_id === empId);
  const deptSchedules = candidates.filter((s) => !s.employee_id);

  const findBest = (list) => {
    const valid = list.filter((s) => {
      const from = s.effective_from || "0000-01-01";
      const to = s.effective_to || "9999-12-31";
      return from <= dateStr && to >= dateStr;
    });
    valid.sort((a, b) =>
      (b.effective_from || "0000-01-01").localeCompare(a.effective_from || "0000-01-01")
    );
    return valid[0] || null;
  };

  return findBest(empSchedules) || findBest(deptSchedules) || null;
}

export const generateOvertimeAlertsForAllRecords = async ({
  currentUser,
  workSchedules,
  allEmployees,
  onProgress,
}) => {
  // Cargar TODOS los registros de asistencia (no solo los visibles)
  const allRecords = await entitiesAPI.AttendanceRecord.list("-date");
  // Cargar alertas pendientes existentes (lista mutable que syncOvertimeAlert actualiza)
  const pendingAlerts = await entitiesAPI.OvertimeAlert.filter({
    status: "Pendiente",
  });

  const stMap = [
    "sunday_start", "monday_start", "tuesday_start", "wednesday_start",
    "thursday_start", "friday_start", "saturday_start",
  ];
  const enMap = [
    "sunday_end", "monday_end", "tuesday_end", "wednesday_end",
    "thursday_end", "friday_end", "saturday_end",
  ];

  // Enriquecer registros con scheduled_start/end desde WorkSchedule vigente
  const enriched = allRecords.map((r) => {
    const sched = getScheduleForDate(r.employee_id, r.date, workSchedules, allEmployees);
    if (!sched) return r;
    const dow = new Date(r.date + "T00:00:00").getDay();
    const sStart = sched[stMap[dow]] || r.scheduled_start || "";
    const sEnd = sched[enMap[dow]] || r.scheduled_end || "";
    return { ...r, scheduled_start: sStart, scheduled_end: sEnd };
  });

  const total = enriched.length;
  const batchSize = 100;
  for (let i = 0; i < total; i += batchSize) {
    const batch = enriched.slice(i, i + batchSize);
    await syncOvertimeAlertsBatch(
      batch,
      pendingAlerts,
      currentUser,
      (r) => {
        const sched = getScheduleForDate(r.employee_id, r.date, workSchedules, allEmployees);
        const dow = new Date(r.date + "T00:00:00").getDay();
        return !!(sched?.[stMap[dow]] && sched?.[enMap[dow]]);
      }
    );
    if (onProgress) {
      onProgress({ done: Math.min(i + batchSize, total), total });
    }
  }

  return { total, pending: pendingAlerts.length };
};