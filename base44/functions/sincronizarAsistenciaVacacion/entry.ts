import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

// Sincroniza los registros de asistencia cubiertos por una vacación aprobada.
// Sobrescribe valores residuales (is_late, late_minutes, is_absent, horas extra)
// para que un día de vacaciones no genere descuentos en planilla ni se muestre
// como tardanza/falta en la gestión de asistencia.
//
// Se invoca desde una automatización de entidad sobre VacationRequest (update)
// y también admite invocación directa con { vacation_id }.

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // ¿Viene de una automatización de entidad (entity update)?
    const isAutomation = !!(body.event && body.event.entity_name);
    let vacation = body.data;
    const vacationId = body.vacation_id || body.event?.entity_id;

    // Invocación directa: validar usuario autenticado
    if (!isAutomation) {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!vacation && vacationId) {
      vacation = await base44.asServiceRole.entities.VacationRequest.get(vacationId);
    }
    if (!vacation) {
      return Response.json({ error: "No se encontró la solicitud de vacaciones" }, { status: 400 });
    }

    const status = String(vacation.status || "");
    if (status !== "Aprobada" && status !== "Aprobado") {
      return Response.json({ skipped: true, reason: `status=${status}` });
    }

    const employeeId = vacation.employee_id;
    const startDate = String(vacation.start_date || "").split("T")[0];
    const endDate = String(vacation.end_date || "").split("T")[0];
    if (!employeeId || !startDate || !endDate) {
      return Response.json({ error: "Datos de vacaciones incompletos" }, { status: 400 });
    }

    // Registros de asistencia del empleado cubiertos por el rango de vacaciones
    const records = await base44.asServiceRole.entities.AttendanceRecord.filter({ employee_id: employeeId });
    const covered = records.filter((r: any) => {
      const d = String(r.date || "").split("T")[0];
      return d >= startDate && d <= endDate;
    });

    if (covered.length === 0) {
      return Response.json({ success: true, updated: 0, message: "Sin registros de asistencia en el rango" });
    }

    // Cargar empleado, horarios y feriados para determinar días no laborables
    const empRaw = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
    const employee = Array.isArray(empRaw) ? empRaw[0] : null;
    const departmentName = employee?.department_name || "";

    const schedulesRaw = await base44.asServiceRole.entities.WorkSchedule.list();
    const activeSchedules = (Array.isArray(schedulesRaw) ? schedulesRaw : []).filter((s: any) => s.is_active);

    const holidaysRaw = await base44.asServiceRole.entities.Holiday.list();
    const holidayDates = new Set((Array.isArray(holidaysRaw) ? holidaysRaw : []).map((h: any) => (h.date || "").slice(0, 10)));

    const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

    function getScheduleForVacationDate(dateStr: string) {
      const candidates = activeSchedules.filter((s: any) => {
        const isForEmployee = s.employee_id === employeeId;
        const isForDept = !s.employee_id && departmentName &&
          (s.departments?.includes(departmentName) || s.department_name === departmentName);
        return isForEmployee || isForDept;
      });
      const findBest = (list: any[]) => {
        const valid = list.filter((s: any) => {
          const from = s.effective_from || "0000-01-01";
          const to = s.effective_to || "9999-12-31";
          return from <= dateStr && to >= dateStr;
        });
        valid.sort((a: any, b: any) => (b.effective_from || "0000-01-01").localeCompare(a.effective_from || "0000-01-01"));
        return valid[0] || null;
      };
      return findBest(candidates.filter((s: any) => s.employee_id === employeeId))
        || findBest(candidates.filter((s: any) => !s.employee_id))
        || null;
    }

    function isNonWorkingDay(dateStr: string): boolean {
      if (holidayDates.has(dateStr)) return true;
      const schedule = getScheduleForVacationDate(dateStr);
      if (!schedule) return true;
      const dow = new Date(dateStr + "T00:00:00").getDay();
      const day = DAY_NAMES[dow];
      const startT = schedule[`${day}_start`];
      const endT = schedule[`${day}_end`];
      return !startT || !endT || startT.trim() === "" || endT.trim() === "";
    }

    // Sobrescribir valores residuales: vacaciones no generan tardanza, falta ni horas extra.
    // En días no laborables (sábados, domingos, feriados o sin horario programado),
    // limpiar scheduled_start/scheduled_end para evitar horarios ficticios.
    const updates = covered.map((r: any) => {
      const d = String(r.date || "").split("T")[0];
      const nonWorking = isNonWorkingDay(d);
      return {
        id: r.id,
        is_late: false,
        late_minutes: 0,
        is_absent: false,
        overtime_hours_25: 0,
        overtime_hours_35: 0,
        worked_hours: 0,
        regular_hours: 0,
        status: "Vacaciones",
        ...(nonWorking ? { scheduled_start: "", scheduled_end: "" } : {}),
      };
    });
    await base44.asServiceRole.entities.AttendanceRecord.bulkUpdate(updates);

    return Response.json({ success: true, updated: updates.length, range: { startDate, endDate } });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}