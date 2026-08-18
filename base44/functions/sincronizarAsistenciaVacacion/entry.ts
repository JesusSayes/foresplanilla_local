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

    // Sobrescribir valores residuales: vacaciones no generan tardanza, falta ni horas extra
    const updates = covered.map((r: any) => ({
      id: r.id,
      is_late: false,
      late_minutes: 0,
      is_absent: false,
      overtime_hours_25: 0,
      overtime_hours_35: 0,
      worked_hours: 0,
      regular_hours: 0,
      status: "Vacaciones",
    }));
    await base44.asServiceRole.entities.AttendanceRecord.bulkUpdate(updates);

    return Response.json({ success: true, updated: updates.length, range: { startDate, endDate } });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}