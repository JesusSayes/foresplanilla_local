import { base44 } from "@/api/base44Client";
import { format } from "date-fns";

/**
 * Genera automáticamente marcaciones para empleados con horarios exonerados
 * Esta función debe ejecutarse diariamente (ej: mediante un cron job o al cargar AttendanceManagement)
 */
export const generateAutoClockings = async (targetDate = new Date()) => {
  try {
    const dateStr = format(targetDate, "yyyy-MM-dd");
    
    // Obtener todos los horarios activos exonerados de marcación
    const schedules = await base44.entities.WorkSchedule.list();
    const exemptSchedules = schedules.filter(s => s.is_active && s.exempt_from_clocking);
    
    // Obtener todos los empleados activos
    const employees = await base44.entities.Employee.filter({ status: "Activo" });
    
    // Obtener registros existentes del día
    const existingRecords = await base44.entities.AttendanceRecord.filter({ date: dateStr });
    
    // Determinar día de la semana
    const dayOfWeek = targetDate.getDay(); // 0=Domingo, 1=Lunes, etc.
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const dayName = dayNames[dayOfWeek];
    
    let recordsCreated = 0;
    
    for (const employee of employees) {
      // No generar registros después de la fecha de cese del empleado
      if (employee.termination_date) {
        const termination = new Date(employee.termination_date + "T00:00:00");
        const target = new Date(dateStr + "T00:00:00");
        if (target > termination) continue;
      }

      // Verificar si ya tiene marcación
      const hasRecord = existingRecords.some(r => r.employee_id === employee.id);
      if (hasRecord) continue;
      
      // Buscar horario aplicable
      let schedule = exemptSchedules.find(s => s.employee_id === employee.id);
      
      if (!schedule) {
        // Buscar por departamento
        schedule = exemptSchedules.find(s => 
          s.departments?.includes(employee.department_name) || 
          s.department_name === employee.department_name
        );
      }
      
      if (!schedule) continue;
      
      // Obtener horarios del día
      const startTime = schedule[`${dayName}_start`];
      const endTime = schedule[`${dayName}_end`];
      
      if (!startTime || !endTime) continue; // No trabaja este día
      
      // Calcular horas trabajadas
      const [startHour, startMin] = startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);
      const totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin) - (schedule.break_duration_minutes || 60);
      const workedHours = Math.max(0, totalMinutes / 60);
      
      // Crear registro automático
      await base44.entities.AttendanceRecord.create({
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