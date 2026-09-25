import { createClientFromRequest } from "npm:@base44/sdk@0.8.49";

/**
 * Corrige los registros de asistencia con status "Vacaciones" que caen en
 * sábados o domingos: asegura que worked_hours = 0 y regular_hours = 0.
 *
 * Los días de vacaciones en fines de semana cuentan como día de vacaciones
 * pero NO como horas de trabajo (0 horas). En días laborables (lun-vie)
 * las vacaciones sí contabilizan las horas programadas de la jornada.
 *
 * También limpia scheduled_start/scheduled_end en fines de semana para
 * evitar horarios ficticios.
 *
 * Admin-only.
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Verificar admin
    const callerEmp = await base44.asServiceRole.entities.Employee.filter({ work_email: user.email });
    const callerRole = callerEmp?.[0]?.role;
    if (!callerRole || !["admin", "super_admin"].includes(callerRole)) {
      return Response.json({ error: "Solo administradores pueden ejecutar esta corrección" }, { status: 403 });
    }

    // Cargar todos los registros de vacaciones con paginación
    let allVacationRecords: any[] = [];
    const PAGE = 500;
    let skip = 0;
    while (true) {
      const raw = await base44.asServiceRole.entities.AttendanceRecord.filter(
        { status: "Vacaciones" }, "-date", PAGE, skip
      );
      const page = Array.isArray(raw) ? raw : (raw ? Object.values(raw) : []);
      if (page.length === 0) break;
      allVacationRecords = allVacationRecords.concat(page);
      if (page.length < PAGE) break;
      skip += PAGE;
      await new Promise(r => setTimeout(r, 150));
    }

    // Filtrar solo los que caen en sábado (6) o domingo (0)
    const weekendRecords = allVacationRecords.filter((r: any) => {
      const dateStr = String(r.date || "").split("T")[0];
      const dow = new Date(dateStr + "T00:00:00").getDay();
      return dow === 0 || dow === 6;
    });

    if (weekendRecords.length === 0) {
      return Response.json({
        success: true,
        corrected: 0,
        totalVacationRecords: allVacationRecords.length,
        message: "No hay registros de vacaciones en fines de semana para corregir"
      });
    }

    // Preparar actualizaciones: worked_hours=0, regular_hours=0, limpiar horarios
    const updates = weekendRecords.map((r: any) => ({
      id: r.id,
      worked_hours: 0,
      regular_hours: 0,
      overtime_hours_25: 0,
      overtime_hours_35: 0,
      is_late: false,
      late_minutes: 0,
      is_absent: false,
      scheduled_start: "",
      scheduled_end: "",
    }));

    // Procesar en lotes de 5
    const BATCH = 5;
    let corrected = 0;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      await Promise.all(batch.map((u: any) =>
        base44.asServiceRole.entities.AttendanceRecord.update(u.id, {
          worked_hours: u.worked_hours,
          regular_hours: u.regular_hours,
          overtime_hours_25: u.overtime_hours_25,
          overtime_hours_35: u.overtime_hours_35,
          is_late: u.is_late,
          late_minutes: u.late_minutes,
          is_absent: u.is_absent,
          scheduled_start: u.scheduled_start,
          scheduled_end: u.scheduled_end,
        })
      ));
      corrected += batch.length;
      if (i + BATCH < updates.length) await new Promise(r => setTimeout(r, 100));
    }

    return Response.json({
      success: true,
      corrected,
      totalVacationRecords: allVacationRecords.length,
      weekendRecords: weekendRecords.length
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}