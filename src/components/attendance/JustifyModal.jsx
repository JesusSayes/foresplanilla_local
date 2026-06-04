import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, AlertCircle, CalendarIcon, Plus, X } from "lucide-react";
import { format, eachDayOfInterval } from "date-fns";
import { es } from "date-fns/locale";
import { todayLima, parseDateLima } from "@/lib/dateUtils";
import { toast } from "sonner";

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
  onClose,
  onSuccess,
}) {
  // Horas del horario real del empleado (fallback a 09:00-18:00)
  const schedStart = employeeSchedule?.start || "09:00";
  const schedEnd   = employeeSchedule?.end   || "18:00";

  // Calcular horas del día completo según horario
  const getFullDayHours = () => {
    const [sh, sm] = schedStart.split(":").map(Number);
    const [eh, em] = schedEnd.split(":").map(Number);
    const totalMin = (eh * 60 + em) - (sh * 60 + sm);
    return Math.max(0, totalMin / 60);
  };

  // Calcular horas a justificar según el período seleccionado
  const getJustifiedHours = () => {
    if (justificationData.full_day_justification) return getFullDayHours();
    const ts = justificationData.justified_time_start;
    const te = justificationData.justified_time_end;
    if (!ts || !te) return 0;
    const [sh, sm] = ts.split(":").map(Number);
    const [eh, em] = te.split(":").map(Number);
    return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60);
  };

  // Calcular horas ya trabajadas según el registro real
  const getWorkedHoursFromRecord = () => {
    if (!attendanceRecord) return 0;
    return attendanceRecord.worked_hours || 0;
  };

  // Info del panel de diagnóstico
  const buildAttendanceInfo = () => {
    const hasClockIn  = !!attendanceRecord?.clock_in;
    const hasClockOut = !!attendanceRecord?.clock_out;
    const workedHrs   = getWorkedHoursFromRecord();
    const justHrs     = getJustifiedHours();
    const totalHrs    = Math.min(workedHrs + justHrs, 8);
    const fullDayHrs  = getFullDayHours();

    if (!hasClockIn && !hasClockOut) {
      return {
        type: "sin_marcacion",
        label: "Sin marcación",
        color: "red",
        worked: 0,
        justified: justHrs,
        total: justHrs,
        fullDay: fullDayHrs,
        message: `Sin registro de asistencia. Justificar día completo: ${schedStart}–${schedEnd}`,
      };
    }
    if (hasClockIn && !hasClockOut) {
      return {
        type: "sin_salida",
        label: "Tiene entrada, sin salida",
        color: "orange",
        worked: workedHrs,
        justified: justHrs,
        total: totalHrs,
        fullDay: fullDayHrs,
        clockIn: attendanceRecord.clock_in,
        message: `Entrada registrada a las ${attendanceRecord.clock_in}. Se justifica el período de salida faltante.`,
      };
    }
    if (hasClockIn && hasClockOut) {
      return {
        type: "completo",
        label: "Con entrada y salida",
        color: "blue",
        worked: workedHrs,
        justified: justHrs,
        total: totalHrs,
        fullDay: fullDayHrs,
        clockIn: attendanceRecord.clock_in,
        clockOut: attendanceRecord.clock_out,
        message: `Marcación: ${attendanceRecord.clock_in}–${attendanceRecord.clock_out}. Se suman las horas justificadas a las trabajadas.`,
      };
    }
    return null;
  };

  const attInfo = buildAttendanceInfo();
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [incidentSearch, setIncidentSearch] = useState("");

  const INCIDENT_TYPES = [
    "Comisión de Servicio",
    "Capacitación",
    "Descanso Médico",
    "Omisión de Marcación",
    "Cita Médica",
    "Confirmación de Asistencia (Limitación de Sistema)",
    "Licencia por Maternidad",
    "Licencia por Paternidad",
    "Otro",
    "Onomástico",
    "Descanso Vacacional",
    "Licencia sin Goce de Haber",
    "Feriado",
    "Justificación de Tardanza",
    "Tardanza",
    "Falta",
    "Salida Temprana",
  ];

  const filteredIncidentTypes = INCIDENT_TYPES.filter(t =>
    t.toLowerCase().includes(incidentSearch.toLowerCase())
  );

  // Multi-date mode
  const [multiDateMode, setMultiDateMode] = useState(false);
  const [dateRangeStart, setDateRangeStart] = useState(null);
  const [dateRangeEnd, setDateRangeEnd] = useState(null);
  const [extraDates, setExtraDates] = useState([]); // additional individual dates

  // Compute all dates to justify
  const getTargetDates = () => {
    if (!multiDateMode) {
      return [format(selectedDate, "yyyy-MM-dd")];
    }
    const dates = new Set();
    // Range
    if (dateRangeStart && dateRangeEnd) {
      eachDayOfInterval({ start: dateRangeStart, end: dateRangeEnd }).forEach(d => {
        dates.add(format(d, "yyyy-MM-dd"));
      });
    } else if (dateRangeStart) {
      dates.add(format(dateRangeStart, "yyyy-MM-dd"));
    }
    // Extra individual dates
    extraDates.forEach(d => dates.add(d));
    return [...dates].sort();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setJustificationData({ ...justificationData, supporting_document_url: file_url });
      toast.success("Archivo subido correctamente");
    } catch (error) {
      toast.error("Error al subir el archivo");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmit = async () => {
    setValidationError("");

    if (!justificationData.incident_type) {
      setValidationError("El campo 'Tipo de Incidente' es obligatorio.");
      return;
    }
    if (!justificationData.justification.trim()) {
      setValidationError("El campo 'Justificación' es obligatorio.");
      return;
    }

    const targetDates = getTargetDates();
    if (targetDates.length === 0) {
      setValidationError("Debes seleccionar al menos una fecha.");
      return;
    }

    if (!justificationData.full_day_justification) {
      const isOlvidoMarcacion = justificationData.incident_type === "Omisión de Marcación" || justificationData.incident_type === "Olvido de Marcación";
      if (!isOlvidoMarcacion) {
        if (!justificationData.justified_time_start) {
          setValidationError("El campo 'Hora de Inicio' es obligatorio cuando no se justifica el día completo.");
          return;
        }
        if (!justificationData.justified_time_end) {
          setValidationError("El campo 'Hora de Fin' es obligatorio cuando no se justifica el día completo.");
          return;
        }
      } else {
        if (!justificationData.justified_time_start && !justificationData.justified_time_end) {
          setValidationError("Debes ingresar al menos la Hora de Inicio o la Hora de Fin.");
          return;
        }
      }
      if (justificationData.justified_time_start && justificationData.justified_time_end) {
        const [sh, sm] = justificationData.justified_time_start.split(":").map(Number);
        const [eh, em] = justificationData.justified_time_end.split(":").map(Number);
        if ((eh * 60 + em) <= (sh * 60 + sm)) {
          setValidationError("La 'Hora de Fin' debe ser posterior a la 'Hora de Inicio'.");
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const timeStart = justificationData.full_day_justification ? schedStart : justificationData.justified_time_start;
      const timeEnd = justificationData.full_day_justification ? schedEnd : justificationData.justified_time_end;

      let hoursToAdjust = 0;
      const lateMinutesToAdjust = 0;

      if (justificationData.full_day_justification) {
        hoursToAdjust = getFullDayHours();
      } else if (timeStart && timeEnd) {
        const [sh, sm] = timeStart.split(":").map(Number);
        const [eh, em] = timeEnd.split(":").map(Number);
        hoursToAdjust = Math.min(((eh * 60 + em) - (sh * 60 + sm)) / 60, 8);
      }

      // Pre-fetch all existing incidents and records for the employee in the target date range
      // to avoid unique constraint violations when creating new entries
      const minDate = targetDates[0];
      const maxDate = targetDates[targetDates.length - 1];

      const [allIncidentsInRange, allRecordsInRange] = await Promise.all([
        base44.entities.AttendanceIncident.filter({ employee_id: justifyingEmployee.id }),
        base44.entities.AttendanceRecord.filter({ employee_id: justifyingEmployee.id }),
      ]);

      const incidentsByDate = {};
      allIncidentsInRange.forEach(i => { incidentsByDate[i.incident_date] = i; });

      const recordsByDate = {};
      allRecordsInRange.forEach(r => { recordsByDate[r.date] = r; });

      for (const dateStr of targetDates) {
        const incidentPayload = {
          employee_id: justifyingEmployee.id,
          incident_date: dateStr,
          incident_type: justificationData.incident_type,
          justification: justificationData.justification,
          supporting_document_url: justificationData.supporting_document_url,
          justified_time_start: timeStart,
          justified_time_end: timeEnd,
          full_day_justification: justificationData.full_day_justification,
          hours_to_adjust: hoursToAdjust,
          late_minutes_to_adjust: lateMinutesToAdjust,
          status: "Aprobada",
          reviewed_by: `${employee.first_name} ${employee.last_name}`,
          review_date: todayLima(),
          review_comments: "Justificación registrada por el administrador",
        };

        // Use existing incident if found for this date (avoids unique constraint)
        const existingIncidentForDate = incidentsByDate[dateStr];
        if (existingIncidentForDate) {
          await base44.entities.AttendanceIncident.update(existingIncidentForDate.id, incidentPayload);
        } else {
          await base44.entities.AttendanceIncident.create(incidentPayload);
        }

        const existingRecord = recordsByDate[dateStr];

        // Si ya hay horas trabajadas en el registro, sumarlas a las justificadas
        const existingWorkedHours = existingRecord?.worked_hours || 0;
        const isSingleDate = !multiDateMode;
        // En modo fecha única, usar el registro pasado como prop para calcular suma
        const baseWorkedHours = (isSingleDate && attendanceRecord && attendanceRecord.employee_id === justifyingEmployee.id)
          ? (attendanceRecord.worked_hours || 0)
          : existingWorkedHours;

        const newWorkedHours = Math.min(baseWorkedHours + hoursToAdjust, 8);
        const newLateMinutes = justificationData.incident_type === "Tardanza" || justificationData.incident_type === "Justificación de Tardanza"
          ? Math.max(0, (existingRecord?.late_minutes || 0) - lateMinutesToAdjust)
          : (existingRecord?.late_minutes || 0);

        // Determinar clock_in y clock_out finales:
        // Si ya hay entrada registrada, conservarla; solo actualizar salida si no existe
        const finalClockIn  = existingRecord?.clock_in  || timeStart || null;
        const finalClockOut = existingRecord?.clock_out || timeEnd   || null;

        const recordUpdate = {
          worked_hours: newWorkedHours,
          late_minutes: newLateMinutes,
          is_late: newLateMinutes > 0,
          status: "Justificado",
          clock_in:  finalClockIn,
          clock_out: finalClockOut,
        };

        if (existingRecord) {
          // Update existing record (avoids unique constraint on employee_id + date)
          await base44.entities.AttendanceRecord.update(existingRecord.id, recordUpdate);
        } else {
          // Create new record only if none exists for this date
          await base44.entities.AttendanceRecord.create({
            employee_id: justifyingEmployee.id,
            date: dateStr,
            clock_in: timeStart || null,
            clock_out: timeEnd || null,
            worked_hours: Math.min(hoursToAdjust, 8),
            late_minutes: 0,
            is_late: false,
            is_absent: false,
            status: "Justificado",
          });
        }
      }

      // Recalcular métricas (tardanza, HE 25%, HE 35%) para todas las fechas justificadas
      await base44.functions.invoke("recalcularAsistencia", {
        employee_id: justifyingEmployee.id,
        date_from: minDate,
        date_to: maxDate,
      });

      toast.success(
        targetDates.length === 1
          ? "Justificación creada y métricas recalculadas"
          : `${targetDates.length} justificaciones creadas y métricas recalculadas`
      );
      onSuccess();
    } catch (error) {
      toast.error("Error al crear la justificación");
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  const targetDates = getTargetDates();

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <Card
        className="max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold">Justificar Asistencia</CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                {justifyingEmployee.first_name} {justifyingEmployee.last_name}
                {!multiDateMode && <> • {format(selectedDate, "dd 'de' MMMM, yyyy", { locale: es })}</>}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>✕</Button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div className="space-y-6">

            {/* Validation error */}
            {validationError && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-red-700">{validationError}</p>
              </div>
            )}

            {/* Multi-date toggle */}
            <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <input
                type="checkbox"
                id="multi_date_mode"
                checked={multiDateMode}
                onChange={(e) => {
                  setMultiDateMode(e.target.checked);
                  setDateRangeStart(null);
                  setDateRangeEnd(null);
                  setExtraDates([]);
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
                        <Calendar
                          mode="single"
                          selected={dateRangeStart}
                          onSelect={(d) => {
                            setDateRangeStart(d);
                            if (dateRangeEnd && d && d > dateRangeEnd) setDateRangeEnd(null);
                          }}
                          locale={es}
                        />
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
                        <Calendar
                          mode="single"
                          selected={dateRangeEnd}
                          onSelect={setDateRangeEnd}
                          disabled={(d) => dateRangeStart ? d < dateRangeStart : false}
                          locale={es}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Dates summary */}
                {targetDates.length > 0 && (
                  <div className="p-3 bg-white border border-indigo-200 rounded-lg">
                    <p className="text-xs font-semibold text-indigo-900 mb-1">
                      {targetDates.length} día(s) seleccionado(s):
                    </p>
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

            {/* Panel informativo de horas */}
            {attInfo && !multiDateMode && (
              <div className={`p-4 rounded-lg border-2 ${
                attInfo.color === "red"    ? "bg-red-50 border-red-200" :
                attInfo.color === "orange" ? "bg-orange-50 border-orange-200" :
                "bg-blue-50 border-blue-200"
              }`}>
                <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${
                  attInfo.color === "red" ? "text-red-700" : attInfo.color === "orange" ? "text-orange-700" : "text-blue-700"
                }`}>
                  📋 Situación actual — {attInfo.label}
                </p>
                <p className={`text-xs mb-3 ${
                  attInfo.color === "red" ? "text-red-800" : attInfo.color === "orange" ? "text-orange-800" : "text-blue-800"
                }`}>
                  {attInfo.message}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white rounded p-2 text-center">
                    <p className="text-xs text-slate-500 mb-0.5">Horas trabajadas</p>
                    <p className="text-lg font-bold text-slate-800">{attInfo.worked.toFixed(2)}h</p>
                  </div>
                  <div className="bg-white rounded p-2 text-center">
                    <p className="text-xs text-slate-500 mb-0.5">Horas a justificar</p>
                    <p className={`text-lg font-bold ${
                      attInfo.color === "red" ? "text-red-600" : attInfo.color === "orange" ? "text-orange-600" : "text-blue-600"
                    }`}>{attInfo.justified.toFixed(2)}h</p>
                  </div>
                  <div className="bg-white rounded p-2 text-center">
                    <p className="text-xs text-slate-500 mb-0.5">Total resultante</p>
                    <p className={`text-lg font-bold ${attInfo.total >= attInfo.fullDay ? "text-green-600" : "text-amber-600"}`}>
                      {attInfo.total.toFixed(2)}h
                    </p>
                  </div>
                </div>
                {attInfo.total < attInfo.fullDay && (
                  <p className="text-xs text-amber-700 mt-2">
                    ⚠️ Aún faltan {(attInfo.fullDay - attInfo.total).toFixed(2)}h para completar la jornada de {attInfo.fullDay.toFixed(2)}h
                  </p>
                )}
                {attInfo.total >= attInfo.fullDay && (
                  <p className="text-xs text-green-700 mt-2">
                    ✓ Con esta justificación se completa la jornada de {attInfo.fullDay.toFixed(2)}h
                  </p>
                )}
              </div>
            )}

            {/* Incident type */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Tipo de Incidente <span className="text-red-500">*</span>
              </label>
              <Select
              value={justificationData.incident_type}
              onValueChange={(value) => {
                setJustificationData({ ...justificationData, incident_type: value });
                setValidationError("");
                setIncidentSearch("");
              }}
              >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo..." />
              </SelectTrigger>
              <SelectContent>
                <div className="p-2 border-b sticky top-0 bg-white z-10">
                  <Input
                    placeholder="Buscar tipo de incidente..."
                    value={incidentSearch}
                    onChange={(e) => setIncidentSearch(e.target.value)}
                    className="h-8 text-sm"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
                {filteredIncidentTypes.length > 0
                  ? filteredIncidentTypes.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))
                  : <div className="px-3 py-2 text-sm text-slate-400">Sin resultados</div>
                }
              </SelectContent>
              </Select>
            </div>

            {/* Period */}
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
                        justified_time_end: e.target.checked ? schedEnd : justificationData.justified_time_end,
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
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Hora de Inicio{" "}
                        {justificationData.incident_type === "Olvido de Marcación"
                          ? <span className="text-slate-400">(opcional)</span>
                          : <span className="text-red-500">*</span>}
                      </label>
                      <div className="flex gap-1">
                        <Input
                          type="time"
                          value={justificationData.justified_time_start || ""}
                          onChange={(e) => {
                            setJustificationData({ ...justificationData, justified_time_start: e.target.value });
                            setValidationError("");
                          }}
                          className="flex-1"
                        />
                        {justificationData.justified_time_start && justificationData.incident_type === "Olvido de Marcación" && (
                          <Button type="button" size="sm" variant="ghost" className="px-2 text-slate-400 hover:text-red-500"
                            onClick={() => setJustificationData({ ...justificationData, justified_time_start: "" })}>✕</Button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Hora de Fin{" "}
                        {justificationData.incident_type === "Olvido de Marcación"
                          ? <span className="text-slate-400">(opcional)</span>
                          : <span className="text-red-500">*</span>}
                      </label>
                      <div className="flex gap-1">
                        <Input
                          type="time"
                          value={justificationData.justified_time_end || ""}
                          onChange={(e) => {
                            setJustificationData({ ...justificationData, justified_time_end: e.target.value });
                            setValidationError("");
                          }}
                          className="flex-1"
                        />
                        {justificationData.justified_time_end && justificationData.incident_type === "Olvido de Marcación" && (
                          <Button type="button" size="sm" variant="ghost" className="px-2 text-slate-400 hover:text-red-500"
                            onClick={() => setJustificationData({ ...justificationData, justified_time_end: "" })}>✕</Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-900">
                    <strong>Nota:</strong> Las horas extras NO se ajustan con justificaciones.
                    Solo se ajustan las horas regulares (máximo 8h) y las tardanzas.
                    {multiDateMode && " El mismo horario se aplicará a todos los días seleccionados."}
                  </p>
                </div>
              </div>
            </div>

            {/* Justification text */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Justificación <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={justificationData.justification}
                onChange={(e) => {
                  setJustificationData({ ...justificationData, justification: e.target.value });
                  setValidationError("");
                }}
                placeholder="Explica el motivo de la incidencia..."
                rows={4}
              />
            </div>

            {/* Document upload */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Documento de Sustento (opcional)
              </label>
              <div className="space-y-2">
                <Input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploadingFile}
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                />
                {uploadingFile && <p className="text-xs text-blue-600">Subiendo archivo...</p>}
                {justificationData.supporting_document_url && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <FileText className="w-4 h-4 text-green-600" />
                    <a
                      href={justificationData.supporting_document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-700 hover:underline flex-1"
                    >
                      Archivo adjunto
                    </a>
                    <Button size="sm" variant="ghost"
                      onClick={() => setJustificationData({ ...justificationData, supporting_document_url: "" })}>
                      ✕
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting
                  ? "Guardando..."
                  : multiDateMode && targetDates.length > 1
                    ? `Justificar ${targetDates.length} días`
                    : existingIncident
                      ? "Actualizar Justificación"
                      : "Crear Justificación"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}