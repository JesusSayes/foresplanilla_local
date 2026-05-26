import { entitiesAPI } from '@/api/entitiesClient';

function getScheduleForDate(employeeId, departmentName, schedules, dateStr) {
  const candidates = schedules.filter(s => {
    if (!s.is_active) return false;

    const isForEmployee = s.employee_id === employeeId;

    const isForDept =
      !s.employee_id &&
      departmentName &&
      (
        s.departments?.includes(departmentName) ||
        s.department_name === departmentName
      );

    return isForEmployee || isForDept;
  });

  const empSchedules = candidates.filter(s => s.employee_id === employeeId);
  const deptSchedules = candidates.filter(s => !s.employee_id);

  const findBest = (list) => {
    const valid = list.filter(s => {
      const from = s.effective_from || "0000-01-01";
      const to   = s.effective_to   || "9999-12-31";

      return from <= dateStr && to >= dateStr;
    });

    valid.sort((a, b) =>
      (b.effective_from || "0000-01-01")
        .localeCompare(a.effective_from || "0000-01-01")
    );

    return valid[0] || null;
  };

  return findBest(empSchedules) || findBest(deptSchedules) || null;
}

function calcularMetricas(record, schedule, dateStr, overtimeAuthorized) {
  const clockIn  = record.clock_in;
  const clockOut = record.clock_out;

  if (!clockIn) {
    return {
      worked_hours: 0,
      regular_hours: 0,
      overtime_hours_25: 0,
      overtime_hours_35: 0,
      is_late: false,
      late_minutes: 0,
      is_absent: record.status === "Ausente",
    };
  }

  const dow = new Date(dateStr + "T00:00:00").getDay();

  const dayStartMap = [
    "sunday_start",
    "monday_start",
    "tuesday_start",
    "wednesday_start",
    "thursday_start",
    "friday_start",
    "saturday_start",
  ];

  const dayEndMap = [
    "sunday_end",
    "monday_end",
    "tuesday_end",
    "wednesday_end",
    "thursday_end",
    "friday_end",
    "saturday_end",
  ];

  const scheduledStart =
    schedule
      ? (schedule[dayStartMap[dow]] || "09:00")
      : "09:00";

  const scheduledEnd =
    schedule
      ? (schedule[dayEndMap[dow]] || "18:00")
      : "18:00";

  const breakMinutes = schedule?.break_duration_minutes ?? 60;
  const toleranceMinutes = schedule?.tolerance_minutes ?? 10;

  const [inH, inM] = clockIn.split(":").map(Number);
  const inTotal = inH * 60 + inM;

  const [schedH, schedM] = scheduledStart.split(":").map(Number);
  const schedTotal = schedH * 60 + schedM;

  const [endH, endM] = scheduledEnd.split(":").map(Number);
  const schedEndTotal = endH * 60 + endM;

  // Tardanza
  const rawLate = inTotal - schedTotal;

  const lateMinutes =
    rawLate > toleranceMinutes
      ? rawLate
      : 0;

  const isLate = lateMinutes > 0;

  let workedHours = 0;
  let regularHours = 0;
  let overtimeHours25 = 0;
  let overtimeHours35 = 0;

  // Horas trabajadas y extras
  if (clockOut) {
    const [outH, outM] = clockOut.split(":").map(Number);

    const outTotal = outH * 60 + outM;

    const totalMinutes =
      outTotal - inTotal - breakMinutes;

    workedHours = Math.max(0, totalMinutes / 60);

    const regularMinutes = Math.max(
      0,
      schedEndTotal - Math.max(inTotal, schedTotal) - breakMinutes
    );

    const normalHoursMax = regularMinutes / 60;

    if (workedHours <= normalHoursMax) {
      regularHours = workedHours;
    } else {
      regularHours = normalHoursMax;

      const extraHours = workedHours - normalHoursMax;

      if (overtimeAuthorized) {
        overtimeHours25 = Math.min(extraHours, 2);
        overtimeHours35 = Math.max(0, extraHours - 2);
      }
    }
  }

  return {
    worked_hours: workedHours,
    regular_hours: regularHours,
    overtime_hours_25: overtimeHours25,
    overtime_hours_35: overtimeHours35,
    is_late: isLate,
    late_minutes: lateMinutes,
    is_absent: false,
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
  };
}

const recalcularTodaAsistenciaService = {
  invoke: async (date_from = null, date_to = null) => {
    try {
      const [
        allEmployees,
        allSchedules,
        allRecords,
        allIncidents,
        allOvertimeAlerts,
      ] = await Promise.all([
        entitiesAPI.Employee.list("-created_date"),
        entitiesAPI.WorkSchedule.list("-effective_from"),
        entitiesAPI.AttendanceRecord.list("-date"),
        entitiesAPI.AttendanceIncident.filter({
          status: "Aprobada",
        }),
        entitiesAPI.OvertimeAlert.list("-created_date"),
      ]);

      let records = [...allRecords];

      // Filtrar por rango si se especificó
      if (date_from && date_to) {
        records = records.filter(
          r => r.date >= date_from && r.date <= date_to
        );
      }

      // Índice de incidentes aprobados
      const approvedIdx = {};

      allIncidents.forEach(i => {
        approvedIdx[
          `${i.employee_id}_${i.incident_date}`
        ] = true;
      });

      // Set de registros con HE pendiente
      const pendingOvertimeRecordIds = new Set(
        allOvertimeAlerts
          .filter(a => a.status === "Pendiente")
          .map(a => a.attendance_record_id)
          .filter(Boolean)
      );

      // Índice de empleados
      const empById = {};

      allEmployees.forEach(e => {
        empById[e.id] = e;
      });

      let updated = 0;
      let skipped = 0;

      const updates = [];

      for (const record of records) {
        // Preservar vacaciones
        if (record.status === "Vacaciones") {
          skipped++;
          continue;
        }

        const emp = empById[record.employee_id];

        if (!emp) {
          skipped++;
          continue;
        }

        const schedule = getScheduleForDate(
          record.employee_id,
          emp.department_name,
          allSchedules,
          record.date
        );

        // HE autorizadas
        const hasScheduleAuth =
          schedule?.overtime_authorized ?? false;

        const overtimeAuth =
          (
            record.overtime_authorized === true ||
            hasScheduleAuth
          ) &&
          !pendingOvertimeRecordIds.has(record.id);

        const metrics = calcularMetricas(
          record,
          schedule,
          record.date,
          overtimeAuth
        );

        const hasApprovedIncident =
          !!approvedIdx[
            `${record.employee_id}_${record.date}`
          ];

        let status;

        if (record.status === "Vacaciones") {
          status = "Vacaciones";
        } else if (
          hasApprovedIncident ||
          record.status === "Justificado"
        ) {
          status = "Justificado";
        } else if (record.clock_in && record.clock_out) {
          status = "Completo";
        } else if (record.clock_in && !record.clock_out) {
          status = "Incompleto";
        } else {
          status = "Ausente";
        }

        updates.push({
          id: record.id,
          data: {
            worked_hours: metrics.worked_hours,
            regular_hours: metrics.regular_hours,
            overtime_hours_25: metrics.overtime_hours_25,
            overtime_hours_35: metrics.overtime_hours_35,
            is_late: metrics.is_late,
            late_minutes: metrics.late_minutes,
            is_absent: metrics.is_absent,
            scheduled_start:
              metrics.scheduled_start || record.scheduled_start,
            scheduled_end:
              metrics.scheduled_end || record.scheduled_end,
            status,
          },
        });
      }

      // Procesar en lotes
      const BATCH = 5;

      for (let i = 0; i < updates.length; i += BATCH) {
        const batch = updates.slice(i, i + BATCH);

        await Promise.all(
          batch.map(u =>
            entitiesAPI.AttendanceRecord.update(
              u.id,
              u.data
            )
          )
        );

        updated += batch.length;

        // Pausa pequeña
        if (i + BATCH < updates.length) {
          await new Promise(r => setTimeout(r, 100));
        }
      }

      return {
        success: true,
        updated,
        skipped,
        total: records.length,
      };
    } catch (error) {
      console.error(
        'Error en recalcularTodaAsistenciaService.invoke:',
        error
      );

      throw new Error(
        error.message || 'Error recalculando toda la asistencia'
      );
    }
  },

  recalculate: async (date_from = null, date_to = null) => {
    return recalcularTodaAsistenciaService.invoke(
      date_from,
      date_to
    );
  },

  getScheduleForDate,
  calcularMetricas,
};

export default recalcularTodaAsistenciaService;
