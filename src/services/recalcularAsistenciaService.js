import localClient from '@/api/localClient';
// Fuente oficial: backend/utils/attendanceMetrics.js

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

  return (
    findBest(empSchedules) ||
    findBest(deptSchedules) ||
    null
  );
}

// Regla Peruana:
// Primeras 2h extras → 25%
// Desde la 3ra hora → 35%
function calcularMetricas(record, schedule, dateStr, overtimeAuthorized) {
  const clockIn = record.clock_in;
  const clockOut = record.clock_out;

  // Sin entrada
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
    schedule?.[dayStartMap[dow]] || "09:00";

  const scheduledEnd =
    schedule?.[dayEndMap[dow]] || "18:00";

  const breakMinutes =
    schedule?.break_duration_minutes ?? 60;

  const toleranceMinutes =
    schedule?.tolerance_minutes ?? 10;

  const [inH, inM] = clockIn.split(":").map(Number);

  const inTotal = inH * 60 + inM;

  const [schedH, schedM] =
    scheduledStart.split(":").map(Number);

  const schedTotal = schedH * 60 + schedM;

  const [endH, endM] =
    scheduledEnd.split(":").map(Number);

  const schedEndTotal = endH * 60 + endM;
  let fullJornada = schedEndTotal - schedTotal;
  if (fullJornada < 0) fullJornada += 1440;
  // Regla: si la jornada programada es menor a 6 horas (360 min), no se descuenta el break
  const effectiveBreakMinutes = fullJornada < 360 ? 0 : breakMinutes;

  // Tardanza
  const rawLate = inTotal - schedTotal;

  const lateMinutes =
    rawLate > toleranceMinutes ? rawLate : 0;

  const isLate = lateMinutes > 0;

  let workedHours = 0;
  let regularHours = 0;
  let overtimeHours25 = 0;
  let overtimeHours35 = 0;

  // Solo si hay salida
  if (clockOut) {
    const [outH, outM] =
      clockOut.split(":").map(Number);

    const outTotal = outH * 60 + outM;

    const totalMinutes =
      outTotal - inTotal - effectiveBreakMinutes;

    workedHours = Math.max(0, totalMinutes / 60);

    // Horas normales máximas
    const regularMinutes = Math.max(
      0,
        schedEndTotal -
        Math.max(inTotal, schedTotal) -
        effectiveBreakMinutes
    );

    const normalHoursMax = regularMinutes / 60;

    if (workedHours <= normalHoursMax) {
      regularHours = workedHours;
    } else {
      regularHours = normalHoursMax;

      const extraHours =
        workedHours - normalHoursMax;

      // Solo contabilizar HE autorizadas
      if (overtimeAuthorized) {
        overtimeHours25 = Math.min(extraHours, 2);

        overtimeHours35 = Math.max(
          0,
          extraHours - 2
        );
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

const recalcularAsistenciaService = {
  invoke: async (employee_id, date_from, date_to) => {
    if (!employee_id || !date_from || !date_to) {
      throw new Error('employee_id, date_from y date_to son requeridos');
    }
    const { data } = await localClient.post('/api/attendance/recalcular', {
      employee_id, date_from, date_to,
    });
    return data;
  },

  recalculate: async (
    employee_id,
    date_from,
    date_to
  ) => {
    return recalcularAsistenciaService.invoke(
      employee_id,
      date_from,
      date_to
    );
  },

  getScheduleForDate,
  calcularMetricas,
};

export default recalcularAsistenciaService;
