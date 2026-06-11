import React, { useState, useEffect } from "react";
import { entitiesAPI } from '@/api/entitiesClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, AlertCircle, CalendarIcon, CheckCircle, Clock } from "lucide-react";
import { format, eachDayOfInterval } from "date-fns";
import { es } from "date-fns/locale";
import { todayLima, parseDateLima } from "@/lib/dateUtils";
import { toast } from "sonner";
import { uploadFile } from "@/services/uploadService";
import recalcularAsistenciaService from '@/services/recalcularAsistenciaService';

// ── helpers ─────────────────────────────────────────────────────────────────
const toMin = (t) => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toDateStr = value => {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

/**
 * Dados el registro de asistencia, las justificaciones aprobadas del día y el
 * horario programado, calcula cuántas horas "reales + justificadas" tiene el
 * empleado y cuántos minutos de tardanza quedan.
 *
 * Regla de tardanza: si alguna justificación cubre el período schedStart→clock_in,
 * la tardanza queda en 0. Si solo cubre parte, se reduce proporcionalmente.
 */
function calcEffectiveMetrics({ record, approvedIncidents, schedStart, schedEnd, breakMinutes = 60 }) {
  const clockIn  = record?.clock_in;
  const clockOut = record?.clock_out;

  const schedStartMin = toMin(schedStart);
  const schedEndMin   = toMin(schedEnd);
  const fullDayMins   = Math.max(0, schedEndMin - schedStartMin - breakMinutes);

  // Tardanza base del registro real (antes de justificaciones)
  const baseLateMin = clockIn ? Math.max(0, toMin(clockIn) - schedStartMin) : 0;

  // Horas trabajadas del registro real (sin justificaciones)
  let rawWorkedMin = 0;
  if (clockIn && clockOut) {
    rawWorkedMin = Math.max(0, toMin(clockOut) - toMin(clockIn) - breakMinutes);
  }

  // Calcular clock_in y clock_out efectivos considerando todas las justificaciones
  // (si una justificación adelanta la entrada o atrasa la salida, se recalcula)
  let effectiveClockInMin  = clockIn  ? toMin(clockIn)  : null;
  let effectiveClockOutMin = clockOut ? toMin(clockOut) : null;
  let lateMinutesJustified = 0;
  let justifiedMins = 0;
  let fullDayJustified = false;

  for (const inc of approvedIncidents) {
    if (inc.full_day_justification) {
      fullDayJustified = true;
      effectiveClockInMin  = schedStartMin;
      effectiveClockOutMin = schedEndMin;
      lateMinutesJustified = baseLateMin;
      break;
    }
    const jStart = toMin(inc.justified_time_start || schedStart);
    const jEnd   = toMin(inc.justified_time_end   || schedEnd);

    // Adelantar clock_in efectivo si la justificación empieza antes
    if (effectiveClockInMin === null || jStart < effectiveClockInMin) {
      effectiveClockInMin = jStart;
    }
    // Atrasar clock_out efectivo si la justificación termina después
    if (effectiveClockOutMin === null || jEnd > effectiveClockOutMin) {
      effectiveClockOutMin = jEnd;
    }

    // Minutos de tardanza cubiertos por esta justificación
    if (clockIn && baseLateMin > 0) {
      const overlapStart = Math.max(schedStartMin, jStart);
      const overlapEnd   = Math.min(toMin(clockIn), jEnd);
      if (overlapEnd > overlapStart) {
        lateMinutesJustified += (overlapEnd - overlapStart);
      }
    }
  }

  // Calcular horas efectivas con los clock_in/out ajustados
  let effectiveWorkedMin = rawWorkedMin;
  if (!fullDayJustified && effectiveClockInMin !== null && effectiveClockOutMin !== null) {
    effectiveWorkedMin = Math.max(0, effectiveClockOutMin - effectiveClockInMin - breakMinutes);
    // Las "justifiedMins" son la diferencia respecto a las marcadas reales
    justifiedMins = Math.max(0, effectiveWorkedMin - rawWorkedMin);
  } else if (fullDayJustified) {
    effectiveWorkedMin = fullDayMins;
    justifiedMins = Math.max(0, fullDayMins - rawWorkedMin);
  }

  const totalWorkedMins  = Math.min(effectiveWorkedMin, fullDayMins);
  const totalWorkedHours = totalWorkedMins / 60;
  const remainingLate    = Math.max(0, baseLateMin - Math.min(lateMinutesJustified, baseLateMin));

  // Si el clock_in efectivo ya es igual o anterior al schedStart, tardanza = 0
  const effectiveLate = effectiveClockInMin !== null
    ? Math.max(0, effectiveClockInMin - schedStartMin)
    : baseLateMin;

  return {
    rawWorkedHours: rawWorkedMin / 60,
    justifiedHours: justifiedMins / 60,
    totalWorkedHours,
    fullDayHours: fullDayMins / 60,
    baseLateMinutes: baseLateMin,
    remainingLateMinutes: effectiveLate,
    lateMinutesJustified: baseLateMin - effectiveLate,
  };
}

// ── Component ────────────────────────────────────────────────────────────────
export default function JustifyModal({
  justifyingEmployee,
  justificationData,
  setJustificationData,
  selectedDate,
  employeeSchedule,
  attendanceRecord,
  todayRecords,
  employee,
  existingIncident,
  workSchedules = [],
  onClose,
  onSuccess,
}) {
  const schedStart   = employeeSchedule?.start || "09:00";
  const schedEnd     = employeeSchedule?.end   || "18:00";
  const breakMinutes = employeeSchedule?.break_duration_minutes ?? 60;

  const getFullDayHours = () => {
    const totalMin = toMin(schedEnd) - toMin(schedStart) - breakMinutes;
    return Math.max(0, totalMin / 60);
  };

  // Justificaciones aprobadas existentes para este día (sin contar la que se está editando)
  const [dayIncidents, setDayIncidents] = useState([]);
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  useEffect(() => {
    let cancelled = false;
    setDayIncidents([]);

    entitiesAPI.AttendanceIncident.filter({
      employee_id: justifyingEmployee.id,
      incident_date: dateStr,
    }).then((incidents) => {
      if (cancelled) return;
      setDayIncidents(incidents.filter(i =>
        i.employee_id === justifyingEmployee.id &&
        toDateStr(i.incident_date) === dateStr &&
        i.status === "Aprobada"
      ));
    }).catch(() => {
      if (!cancelled) setDayIncidents([]);
    });

    return () => {
      cancelled = true;
    };
  }, [justifyingEmployee.id, dateStr]);

  // Construir lista de incidentes activos para el cálculo (existentes + el actual)
  const getActiveIncidents = () => {
    const currentAsIncident = {
      full_day_justification: justificationData.full_day_justification,
      justified_time_start: justificationData.justified_time_start,
      justified_time_end: justificationData.justified_time_end,
      status: "Aprobada",
      incident_type: justificationData.incident_type,
      _isCurrent: true,
    };

    // Si hay existingIncident, lo reemplazamos en la lista con el actual
    const others = existingIncident
      ? dayIncidents.filter(i => i.id !== existingIncident.id)
      : dayIncidents;

    return [...others, currentAsIncident];
  };

  // Métricas proyectadas (con la justificación actual incluida)
  const projected = calcEffectiveMetrics({
    record: attendanceRecord,
    approvedIncidents: getActiveIncidents(),
    schedStart,
    schedEnd,
    breakMinutes,
  });

  // Métricas sin la justificación actual (solo las existentes)
  const currentOnly = calcEffectiveMetrics({
    record: attendanceRecord,
    approvedIncidents: existingIncident
      ? dayIncidents.filter(i => i.id !== existingIncident.id)
      : dayIncidents,
    schedStart,
    schedEnd,
    breakMinutes,
  });

  // ── Estado UI ────────────────────────────────────────────────────────────
  const [uploadingFile, setUploadingFile]   = useState(false);
  const [submitting, setSubmitting]         = useState(false);
  const [validationError, setValidationError] = useState("");
  const [incidentSearch, setIncidentSearch] = useState("");
  const [multiDateMode, setMultiDateMode]   = useState(false);
  const [dateRangeStart, setDateRangeStart] = useState(null);
  const [dateRangeEnd, setDateRangeEnd]     = useState(null);
  const [extraDates, setExtraDates]         = useState([]);

  const INCIDENT_TYPES = [
    "Comisión de Servicio","Capacitación","Descanso Médico","Omisión de Marcación",
    "Cita Médica","Confirmación de Asistencia (Limitación de Sistema)",
    "Licencia por Maternidad","Licencia por Paternidad","Otro","Onomástico",
    "Descanso Vacacional","Licencia sin Goce de Haber","Feriado",
    "Justificación de Tardanza","Tardanza","Falta","Salida Temprana",
  ];

  const filteredIncidentTypes = INCIDENT_TYPES.filter(t =>
    t.toLowerCase().includes(incidentSearch.toLowerCase())
  );

  const getTargetDates = () => {
    if (!multiDateMode) return [format(selectedDate, "yyyy-MM-dd")];
    const dates = new Set();
    if (dateRangeStart && dateRangeEnd) {
      eachDayOfInterval({ start: dateRangeStart, end: dateRangeEnd }).forEach(d => dates.add(format(d, "yyyy-MM-dd")));
    } else if (dateRangeStart) {
      dates.add(format(dateRangeStart, "yyyy-MM-dd"));
    }
    extraDates.forEach(d => dates.add(d));
    return [...dates].sort();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      // const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const { file_url } = await uploadFile(file);
      setJustificationData({ ...justificationData, supporting_document_url: file_url });
      toast.success("Archivo subido correctamente");
    } catch { toast.error("Error al subir el archivo"); }
    finally { setUploadingFile(false); }
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setValidationError("");

    if (!justificationData.incident_type) { setValidationError("El campo 'Tipo de Incidente' es obligatorio."); return; }
    if (!justificationData.justification.trim()) { setValidationError("El campo 'Justificación' es obligatorio."); return; }

    const targetDates = getTargetDates();
    if (targetDates.length === 0) { setValidationError("Debes seleccionar al menos una fecha."); return; }

    if (!justificationData.full_day_justification) {
      if (!justificationData.justified_time_start || !justificationData.justified_time_end) {
        setValidationError("Debes ingresar Hora de Inicio y Hora de Fin.");
        return;
      }
      if (toMin(justificationData.justified_time_end) <= toMin(justificationData.justified_time_start)) {
        setValidationError("La 'Hora de Fin' debe ser posterior a la 'Hora de Inicio'.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const timeStart = justificationData.full_day_justification ? schedStart : justificationData.justified_time_start;
      const timeEnd   = justificationData.full_day_justification ? schedEnd   : justificationData.justified_time_end;

      let hoursToAdjust = 0;
      if (justificationData.full_day_justification) {
        hoursToAdjust = getFullDayHours();
      } else if (timeStart && timeEnd) {
        hoursToAdjust = Math.max(0, (toMin(timeEnd) - toMin(timeStart)) / 60);
      }

      const minDate = targetDates[0];
      const maxDate = targetDates[targetDates.length - 1];

      const [allIncidentsInRange, allRecordsInRange] = await Promise.all([
        entitiesAPI.AttendanceIncident.filter({ employee_id: justifyingEmployee.id }),
        entitiesAPI.AttendanceRecord.filter({ employee_id: justifyingEmployee.id }),
      ]);

      const incidentsByDate = {};
      allIncidentsInRange.forEach(i => { incidentsByDate[i.incident_date] = i; });
      const recordsByDate = {};
      allRecordsInRange.forEach(r => { recordsByDate[r.date] = r; });

      for (const dStr of targetDates) {
        // ── Guardar incidente ──────────────────────────────────────────────
        const incidentPayload = {
          employee_id: justifyingEmployee.id,
          incident_date: dStr,
          incident_type: justificationData.incident_type,
          justification: justificationData.justification,
          supporting_document_url: justificationData.supporting_document_url,
          justified_time_start: timeStart,
          justified_time_end: timeEnd,
          full_day_justification: justificationData.full_day_justification,
          hours_to_adjust: hoursToAdjust,
          late_minutes_to_adjust: 0,
          status: "Aprobada",
          reviewed_by: `${employee.first_name} ${employee.last_name}`,
          review_date: todayLima(),
          review_comments: "Justificación registrada por el administrador",
        };

        const existingInc = incidentsByDate[dStr];
        if (existingInc) {
          await entitiesAPI.AttendanceIncident.update(existingInc.id, incidentPayload);
        } else {
          await entitiesAPI.AttendanceIncident.create(incidentPayload);
        }

        // ── Recalcular métricas del registro usando TODAS las justificaciones ──
        const existingRecord = recordsByDate[dStr];

        // Obtener todas las justificaciones aprobadas del día (incluyendo la recién guardada)
        const updatedIncidents = allIncidentsInRange
          .filter(i => i.incident_date === dStr && i.status === "Aprobada" && i.id !== existingInc?.id)
          .concat([{ ...incidentPayload, status: "Aprobada" }]);

        const metrics = calcEffectiveMetrics({
          record: existingRecord,
          approvedIncidents: updatedIncidents,
          schedStart,
          schedEnd,
          breakMinutes,
        });

        // Calcular clock_in y clock_out efectivos tras la justificación
        let finalClockIn  = existingRecord?.clock_in  || null;
        let finalClockOut = existingRecord?.clock_out || null;

        if (justificationData.full_day_justification) {
          // Día completo: usar siempre el horario programado
          finalClockIn  = schedStart;
          finalClockOut = schedEnd;
        } else if (timeStart && timeEnd) {
          const justStartMin = toMin(timeStart);
          const justEndMin   = toMin(timeEnd);
          // Si la justificación empieza ANTES del clock_in actual → adelantar clock_in
          if (!finalClockIn || justStartMin < toMin(finalClockIn)) {
            finalClockIn = timeStart;
          }
          // Si la justificación termina DESPUÉS del clock_out actual → atrasar clock_out
          if (!finalClockOut || justEndMin > toMin(finalClockOut)) {
            finalClockOut = timeEnd;
          }
        }

        const recordUpdate = {
          worked_hours: Math.round(metrics.totalWorkedHours * 100) / 100,
          late_minutes: metrics.remainingLateMinutes,
          is_late: metrics.remainingLateMinutes > 0,
          is_absent: false,
          status: "Justificado",
          clock_in:  finalClockIn,
          clock_out: finalClockOut,
        };

        // Preserve original clock_in/clock_out if they already exist — don't overwrite with justified times
        if (!existingRecord?.clock_in && timeStart) recordUpdate.clock_in = timeStart;
        if (!existingRecord?.clock_out && timeEnd) recordUpdate.clock_out = timeEnd;

        let savedRecordId = null;
        if (existingRecord) {
          await entitiesAPI.AttendanceRecord.update(existingRecord.id, recordUpdate);
        } else {
          const created = await entitiesAPI.AttendanceRecord.create({
            employee_id: justifyingEmployee.id,
            date: dStr,
            ...recordUpdate,
          });
          savedRecordId = created?.id;
        }

        // Check if the original record had overtime without authorization → create alert
        if (existingRecord?.clock_in && existingRecord?.clock_out) {
          const schedule = workSchedules.find(s => {
            if (!s.is_active) return false;
            const from = s.effective_from || "0000-01-01";
            const to = s.effective_to || "9999-12-31";
            const fromStr = typeof from === "string" ? from : from.toISOString().slice(0, 10);
            const toStr = typeof to === "string" ? to : to.toISOString().slice(0, 10);
            return (s.employee_id === justifyingEmployee.id || (!s.employee_id)) &&
              fromStr <= dStr && toStr >= dStr;
          });

          if (schedule) {
            const dow = new Date(dStr + "T00:00:00").getDay();
            const dayEndMap = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];
            const schedEnd = schedule[dayEndMap[dow]] || "18:00";
            const breakMin = schedule.break_duration_minutes ?? 60;
            const [inH, inM] = existingRecord.clock_in.split(":").map(Number);
            const [outH, outM] = existingRecord.clock_out.split(":").map(Number);
            const [endH, endM] = schedEnd.split(":").map(Number);
            const workedMin = (outH * 60 + outM) - (inH * 60 + inM) - breakMin;
            const workedHrs = Math.max(0, workedMin / 60);
            const schedEndMin = endH * 60 + endM;
            const normalHrs = Math.max(0, (schedEndMin - (inH * 60 + inM) - breakMin) / 60);
            const extraHrs = Math.max(0, workedHrs - normalHrs);
            const overtimeAuth = existingRecord.overtime_authorized ?? schedule.overtime_authorized ?? false;

            if (extraHrs > 0 && !overtimeAuth && savedRecordId) {
              const existingAlert = await entitiesAPI.OvertimeAlert.filter({
                attendance_record_id: savedRecordId,
                status: "Pendiente",
              });
              if (!existingAlert || existingAlert.length === 0) {
                await entitiesAPI.OvertimeAlert.create({
                  employee_id: justifyingEmployee.id,
                  attendance_record_id: savedRecordId,
                  alert_date: dateStr,
                  overtime_hours: extraHrs,
                  status: "Pendiente",
                });
                toast.warning(`⚠️ ${Number(extraHrs).toFixed(2)}h extras sin autorización — se generó alerta.`);
              }
            }
          }
        }
      }

      // Recalcular métricas (tardanza, HE 25%, HE 35%) para todas las fechas justificadas
      // const minDate = targetDates[0];
      // const maxDate = targetDates[targetDates.length - 1];
      // await base44.functions.invoke("recalcularAsistencia", {
        // employee_id: justifyingEmployee.id,
        // date_from: minDate,
        // date_to: maxDate,
      // });
      await recalcularAsistenciaService.invoke(
        justifyingEmployee.id,
        minDate,
        maxDate
      );

      toast.success(
        targetDates.length === 1
          ? "Justificación guardada y métricas recalculadas"
          : `${targetDates.length} justificaciones guardadas y métricas recalculadas`
      );
      onSuccess();
    } catch (error) {
      toast.error("Error al guardar la justificación");
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  const targetDates = getTargetDates();

  // ── Helpers de vista ─────────────────────────────────────────────────────
  const incidentTypeColor = (type) => {
    if (type?.includes("Tardanza") || type?.includes("tardanza")) return "bg-orange-100 text-orange-700";
    if (type?.includes("Falta")) return "bg-red-100 text-red-700";
    if (type?.includes("Médico") || type?.includes("Médica")) return "bg-blue-100 text-blue-700";
    if (type?.includes("Vacacional") || type?.includes("Maternidad") || type?.includes("Paternidad")) return "bg-amber-100 text-amber-700";
    return "bg-slate-100 text-slate-700";
  };

  // ¿La justificación actual afecta la tardanza?
  const affectsTardanza = () => {
    if (justificationData.full_day_justification) return true;
    const ts = justificationData.justified_time_start;
    const te = justificationData.justified_time_end;
    if (!ts || !te || !attendanceRecord?.clock_in) return false;
    const clockInMin = toMin(attendanceRecord.clock_in.slice(0, 5));
    const schedStartMin = toMin(schedStart);
    if (clockInMin <= schedStartMin) return false; // no hay tardanza
    // El período justificado solapa con [schedStart, clockIn]
    return toMin(ts) <= clockInMin && toMin(te) >= schedStartMin;
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <Card
        className="max-w-2xl w-full max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold">Justificar Asistencia</CardTitle>
              <p className="text-sm text-slate-600 mt-0.5">
                {justifyingEmployee.first_name} {justifyingEmployee.last_name}
                {!multiDateMode && <> • {format(selectedDate, "dd 'de' MMMM, yyyy", { locale: es })}</>}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>✕</Button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div className="space-y-5">

            {/* Error de validación */}
            {validationError && (
              <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-red-700">{validationError}</p>
              </div>
            )}

            {/* ── PANEL: Estado actual del día ─────────────────────────── */}
            {!multiDateMode && (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                {/* Cabecera del panel */}
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                    📋 Estado del día — Horario {schedStart}–{schedEnd}
                  </p>
                </div>

                {/* Marcación real */}
                <div className="px-4 py-3 bg-white border-b border-slate-100">
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-500">Entrada:</span>
                      <span className="font-semibold text-slate-800">{attendanceRecord?.clock_in || "--:--"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-500">Salida:</span>
                      <span className="font-semibold text-slate-800">{attendanceRecord?.clock_out || "--:--"}</span>
                    </div>
                    {currentOnly.baseLateMinutes > 0 && (
                      <Badge className={`text-xs ${currentOnly.remainingLateMinutes === 0 ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                        {currentOnly.remainingLateMinutes === 0
                          ? "✓ Tardanza justificada"
                          : `⏰ Tardanza: ${currentOnly.remainingLateMinutes} min`}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Tabla hija: justificaciones existentes del día */}
                {dayIncidents.length > 0 && (
                  <div className="border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-2 bg-slate-50">
                      Justificaciones registradas para este día
                    </p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left px-4 py-1.5 font-semibold text-slate-500">Tipo</th>
                          <th className="text-center px-3 py-1.5 font-semibold text-slate-500">Período</th>
                          <th className="text-center px-3 py-1.5 font-semibold text-slate-500">Horas</th>
                          <th className="text-center px-3 py-1.5 font-semibold text-slate-500">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayIncidents.map((inc) => {
                          const incHours = inc.full_day_justification
                            ? getFullDayHours()
                            : Math.max(0, (toMin(inc.justified_time_end) - toMin(inc.justified_time_start)) / 60);
                          const isBeingEdited = existingIncident?.id === inc.id;
                          return (
                            <tr key={inc.id} className={`border-b border-slate-50 ${isBeingEdited ? "bg-indigo-50" : "bg-white"}`}>
                              <td className="px-4 py-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${incidentTypeColor(inc.incident_type)}`}>
                                  {inc.incident_type}
                                </span>
                                {isBeingEdited && <span className="ml-1 text-indigo-600 text-xs">(editando)</span>}
                              </td>
                              <td className="px-3 py-2 text-center text-slate-700">
                                {inc.full_day_justification
                                  ? <span className="text-indigo-600 font-medium">Día completo</span>
                                  : `${inc.justified_time_start} – ${inc.justified_time_end}`}
                              </td>
                              <td className="px-3 py-2 text-center font-semibold text-slate-800">
                                {incHours.toFixed(2)}h
                              </td>
                              <td className="px-3 py-2 text-center">
                                <Badge className="bg-green-100 text-green-700 text-xs">Aprobada</Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Resumen proyectado */}
                <div className="px-4 py-3 bg-white">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Proyección con esta justificación
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                      <p className="text-xs text-slate-400 mb-0.5">Marcadas</p>
                      <p className="text-base font-bold text-slate-700">{projected.rawWorkedHours.toFixed(2)}h</p>
                    </div>
                    <div className="bg-indigo-50 rounded-lg p-2 text-center">
                      <p className="text-xs text-indigo-400 mb-0.5">Justificadas</p>
                      <p className="text-base font-bold text-indigo-700">{projected.justifiedHours.toFixed(2)}h</p>
                    </div>
                    <div className={`rounded-lg p-2 text-center ${projected.totalWorkedHours >= projected.fullDayHours ? "bg-green-50" : "bg-amber-50"}`}>
                      <p className={`text-xs mb-0.5 ${projected.totalWorkedHours >= projected.fullDayHours ? "text-green-400" : "text-amber-400"}`}>Total</p>
                      <p className={`text-base font-bold ${projected.totalWorkedHours >= projected.fullDayHours ? "text-green-700" : "text-amber-700"}`}>
                        {projected.totalWorkedHours.toFixed(2)}h
                      </p>
                    </div>
                    <div className={`rounded-lg p-2 text-center ${projected.remainingLateMinutes === 0 ? "bg-green-50" : "bg-orange-50"}`}>
                      <p className={`text-xs mb-0.5 ${projected.remainingLateMinutes === 0 ? "text-green-400" : "text-orange-400"}`}>Tardanza</p>
                      <p className={`text-base font-bold ${projected.remainingLateMinutes === 0 ? "text-green-700" : "text-orange-700"}`}>
                        {projected.remainingLateMinutes}m
                      </p>
                    </div>
                  </div>

                  {/* Mensajes contextuales */}
                  <div className="mt-2 space-y-1">
                    {projected.totalWorkedHours >= projected.fullDayHours && (
                      <p className="text-xs text-green-700 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Jornada completa ({projected.fullDayHours.toFixed(2)}h)
                      </p>
                    )}
                    {projected.totalWorkedHours < projected.fullDayHours && (
                      <p className="text-xs text-amber-700">
                        ⚠️ Faltan {(projected.fullDayHours - projected.totalWorkedHours).toFixed(2)}h para completar la jornada
                      </p>
                    )}
                    {affectsTardanza() && projected.lateMinutesJustified > 0 && (
                      <p className="text-xs text-indigo-700 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        {projected.remainingLateMinutes === 0
                          ? `Tardanza de ${projected.baseLateMinutes} min queda justificada`
                          : `Se justifican ${projected.lateMinutesJustified} min de tardanza (quedan ${projected.remainingLateMinutes} min)`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Multi-date toggle ─────────────────────────────────────── */}
            <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <input
                type="checkbox"
                id="multi_date_mode"
                checked={multiDateMode}
                onChange={(e) => {
                  setMultiDateMode(e.target.checked);
                  setDateRangeStart(null); setDateRangeEnd(null); setExtraDates([]);
                  setValidationError("");
                }}
                className="w-4 h-4 text-indigo-600"
              />
              <label htmlFor="multi_date_mode" className="text-sm font-medium text-indigo-900 cursor-pointer">
                Justificar múltiples días (rango de fechas)
              </label>
            </div>

            {/* Date range selector */}
            {multiDateMode && (
              <div className="space-y-4 p-4 border border-slate-200 rounded-lg bg-slate-50">
                <p className="text-sm font-semibold text-slate-900">Selecciona el rango de fechas a justificar</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de inicio <span className="text-red-500">*</span></label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left text-sm">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRangeStart ? format(dateRangeStart, "dd MMM yyyy", { locale: es }) : "Seleccionar"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={dateRangeStart}
                          onSelect={(d) => { setDateRangeStart(d); if (dateRangeEnd && d && d > dateRangeEnd) setDateRangeEnd(null); }}
                          locale={es} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de fin</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left text-sm">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRangeEnd ? format(dateRangeEnd, "dd MMM yyyy", { locale: es }) : "Seleccionar"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={dateRangeEnd} onSelect={setDateRangeEnd}
                          disabled={(d) => dateRangeStart ? d < dateRangeStart : false} locale={es} />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                {targetDates.length > 0 && (
                  <div className="p-3 bg-white border border-indigo-200 rounded-lg">
                    <p className="text-xs font-semibold text-indigo-900 mb-1">{targetDates.length} día(s) seleccionado(s):</p>
                    <div className="flex flex-wrap gap-1">
                      {targetDates.map(d => (
                        <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-800 text-xs rounded-full">
                          {format(parseDateLima(d), "dd MMM", { locale: es })}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tipo de incidente ─────────────────────────────────────── */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Tipo de Incidente <span className="text-red-500">*</span>
              </label>
              <Select
                value={justificationData.incident_type}
                onValueChange={(v) => { setJustificationData({ ...justificationData, incident_type: v }); setValidationError(""); setIncidentSearch(""); }}
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar tipo..." /></SelectTrigger>
                <SelectContent>
                  <div className="p-2 border-b sticky top-0 bg-white z-10">
                    <Input placeholder="Buscar tipo..." value={incidentSearch}
                      onChange={(e) => setIncidentSearch(e.target.value)}
                      className="h-8 text-sm" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} />
                  </div>
                  {filteredIncidentTypes.length > 0
                    ? filteredIncidentTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)
                    : <div className="px-3 py-2 text-sm text-slate-400">Sin resultados</div>}
                </SelectContent>
              </Select>
            </div>

            {/* ── Período a justificar ──────────────────────────────────── */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Período a Justificar <span className="text-red-500">*</span>
              </label>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <input
                    type="checkbox"
                    checked={justificationData.full_day_justification}
                    onChange={(e) => {
                      setJustificationData({
                        ...justificationData,
                        full_day_justification: e.target.checked,
                        justified_time_start: e.target.checked ? schedStart : justificationData.justified_time_start,
                        justified_time_end:   e.target.checked ? schedEnd   : justificationData.justified_time_end,
                      });
                      setValidationError("");
                    }}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <label className="text-sm font-medium text-slate-900">
                    {multiDateMode
                      ? `Día completo (${schedStart}–${schedEnd}, ${getFullDayHours().toFixed(1)}h) — aplica a todos los días`
                      : `Justificar día completo (${schedStart}–${schedEnd}, ${getFullDayHours().toFixed(1)}h)`}
                  </label>
                </div>

                {!justificationData.full_day_justification && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Hora de Inicio <span className="text-red-500">*</span></label>
                      <Input
                        type="time"
                        value={justificationData.justified_time_start || ""}
                        onChange={(e) => { setJustificationData({ ...justificationData, justified_time_start: e.target.value }); setValidationError(""); }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Hora de Fin <span className="text-red-500">*</span></label>
                      <Input
                        type="time"
                        value={justificationData.justified_time_end || ""}
                        onChange={(e) => { setJustificationData({ ...justificationData, justified_time_end: e.target.value }); setValidationError(""); }}
                      />
                    </div>
                  </div>
                )}

                {affectsTardanza() && !justificationData.full_day_justification && (
                  <div className="flex items-start gap-2 p-2 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-indigo-800">
                      Este período justifica la tardanza de <strong>{projected.baseLateMinutes} min</strong>
                      {projected.remainingLateMinutes > 0 ? ` (quedan ${projected.remainingLateMinutes} min)` : " completamente"}.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Texto de justificación ────────────────────────────────── */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Justificación <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={justificationData.justification}
                onChange={(e) => { setJustificationData({ ...justificationData, justification: e.target.value }); setValidationError(""); }}
                placeholder="Explica el motivo de la incidencia..."
                rows={3}
              />
            </div>

            {/* ── Documento adjunto ─────────────────────────────────────── */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Documento de Sustento (opcional)</label>
              <div className="space-y-2">
                <Input type="file" onChange={handleFileUpload} disabled={uploadingFile} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
                {uploadingFile && <p className="text-xs text-blue-600">Subiendo archivo...</p>}
                {justificationData.supporting_document_url && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <FileText className="w-4 h-4 text-green-600" />
                    <a href={justificationData.supporting_document_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-green-700 hover:underline flex-1">Archivo adjunto</a>
                    <Button size="sm" variant="ghost" onClick={() => setJustificationData({ ...justificationData, supporting_document_url: "" })}>✕</Button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Acciones ──────────────────────────────────────────────── */}
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
              <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={handleSubmit} disabled={submitting}>
                {submitting
                  ? "Guardando..."
                  : multiDateMode && targetDates.length > 1
                    ? `Justificar ${targetDates.length} días`
                    : existingIncident ? "Actualizar Justificación" : "Crear Justificación"}
              </Button>
            </div>

          </div>
        </CardContent>
      </Card>
    </div>
  );
}
