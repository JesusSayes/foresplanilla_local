import { entitiesAPI } from "@/api/entitiesClient";
import { format } from "date-fns";
import { isEmploymentDateValid } from "@/lib/employmentDate";

/**
 * Genera automáticamente marcaciones para empleados con horarios exonerados
 * Esta función debe ejecutarse diariamente (ej: mediante un cron job o al cargar AttendanceManagement)
 */
export const generateAutoClockings = async (targetDate = new Date()) => {
  try {
    const dateStr = format(targetDate, "yyyy-MM-dd");

    // Obtener todos los horarios activos (sin filtrar por exoneración aún)
    const schedules = await entitiesAPI.WorkSchedule.list();
    const activeSchedules = schedules.filter(s => s.is_active);

    // Obtener todos los empleados activos
    const employees = await entitiesAPI.Employee.filter({ status: "Activo" });

    // Obtener registros existentes del día
    const existingRecords = await entitiesAPI.AttendanceRecord.filter({ date: dateStr });

    // Determinar día de la semana
    const dayOfWeek = targetDate.getDay(); // 0=Domingo, 1=Lunes, etc.
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const dayName = dayNames[dayOfWeek];

    // Validar vigencia del horario contra la fecha objetivo (límites inclusivos)
    const targetDateObj = new Date(dateStr + "T00:00:00");
    const isScheduleEffective = (s) => {
      if (s.effective_from) {
        const from = new Date(s.effective_from + "T00:00:00");
        if (targetDateObj < from) return false;
      }
      if (s.effective_to) {
        const to = new Date(s.effective_to + "T00:00:00");
        if (targetDateObj > to) return false;
      }
      return true;
    };

    // Ordenar por inicio de vigencia más reciente (effective_from descendente)
    const byMostRecent = (a, b) => {
      const aFrom = a.effective_from ? new Date(a.effective_from + "T00:00:00").getTime() : 0;
      const bFrom = b.effective_from ? new Date(b.effective_from + "T00:00:00").getTime() : 0;
      return bFrom - aFrom;
    };

    // Seleccionar horario aplicable: individual vigente primero, luego departamental vigente
    const selectScheduleForEmployee = (employee) => {
      const vigentes = activeSchedules.filter(isScheduleEffective);

      // 1. Horario individual vigente (employee_id coincide)
      const individual = vigentes
        .filter(s => s.employee_id === employee.id)
        .sort(byMostRecent);
      if (individual.length > 0) return individual[0];

      // 2. Horario departamental vigente (sin employee_id, departamento coincidente)
      const empDept = employee.department_name;
      if (empDept) {
        const departamental = vigentes
          .filter(s => !s.employee_id)
          .filter(s => {
            const depts = s.departments || [];
            const hasDept = depts.includes(empDept);
            const sameDeptName = s.department_name === empDept;
            return hasDept || sameDeptName;
          })
          .sort(byMostRecent);
        if (departamental.length > 0) return departamental[0];
      }

      return null;
    };

    let recordsCreated = 0;

    for (const employee of employees) {
      // No generar registros fuera del período laboral, incluyendo fecha de cese.
      if (!isEmploymentDateValid(employee, dateStr)) continue;

      // Verificar si ya tiene marcación
      const hasRecord = existingRecords.some(r => r.employee_id === employee.id);
      if (hasRecord) continue;

      // Seleccionar horario aplicable (individual primero, luego departamental)
      const schedule = selectScheduleForEmployee(employee);

      if (!schedule) continue;

      // Solo generar marcaciones si el horario seleccionado está exonerado
      if (!schedule.exempt_from_clocking) continue;

      // Obtener horarios del día
      const startTime = schedule[`${dayName}_start`];
      const endTime = schedule[`${dayName}_end`];

      if (!startTime || !endTime) continue; // No trabaja este día

      // Calcular horas trabajadas
      const [startHour, startMin] = startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);
      let scheduledMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
      if (scheduledMinutes < 0) scheduledMinutes += 1440;
      const effectiveBreakMinutes = scheduledMinutes < 360 ? 0 : (schedule.break_duration_minutes || 60);
      const workedHours = Math.max(0, (scheduledMinutes - effectiveBreakMinutes) / 60);

      // Crear registro automático
      await entitiesAPI.AttendanceRecord.create({
        employee_id: employee.id,
        date: dateStr,
        clock_in: startTime,
        clock_out: endTime,
        scheduled_start: startTime,
        scheduled_end: endTime,
        worked_hours: workedHours,
        is_late: false,
        late_minutes: 0,
        is_absent: false,
        status: "Completo",
        notes: "Marcación automática - Exonerado de marcación física"
      });

      recordsCreated++;
    }

    return { success: true, recordsCreated };
  } catch (error) {
    console.error("Error generating auto clockings:", error);
    return { success: false, error: error.message };
  }
};
