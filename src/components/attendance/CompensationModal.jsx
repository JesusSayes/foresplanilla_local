import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Clock,
  X,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  UserCheck,
  Search,
  CalendarDays,
  ArrowRightLeft,
  Zap,
  CalendarX,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima } from "@/lib/dateUtils";
import {
  computeScheduledHours,
  computeScheduledHoursForPeriod,
  getScheduleForDate,
  computeCrossDayCompensation,
  computeCrossDayCompensationWithPrevMonth,
  COMPENSATION_MATCH_WINDOW_DAYS,
  isWithinCompensationWindow,
} from "@/lib/attendanceMetrics";
import { isCompensableOvertime } from "@/lib/attendanceReconciliation";

const fmtHours = (h) => {
  const val = h ?? 0;
  const totalMinutes = Math.round(val * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
};

const fmtMinutes = (minutes) => {
  const val = minutes ?? 0;
  const sign = val < 0 ? "-" : val > 0 ? "+" : "";
  const abs = Math.abs(val);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${sign}${hh}:${String(mm).padStart(2, "0")}`;
};

export default function CompensationModal({
  employee,
  employeeSchedule,
  periodStart,
  periodEnd,
  periodRecords,
  prevMonthRecords = [],
  prevMonthStart,
  prevMonthEnd,
  existingCompensations = [],
  allEmployees = [],
  editMode = false,
  pendingCompensations = [],
  onClose,
  onSubmit,
}) {
  const [selectedDays, setSelectedDays] = useState(() => {
    if (editMode && pendingCompensations?.length) {
      const initial = {};
      for (const comp of pendingCompensations) {
        if (comp.status === "Pendiente" || comp.status === "Rechazada") {
          initial[comp.incident_date] = {
            date: comp.incident_date,
            recordId: comp.attendance_record_id || null,
            lateMinutes: comp.late_minutes_to_adjust || 0,
            overtimeMinutes: Math.round((comp.hours_to_adjust || 0) * 60),
          };
        }
      }
      return initial;
    }
    return {};
  });
  const [compensationReason, setCompensationReason] = useState(
    editMode && pendingCompensations?.length
      ? pendingCompensations[0]?.justification || ""
      : ""
  );
  const [authorizerId, setAuthorizerId] = useState(
    editMode && pendingCompensations?.length
      ? pendingCompensations[0]?.authorizer_id || null
      : null
  );
  // Derivar el objeto autorizador desde allEmployees usando el ID estable.
  // Una carga tardía de allEmployees (edición) resuelve el autorizador
  // automáticamente; una recarga no sobrescribe la selección manual ni
  // reinicia el formulario.
  const authorizer = useMemo(
    () => allEmployees.find((e) => e.id === authorizerId) || null,
    [allEmployees, authorizerId]
  );
  const [authorizerSearch, setAuthorizerSearch] = useState("");
  const [showAuthorizerList, setShowAuthorizerList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  const allEmployeeRecords = useMemo(() => {
    if (!employee) return [];
    return periodRecords.filter((r) => r.employee_id === employee.id);
  }, [employee, periodRecords]);

  // Registros de los últimos 6 días del mes anterior
  const prevMonthEmployeeRecords = useMemo(() => {
    if (!employee) return [];
    return prevMonthRecords.filter((r) => r.employee_id === employee.id);
  }, [employee, prevMonthRecords]);

  // Minutos de HE RESERVADOS: solicitudes pendientes (aún no aplicadas al registro)
  // y aprobadas que no quedaron vinculadas a un registro. Las compensaciones ya
  // aplicadas al registro no se restan aquí: el propio registro ya tiene esas horas
  // descontadas, y restarlas otra vez duplicaría el consumo.
  // Las solicitudes RECHAZADAS liberan su reserva. Las que se están editando se
  // excluyen porque esta solicitud las reemplaza.
  const reservedUsedByDate = useMemo(() => {
    const map = {};
    const editingIds = new Set((pendingCompensations || []).map((c) => c.id));
    for (const c of existingCompensations) {
      if (c.employee_id !== employee?.id) continue;
      if (editingIds.has(c.id)) continue;
      if (c.status === "Rechazada") continue;
      const appliedToRecord = !!c.attendance_record_id;
      if (c.status !== "Pendiente" && !(c.status === "Aprobada" && !appliedToRecord)) continue;
      const mins = Math.round((c.hours_to_adjust || 0) * 60);
      map[c.incident_date] = (map[c.incident_date] || 0) + mins;
    }
    return map;
  }, [existingCompensations, employee, pendingCompensations]);

  // Generar TODOS los días del período (con y sin registro de asistencia)
  // Incluye los últimos 6 días del mes anterior como días compensables (solo HE)
  const allScheduledDays = useMemo(() => {
    if (!employee || !periodStart || !periodEnd) return [];

    const days = [];

    // --- Días del mes anterior (últimos 6 días, solo HE, sin tardanzas) ---
    if (prevMonthStart && prevMonthEnd) {
      const pmStart = new Date(prevMonthStart + "T00:00:00");
      const pmEnd = new Date(prevMonthEnd + "T00:00:00");
      for (let d = new Date(pmStart); d <= pmEnd; d.setDate(d.getDate() + 1)) {
        const dateStr = format(d, "yyyy-MM-dd");
        const record = prevMonthEmployeeRecords.find((r) => r.date === dateStr);
        const schedForDay = employeeSchedule
          ? getScheduleForDate(employeeSchedule, d)
          : null;
        if (schedForDay || record) {
          const heMinutes = Math.max(
            0,
            Math.round(
              ((record?.overtime_hours_25 ?? 0) + (record?.overtime_hours_35 ?? 0)) * 60
            ) - (reservedUsedByDate[dateStr] || 0)
          );
          days.push({
            date: dateStr,
            scheduleTimes: schedForDay,
            record,
            hasRecord: !!record,
            workedHours: record?.worked_hours ?? 0,
            lateMinutes: 0,
            // Solo son compensables las horas disponibles y no pendientes de
            // autorización: el destino "pago" exige autorización de la jornada.
            overtimeMinutes: isCompensableOvertime(record, heMinutes),
            rawOvertimeMinutes: heMinutes,
            overtimeDestination: record?.overtime_destination || "pago",
            overtimeAuthorized: record?.overtime_authorized === true,
            isPrevMonth: true,
          });
        }
      }
    }

    // --- Días del período actual ---
    const start = new Date(periodStart + "T00:00:00");
    const end = new Date(periodEnd + "T00:00:00");

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = format(d, "yyyy-MM-dd");
      const record = allEmployeeRecords.find((r) => r.date === dateStr);
      const schedForDay = employeeSchedule
        ? getScheduleForDate(employeeSchedule, d)
        : null;

      // Incluir si tiene horario programado para ese día O tiene un registro
      if (schedForDay || record) {
        const heMinutes = Math.max(
          0,
          Math.round(
            ((record?.overtime_hours_25 ?? 0) + (record?.overtime_hours_35 ?? 0)) * 60
          ) - (reservedUsedByDate[dateStr] || 0)
        );
        days.push({
          date: dateStr,
          scheduleTimes: schedForDay,
          record,
          hasRecord: !!record,
          workedHours: record?.worked_hours ?? 0,
          lateMinutes: record?.late_minutes || 0,
          overtimeMinutes: isCompensableOvertime(record, heMinutes),
          rawOvertimeMinutes: heMinutes,
          overtimeDestination: record?.overtime_destination || "pago",
          overtimeAuthorized: record?.overtime_authorized === true,
        });
      }
    }

    // En modo edición, incluir días de compensaciones pendientes que no estén en la lista
    if (editMode && pendingCompensations?.length) {
      const existingDates = new Set(days.map((d) => d.date));
      for (const comp of pendingCompensations) {
        if (comp.incident_date && !existingDates.has(comp.incident_date)) {
          days.push({
            date: comp.incident_date,
            scheduleTimes: null,
            record: null,
            hasRecord: false,
            workedHours: 0,
            lateMinutes: comp.late_minutes_to_adjust || 0,
            overtimeMinutes: Math.round((comp.hours_to_adjust || 0) * 60),
          });
          existingDates.add(comp.incident_date);
        }
      }
    }

    return days.sort((a, b) => a.date.localeCompare(b.date));
  }, [employee, employeeSchedule, periodStart, periodEnd, allEmployeeRecords, editMode, pendingCompensations, reservedUsedByDate, prevMonthStart, prevMonthEnd, prevMonthEmployeeRecords]);

  const summary = useMemo(() => {
    const scheduledHours = employeeSchedule
      ? computeScheduledHoursForPeriod(employeeSchedule, periodStart, periodEnd)
      : allEmployeeRecords.reduce((s, r) => s + computeScheduledHours(r), 0);
    const regularHours = allEmployeeRecords.reduce(
      (s, r) => s + (r.regular_hours ?? 0),
      0
    );
    const reservedUsedTotalMin = Object.values(reservedUsedByDate).reduce(
      (a, b) => a + b,
      0
    );
    const overtimeHours = Math.max(
      0,
      allEmployeeRecords.reduce(
        (s, r) => s + (r.overtime_hours_25 ?? 0) + (r.overtime_hours_35 ?? 0),
        0
      ) - reservedUsedTotalMin / 60
    );
    const lateMinutes = allEmployeeRecords.reduce(
      (s, r) => s + (r.late_minutes ?? 0),
      0
    );
    return { scheduledHours, regularHours, overtimeHours, lateMinutes };
  }, [allEmployeeRecords, employeeSchedule, periodStart, periodEnd, reservedUsedByDate]);

  // Resumen mensual de compensación: tardanzas, compensable, compensado, saldo
  const monthlySummary = useMemo(() => {
    const totalLateMin = allEmployeeRecords.reduce((s, r) => s + (r.late_minutes ?? 0), 0);
    const reservedUsedTotalMin = Object.values(reservedUsedByDate).reduce((a, b) => a + b, 0);
    const totalCompensableMin = Math.max(0, Math.round(
      (allEmployeeRecords.reduce((s, r) => s + (r.overtime_hours_25 ?? 0) + (r.overtime_hours_35 ?? 0), 0) +
       prevMonthEmployeeRecords.reduce((s, r) => s + (r.overtime_hours_25 ?? 0) + (r.overtime_hours_35 ?? 0), 0)) * 60
    ) - reservedUsedTotalMin);
    const totalCompensatedMin = Object.values(selectedDays).reduce((s, d) => s + (d.lateMinutes || 0), 0);
    const pendingBalanceMin = Math.max(0, totalLateMin - totalCompensatedMin);
    return { totalLateMin, totalCompensableMin, totalCompensatedMin, pendingBalanceMin };
  }, [allEmployeeRecords, prevMonthEmployeeRecords, reservedUsedByDate, selectedDays]);

  const compensatedDates = useMemo(() => {
    // En modo edición: bloquear solo Aprobadas (las Pendientes/Rechazadas se reemplazan).
    // En modo nuevo: bloquear Pendientes y Aprobadas, pero NO Rechazadas
    // (un rechazo previo no debe impedir una nueva solicitud si hay saldo disponible).
    return new Set(
      existingCompensations
        .filter((c) => c.employee_id === employee?.id)
        .filter((c) => editMode ? c.status === "Aprobada" : (c.status === "Pendiente" || c.status === "Aprobada"))
        .map((c) => c.incident_date)
    );
  }, [existingCompensations, employee, editMode]);

  const filteredAuthorizers = useMemo(() => {
    if (!authorizerSearch.trim()) {
      return allEmployees.filter((e) => e.status === "Activo").slice(0, 50);
    }
    const term = authorizerSearch.toLowerCase().trim();
    return allEmployees
      .filter(
        (e) =>
          e.status === "Activo" &&
          (`${e.first_name} ${e.last_name}`.toLowerCase().includes(term) ||
            `${e.last_name} ${e.first_name}`.toLowerCase().includes(term) ||
            (e.document_number || "").toLowerCase().includes(term) ||
            (e.position || "").toLowerCase().includes(term))
      )
      .slice(0, 50);
  }, [allEmployees, authorizerSearch]);

  const toggleDay = (day) => {
    setSelectedDays((prev) => {
      const next = { ...prev };
      if (next[day.date]) {
        delete next[day.date];
      } else {
        next[day.date] = {
          date: day.date,
          recordId: day.record?.id || null,
          lateMinutes: 0,
          overtimeMinutes: 0,
        };
      }
      return next;
    });
  };

  const updateCompensationMinutes = (date, field, value) => {
    setSelectedDays((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        [field]: Math.max(0, parseInt(value) || 0),
      },
    }));
  };

  // Auto-completar un día de tardanza con HE del mismo día o de hasta 30 días
  // calendario posteriores (la ventana cruza mes y año). Algoritmo voraz: usa el
  // día compensable más cercano primero.
  const autoFillDay = (date) => {
    const day = allScheduledDays.find((d) => d.date === date);
    // Usar tardanza ingresada manualmente si existe; si no, la del registro
    const manualLate = selectedDays[date]?.lateMinutes || 0;
    const effectiveLate = manualLate > 0 ? manualLate : (day?.lateMinutes || 0);
    if (!day || effectiveLate <= 0) {
      setStatusMessage("Ingrese una tardanza para este día antes de auto-completar.");
      return;
    }

    // Fase 1: HE del mes anterior (se consumen primero, sin restricción de cercanía)
    const prevEligible = allScheduledDays
      .filter((d) => {
        if (!d.isPrevMonth) return false;
        if (d.overtimeMinutes <= 0) return false;
        if (compensatedDates.has(d.date)) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // Fase 2: HE del período (mismo día o hasta 30 días calendario después)
    const currentEligible = allScheduledDays
      .filter((d) => {
        if (d.isPrevMonth) return false;
        if (d.overtimeMinutes <= 0) return false;
        if (compensatedDates.has(d.date)) return false;
        return isWithinCompensationWindow(date, d.date, COMPENSATION_MATCH_WINDOW_DAYS);
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const eligible = [...prevEligible, ...currentEligible];

    if (eligible.length === 0) {
      setStatusMessage(
        `No hay horas extras disponibles para compensar esta tardanza (saldo del mes anterior ni HE del mismo día o de los ${COMPENSATION_MATCH_WINDOW_DAYS} días calendario posteriores).`
      );
      return;
    }

    let remaining = effectiveLate;
    const next = { ...selectedDays };
    if (!next[date]) {
      next[date] = { date, recordId: day.record?.id || null, lateMinutes: 0, overtimeMinutes: 0 };
    }
    next[date] = { ...next[date], lateMinutes: 0 };

    for (const compDay of eligible) {
      if (remaining <= 0) break;
      const alreadyUsed = next[compDay.date]?.overtimeMinutes || 0;
      const avail = compDay.overtimeMinutes - alreadyUsed;
      if (avail <= 0) continue;
      const use = Math.min(remaining, avail);
      next[date].lateMinutes += use;
      if (!next[compDay.date]) {
        next[compDay.date] = { date: compDay.date, recordId: compDay.record?.id || null, lateMinutes: 0, overtimeMinutes: 0 };
      }
      next[compDay.date] = { ...next[compDay.date], overtimeMinutes: (next[compDay.date].overtimeMinutes || 0) + use };
      remaining -= use;
    }

    if (next[date].lateMinutes === 0) {
      setStatusMessage("No hay saldo de horas extras suficiente para compensar esta tardanza.");
    } else {
      setStatusMessage(`Día ${date}: ${next[date].lateMinutes} min de tardanza compensados con HE de otros días.`);
    }
    setSelectedDays(next);
  };

  // Seleccionar todos los días compensables usando matching cruzado entre días
  // (tardanza de un día se compensa con HE del mismo día o de hasta 30 días
  // calendario después, con cruce de mes y año permitido)
  const selectAllCompensable = () => {
    const tardanzaDays = allScheduledDays
      .filter((d) => d.lateMinutes > 0 && !d.isPrevMonth && !compensatedDates.has(d.date))
      .map((d) => ({ date: d.date, lateMinutes: d.lateMinutes }));
    const compensableDays = allScheduledDays
      .filter((d) => d.overtimeMinutes > 0 && !d.isPrevMonth && !compensatedDates.has(d.date))
      .map((d) => ({ date: d.date, overtimeMinutes: d.overtimeMinutes }));
    const prevMonthCompensable = allScheduledDays
      .filter((d) => d.overtimeMinutes > 0 && d.isPrevMonth && !compensatedDates.has(d.date))
      .map((d) => ({ date: d.date, overtimeMinutes: d.overtimeMinutes }));

    if (tardanzaDays.length === 0 && compensableDays.length === 0 && prevMonthCompensable.length === 0) {
      setStatusMessage("No hay días con tardanza ni horas extras disponibles en el período.");
      return;
    }
    if (tardanzaDays.length === 0) {
      setStatusMessage("No hay días con tardanza para compensar.");
      return;
    }
    if (compensableDays.length === 0 && prevMonthCompensable.length === 0) {
      setStatusMessage("No hay días con horas extras (HE) disponibles para compensar las tardanzas.");
      return;
    }

    const { assignments, totalCompensated } = computeCrossDayCompensationWithPrevMonth(
      tardanzaDays, compensableDays, prevMonthCompensable, COMPENSATION_MATCH_WINDOW_DAYS
    );

    if (assignments.length === 0) {
      setStatusMessage(
        `No se encontraron coincidencias válidas (saldo del mes anterior ni HE del mismo día o de los ${COMPENSATION_MATCH_WINDOW_DAYS} días calendario posteriores).`
      );
      return;
    }

    const next = {};
    for (const a of assignments) {
      if (!next[a.tardanzaDate]) {
        const day = allScheduledDays.find((d) => d.date === a.tardanzaDate);
        next[a.tardanzaDate] = { date: a.tardanzaDate, recordId: day?.record?.id || null, lateMinutes: 0, overtimeMinutes: 0 };
      }
      next[a.tardanzaDate].lateMinutes += a.minutes;

      if (!next[a.compensableDate]) {
        const day = allScheduledDays.find((d) => d.date === a.compensableDate);
        next[a.compensableDate] = { date: a.compensableDate, recordId: day?.record?.id || null, lateMinutes: 0, overtimeMinutes: 0 };
      }
      next[a.compensableDate].overtimeMinutes += a.minutes;
    }
    setSelectedDays(next);
    setStatusMessage(`Se seleccionaron ${Object.keys(next).length} día(s) con ${totalCompensated} min compensados.`);
  };

  const autoFillAll = () => {
    const selectedDates = Object.keys(selectedDays);
    if (selectedDates.length === 0) {
      setStatusMessage("Primero seleccione al menos un día en la tabla.");
      return;
    }

    // Días de tardanza seleccionados (usar valor manual si existe, si no el del registro)
    const tardanzaDays = allScheduledDays
      .filter((d) => selectedDays[d.date] && (selectedDays[d.date].lateMinutes > 0 || d.lateMinutes > 0))
      .map((d) => ({
        date: d.date,
        lateMinutes: selectedDays[d.date].lateMinutes > 0 ? selectedDays[d.date].lateMinutes : d.lateMinutes,
      }));

    // Días compensables de TODO el período + mes anterior (no solo los seleccionados)
    const compensableDays = allScheduledDays
      .filter((d) => d.overtimeMinutes > 0 && !d.isPrevMonth && !compensatedDates.has(d.date))
      .map((d) => ({ date: d.date, overtimeMinutes: d.overtimeMinutes }));
    const prevMonthCompensable = allScheduledDays
      .filter((d) => d.overtimeMinutes > 0 && d.isPrevMonth && !compensatedDates.has(d.date))
      .map((d) => ({ date: d.date, overtimeMinutes: d.overtimeMinutes }));

    if (tardanzaDays.length === 0) {
      setStatusMessage("Los días seleccionados no tienen tardanza para compensar.");
      return;
    }
    if (compensableDays.length === 0 && prevMonthCompensable.length === 0) {
      setStatusMessage("No hay horas extras (HE) disponibles para compensar las tardanzas seleccionadas.");
      return;
    }

    const { assignments, totalCompensated } = computeCrossDayCompensationWithPrevMonth(
      tardanzaDays, compensableDays, prevMonthCompensable, COMPENSATION_MATCH_WINDOW_DAYS
    );

    if (assignments.length === 0) {
      setStatusMessage(
        `No se encontraron coincidencias válidas (saldo del mes anterior ni HE del mismo día o de los ${COMPENSATION_MATCH_WINDOW_DAYS} días calendario posteriores).`
      );
      return;
    }

    const next = { ...selectedDays };
    // Resetear minutos de los días seleccionados antes de reasignar
    for (const date of selectedDates) {
      next[date] = { ...next[date], lateMinutes: 0, overtimeMinutes: 0 };
    }

    for (const a of assignments) {
      if (!next[a.tardanzaDate]) {
        const day = allScheduledDays.find((d) => d.date === a.tardanzaDate);
        next[a.tardanzaDate] = { date: a.tardanzaDate, recordId: day?.record?.id || null, lateMinutes: 0, overtimeMinutes: 0 };
      }
      next[a.tardanzaDate].lateMinutes += a.minutes;

      if (!next[a.compensableDate]) {
        const day = allScheduledDays.find((d) => d.date === a.compensableDate);
        next[a.compensableDate] = { date: a.compensableDate, recordId: day?.record?.id || null, lateMinutes: 0, overtimeMinutes: 0 };
      }
      next[a.compensableDate].overtimeMinutes += a.minutes;
    }

    setSelectedDays(next);
    setStatusMessage(`Auto-completado: ${assignments.length} asignación(es), ${totalCompensated} min compensados.`);
  };

  const selectedList = Object.entries(selectedDays).map(([date, data]) => {
    const day = allScheduledDays.find((d) => d.date === date);
    return { recordId: data.recordId || null, record: day?.record, ...data };
  });

  const totalLateToCompensate = selectedList.reduce(
    (sum, s) => sum + (s.lateMinutes || 0),
    0
  );
  const totalOvertimeToCompensate = selectedList.reduce(
    (sum, s) => sum + (s.overtimeMinutes || 0),
    0
  );

  // ── Validaciones separadas ──
  // El equilibrio de minutos (tardanza = HE) NO implica que la solicitud sea válida:
  // disponibilidad de HE, elegibilidad de fechas, autorizador y motivo se verifican
  // por separado, y cada bloqueo se comunica con su motivo y sus valores concretos.
  // Se conservan las restricciones comunicadas por los servicios (fechas ya
  // compensadas y HE ya utilizadas), sin relajarlas.
  const selectionIssues = useMemo(() => {
    const issues = [];
    for (const item of selectedList) {
      const day = allScheduledDays.find((d) => d.date === item.date);

      if (compensatedDates.has(item.date)) {
        const existing = existingCompensations.find(
          (c) => c.employee_id === employee?.id && c.incident_date === item.date
        );
        const estado = existing?.status === "Aprobada" ? "aprobada" : "pendiente de aprobación";
        issues.push(
          `Fecha no elegible: el ${item.date} ya tiene una compensación ${estado}; ese día no puede volver a compensarse.`
        );
      }

      if (item.overtimeMinutes > 0) {
        const available = day?.overtimeMinutes || 0;
        if (item.overtimeMinutes > available) {
          issues.push(
            `Disponibilidad insuficiente: el ${item.date} se solicitan ${item.overtimeMinutes} min de HE y quedan ${available} min disponibles (ya se descontaron las HE comprometidas).`
          );
        }
      }

      if (item.lateMinutes > 0) {
        const registered = day?.lateMinutes || 0;
        if (item.lateMinutes > registered) {
          issues.push(
            `Tardanza excedida: el ${item.date} se solicitan ${item.lateMinutes} min de tardanza y la tardanza registrada es de ${registered} min.`
          );
        }
      }

      // Ventana de emparejamiento: las HE del período deben ser del mismo día o
      // posteriores a la tardanza, dentro de los 30 días calendario. Se evalúa
      // contra las tardanzas realmente seleccionadas, para que el guardado aplique
      // exactamente la misma regla que la selección y el resumen.
      // El saldo del mes anterior conserva su tratamiento (sin restricción de cercanía).
      if (item.overtimeMinutes > 0 && day && !day.isPrevMonth) {
        const selectedLateDays = selectedList.filter((s) => (s.lateMinutes || 0) > 0);
        if (selectedLateDays.length > 0) {
          const withinWindow = selectedLateDays.some((s) =>
            isWithinCompensationWindow(s.date, item.date, COMPENSATION_MATCH_WINDOW_DAYS)
          );
          if (!withinWindow) {
            const fechas = selectedLateDays.map((s) => s.date).join(", ");
            const todasPosteriores = selectedLateDays.every((s) => s.date > item.date);
            issues.push(
              `Fuera de ventana: las HE del ${item.date} no pueden compensar la tardanza de ${fechas}. ` +
                (todasPosteriores
                  ? "Las horas extras deben ser del mismo día o posteriores a la tardanza."
                  : `Solo se permite el mismo día o hasta ${COMPENSATION_MATCH_WINDOW_DAYS} días calendario posteriores a la tardanza.`)
            );
          }
        }
      }
    }
    return issues;
  }, [selectedList, allScheduledDays, compensatedDates, existingCompensations, employee]);

  // Avisos (no bloquean el guardado): jornadas cuya HE está destinada a pago y que
  // además se usaría para compensar, por lo que se pagarían y compensarían a la vez.
  // El destino se cambia con una acción explícita sobre la jornada; el sistema no lo
  // cambia por su cuenta.
  const selectionWarnings = useMemo(() => {
    const warnings = [];
    for (const item of selectedList) {
      if ((item.overtimeMinutes || 0) <= 0) continue;
      const day = allScheduledDays.find((d) => d.date === item.date);
      if (day && day.overtimeDestination === "pago" && day.overtimeAuthorized) {
        warnings.push(
          `Las HE del ${item.date} están destinadas a pago: se pagarán en planilla y además compensarán tardanza. ` +
            "Para que no se paguen, cambie el destino de esa jornada a Compensación (acción explícita sobre la jornada) antes de generar la planilla."
        );
      }
    }
    return warnings;
  }, [selectedList, allScheduledDays]);

  // El resumen informa el estado de los minutos; no certifica la validez de la solicitud.
  const minutesBalanced =
    totalLateToCompensate > 0 && totalLateToCompensate === totalOvertimeToCompensate;
  const minutesDifference = Math.abs(totalLateToCompensate - totalOvertimeToCompensate);

  // Distinguir el período evaluado del mes calendario actual
  const periodMonth = periodStart ? periodStart.slice(0, 7) : null;
  const currentMonth = format(new Date(), "yyyy-MM");

  const handleSubmit = async () => {
    setSubmitError(null);
    setStatusMessage(null);
    if (selectedList.length === 0) {
      setStatusMessage("Seleccione al menos un día en la tabla para compensar.");
      return;
    }
    if (selectionIssues.length > 0) {
      setStatusMessage(
        "Corrija los motivos señalados antes de registrar la solicitud."
      );
      return;
    }
    if (!compensationReason.trim()) {
      setStatusMessage("Ingrese el motivo de la compensación.");
      return;
    }
    if (!authorizer) {
      setStatusMessage("Seleccione la persona que debe autorizar la compensación.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(selectedList, compensationReason, authorizer);
    } catch (error) {
      setSubmitError(error?.message || "Ocurrió un error al registrar la compensación.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!employee) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <Card
        className="max-w-4xl w-full my-4 sm:my-0"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold">
                {editMode ? "Editar Compensación" : "Solicitar Compensación"}
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                {employee.first_name} {employee.last_name} —{" "}
                {employee.document_type} {employee.document_number}
                {employeeSchedule && (
                  <span className="text-slate-400">
                    {" · "}
                    {employeeSchedule.schedule_name}
                  </span>
                )}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          {/* Resumen de horas del período — 4 tarjetas */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="w-4 h-4 text-slate-600" />
                <span className="text-[11px] font-semibold text-slate-700">
                  Horas Programadas
                </span>
              </div>
              <p className="text-xl font-bold text-slate-900">
                {fmtHours(summary.scheduledHours)}
              </p>
            </div>
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-[11px] font-semibold text-green-700">
                  Trab. dentro
                </span>
              </div>
              <p className="text-xl font-bold text-green-900">
                {fmtHours(summary.regularHours)}
              </p>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span className="text-[11px] font-semibold text-blue-700">
                  Trab. en exceso
                </span>
              </div>
              <p className="text-xl font-bold text-blue-900">
                {fmtHours(summary.overtimeHours)}
              </p>
            </div>
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-orange-600" />
                <span className="text-[11px] font-semibold text-orange-700">
                  Tardanzas
                </span>
              </div>
              <p className="text-xl font-bold text-orange-900">
                {fmtMinutes(summary.lateMinutes)}
              </p>
            </div>
          </div>

          {/* Resumen mensual de compensación */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-orange-600" />
                <span className="text-[11px] font-semibold text-orange-700">Total Tardanzas</span>
              </div>
              <p className="text-lg font-bold text-orange-900">{monthlySummary.totalLateMin} min</p>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span className="text-[11px] font-semibold text-blue-700">Total Compensable</span>
              </div>
              <p className="text-lg font-bold text-blue-900">{monthlySummary.totalCompensableMin} min</p>
            </div>
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-[11px] font-semibold text-green-700">Total Compensado</span>
              </div>
              <p className="text-lg font-bold text-green-900">{monthlySummary.totalCompensatedMin} min</p>
            </div>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-[11px] font-semibold text-red-700">Saldo Pendiente</span>
              </div>
              <p className="text-lg font-bold text-red-900">{monthlySummary.pendingBalanceMin} min</p>
            </div>
          </div>

          {/* Información de compensación bidireccional */}
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
            <div className="flex items-start gap-2">
              <ArrowRightLeft className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="text-xs text-indigo-800">
                <p className="font-semibold mb-1">Compensación con saldo del mes anterior (HE del mismo día o hasta 30 días calendario después)</p>
                <p>
                  Las tardanzas se compensan con horas en exceso (HE) del mismo
                  día o de hasta <span className="font-medium">30 días calendario después</span>{" "}
                  dentro del mismo mes. Además, se pueden usar las HE de los{" "}
                  <span className="font-medium">últimos 6 días del mes anterior</span>{" "}
                  (incluyendo cambio de año), consumiéndose primero las del mes
                  anterior. No se reutilizan horas ya compensadas ni se permiten
                  saldos negativos.
                </p>
                <p className="mt-2 font-medium">
                  Período evaluado:{" "}
                  {periodStart ? format(parseDateLima(periodStart), "dd/MM/yyyy") : "—"} →{" "}
                  {periodEnd ? format(parseDateLima(periodEnd), "dd/MM/yyyy") : "—"}
                  {periodMonth && (
                    <>
                      {" · "}Mes seleccionado:{" "}
                      {format(parseDateLima(`${periodMonth}-01`), "MMMM yyyy", { locale: es })}
                      {periodMonth !== currentMonth && (
                        <>
                          {" · "}Mes actual:{" "}
                          {format(parseDateLima(`${currentMonth}-01`), "MMMM yyyy", { locale: es })}
                        </>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Selector de autorizador */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Persona que debe autorizar *
            </label>
            {authorizer ? (
              <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold bg-gradient-to-br from-indigo-500 to-purple-600">
                    {authorizer.first_name[0]}{authorizer.last_name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">
                      {authorizer.first_name} {authorizer.last_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {authorizer.position || "Sin cargo"} · {authorizer.department_name || "Sin área"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setAuthorizerId(null); setAuthorizerSearch(""); setShowAuthorizerList(true); }}
                  className="text-slate-500 hover:text-red-500"
                >
                  <X className="w-4 h-4" /> Cambiar
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Buscar por nombre, DNI o cargo..."
                  value={authorizerSearch}
                  onChange={(e) => {
                    setAuthorizerSearch(e.target.value);
                    setShowAuthorizerList(true);
                  }}
                  onFocus={() => setShowAuthorizerList(true)}
                  className="pl-9"
                />
                {showAuthorizerList && (
                  <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
                    {filteredAuthorizers.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-4">
                        No se encontraron empleados
                      </p>
                    ) : (
                      filteredAuthorizers.map((emp) => (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => {
                             setAuthorizerId(emp.id);
                             setShowAuthorizerList(false);
                             setAuthorizerSearch("");
                           }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 transition-colors text-left border-b border-slate-50 last:border-b-0"
                        >
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 bg-gradient-to-br from-slate-400 to-slate-500">
                            {emp.first_name[0]}{emp.last_name[0]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900 text-sm truncate">
                              {emp.first_name} {emp.last_name}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {emp.document_type} {emp.document_number} · {emp.position || ""}
                            </p>
                          </div>
                          <UserCheck className="w-4 h-4 text-slate-300 shrink-0" />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tabla de todos los días del período */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <p className="text-sm font-semibold text-slate-900">
                Seleccione las fechas a compensar:
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                  onClick={selectAllCompensable}
                >
                  <Zap className="w-3 h-3 mr-1" />
                  Seleccionar días con compensación
                </Button>
                {Object.keys(selectedDays).length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                    onClick={autoFillAll}
                  >
                    <Zap className="w-3 h-3 mr-1" />
                    Auto-completar todo
                  </Button>
                )}
              </div>
            </div>
            {allScheduledDays.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-lg">
                <CalendarX className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">
                  No hay días programados ni registros en el período seleccionado
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[360px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">
                        Sel.
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">
                        Fecha
                      </th>
                      <th className="text-left px-2 py-2 text-xs font-semibold text-slate-600">
                        Horario
                      </th>
                      <th className="text-center px-2 py-2 text-xs font-semibold text-green-600">
                        Hrs. Trab.
                      </th>
                      <th className="text-center px-2 py-2 text-xs font-semibold text-orange-600">
                        Tardanza
                      </th>
                      <th className="text-center px-2 py-2 text-xs font-semibold text-blue-600">
                        HE (min)
                      </th>
                      <th className="text-center px-2 py-2 text-xs font-semibold text-slate-600">
                        Compensar
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {allScheduledDays.map((day) => {
                      const isSelected = !!selectedDays[day.date];
                      const isAlreadyCompensated = compensatedDates.has(day.date);
                      return (
                        <tr
                          key={day.date}
                          className={`border-t border-slate-100 ${
                            isSelected ? "bg-indigo-50" : "hover:bg-slate-50"
                          } ${isAlreadyCompensated ? "opacity-50" : ""}`}
                        >
                          <td className="px-3 py-2">
                            <Checkbox
                              checked={isSelected}
                              disabled={isAlreadyCompensated}
                              onCheckedChange={() =>
                                !isAlreadyCompensated && toggleDay(day)
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-medium text-slate-900">
                              {format(parseDateLima(day.date), "dd MMM yyyy", {
                                locale: es,
                              })}
                            </span>
                            <div className="flex items-center gap-1 mt-0.5">
                              {day.isPrevMonth && (
                                <Badge className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0">
                                  Mes anterior
                                </Badge>
                              )}
                              {day.hasRecord ? (
                                <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0">
                                  Trabajado
                                </Badge>
                              ) : (
                                <Badge className="bg-slate-100 text-slate-500 text-[10px] px-1.5 py-0">
                                  <CalendarX className="w-2.5 h-2.5 mr-0.5" />
                                  Sin registro
                                </Badge>
                              )}
                              {isAlreadyCompensated && (
                                <Badge className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0">
                                  Ya compensado
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <span className="text-xs text-slate-500">
                              {day.scheduleTimes
                                ? `${day.scheduleTimes.start} - ${day.scheduleTimes.end}`
                                : day.record
                                  ? `${day.record.scheduled_start || "—"} - ${day.record.scheduled_end || "—"}`
                                  : "—"}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            {day.hasRecord ? (
                              <span className="text-xs font-semibold text-green-700">
                                {fmtHours(day.workedHours ?? 0)}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {day.lateMinutes > 0 ? (
                              <span className="font-bold text-orange-600">
                                {day.lateMinutes}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {day.overtimeMinutes > 0 ? (
                              <span className="font-bold text-blue-600">
                                {day.overtimeMinutes}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {isSelected && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1 justify-center">
                                  {!day.isPrevMonth && (
                                    <Input
                                      type="number"
                                      placeholder="tard"
                                      className="h-8 w-20 text-xs text-center border-orange-300 focus:border-orange-500"
                                      value={selectedDays[day.date]?.lateMinutes || ""}
                                      onChange={(e) =>
                                        updateCompensationMinutes(
                                          day.date,
                                          "lateMinutes",
                                          e.target.value
                                        )
                                      }
                                    />
                                  )}
                                  <Input
                                    type="number"
                                    placeholder="HE"
                                    className="h-8 w-20 text-xs text-center border-blue-300 focus:border-blue-500"
                                    value={selectedDays[day.date]?.overtimeMinutes || ""}
                                    onChange={(e) =>
                                      updateCompensationMinutes(
                                        day.date,
                                        "overtimeMinutes",
                                        e.target.value
                                      )
                                    }
                                  />
                                  {!day.isPrevMonth && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-1.5 text-xs text-indigo-600 hover:bg-indigo-100"
                                      onClick={() => autoFillDay(day.date)}
                                      title="Auto-completar con HE del mes anterior primero y luego del mismo mes"
                                    >
                                      <Zap className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                                <div className="flex justify-center gap-3 text-[9px] text-slate-400">
                                  {!day.isPrevMonth && <span className="text-orange-500">↓ tardanza</span>}
                                  <span className="text-blue-500">↓ HE</span>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Motivo de la compensación *
            </label>
            <Textarea
              value={compensationReason}
              onChange={(e) => setCompensationReason(e.target.value)}
              placeholder="Indique el motivo por el cual se solicita la compensación..."
              rows={2}
            />
          </div>

          {/* Resumen de compensación bidireccional */}
          {selectedList.length > 0 && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-indigo-600" />
                <p className="text-sm font-semibold text-indigo-900">
                  Resumen de compensación
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-white rounded-lg p-2.5 border border-orange-200">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 text-orange-600" />
                    <span className="text-xs font-medium text-orange-700">
                      Tardanza a compensar
                    </span>
                  </div>
                  <p className="text-lg font-bold text-orange-900">
                    {totalLateToCompensate} min
                  </p>
                </div>
                <div className="bg-white rounded-lg p-2.5 border border-blue-200">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-xs font-medium text-blue-700">
                      HE a compensar
                    </span>
                  </div>
                  <p className="text-lg font-bold text-blue-900">
                    {totalOvertimeToCompensate} min
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="text-slate-600">
                  <span className="font-medium">Fechas seleccionadas:</span>{" "}
                  {selectedList.length}
                </div>
                {minutesBalanced && (
                  <Badge className="bg-blue-100 text-blue-700 text-xs">
                    <ArrowRightLeft className="w-3 h-3 mr-1" />
                    Minutos equilibrados
                  </Badge>
                )}
                {totalLateToCompensate > 0 && !minutesBalanced && (
                  <Badge className="bg-amber-100 text-amber-700 text-xs">
                    Diferencia de {minutesDifference} min
                  </Badge>
                )}
              </div>

              {/* Bloqueos de la solicitud, con su motivo específico. El equilibrio de
                  minutos no sustituye estas validaciones de disponibilidad y fechas. */}
              {selectionWarnings.length > 0 && (
                <div className="mt-3 bg-amber-50 border border-amber-300 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-800 mb-1">
                        Aviso sobre el destino de las horas extras:
                      </p>
                      <ul className="space-y-0.5">
                        {selectionWarnings.map((message, index) => (
                          <li key={index} className="text-xs text-amber-700">
                            • {message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {selectionIssues.length > 0 && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-red-700 mb-1">
                        La solicitud no se puede registrar todavía:
                      </p>
                      <ul className="space-y-0.5">
                        {selectionIssues.map((message, index) => (
                          <li key={index} className="text-xs text-red-600">
                            • {message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
              {authorizer && (
                <p className="text-xs text-indigo-700 mt-2 pt-2 border-t border-indigo-100">
                  <UserCheck className="w-3 h-3 inline mr-1" />
                  Autorizador: {authorizer.first_name} {authorizer.last_name}
                </p>
              )}
            </div>
          )}

          {/* Mensaje de estado (validación / feedback de botones) */}
          {statusMessage && !submitError && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">{statusMessage}</p>
            </div>
          )}

          {/* Error de envío */}
          {submitError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              onClick={handleSubmit}
              disabled={
                submitting ||
                selectedList.length === 0 ||
                !compensationReason.trim() ||
                !authorizer ||
                selectionIssues.length > 0
              }
            >
              {submitting
                ? "Guardando..."
                : `${editMode ? "Actualizar" : "Registrar"} compensación (${
                    selectedList.length
                  })`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}