import React, { useState } from "react";
// import { base44 } from "@/api/base44Client";
import { entitiesAPI } from '@/api/entitiesClient';
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
import { uploadFile } from "@/services/uploadService";

export default function JustifyModal({
  justifyingEmployee,
  justificationData,
  setJustificationData,
  selectedDate,
  employeeSchedule,
  todayRecords,
  employee,
  existingIncident,
  workSchedules = [],
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
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [overtimeAlert, setOvertimeAlert] = useState(null);

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
      // const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const { file_url } = await uploadFile(file);
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
      const isOlvidoMarcacion = justificationData.incident_type === "Olvido de Marcación";
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
      let lateMinutesToAdjust = 0;

      if (justificationData.full_day_justification) {
        hoursToAdjust = getFullDayHours();
      } else if (timeStart && timeEnd) {
        const [sh, sm] = timeStart.split(":").map(Number);
        const [eh, em] = timeEnd.split(":").map(Number);
        hoursToAdjust = Math.min(((eh * 60 + em) - (sh * 60 + sm)) / 60, 8);
      }

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
          review_comments: "Aprobada automáticamente al crear la justificación",
        };

        // Only use existingIncident for the primary selectedDate when single-date mode
        const isSingleMode = !multiDateMode;
        const isPrimaryDate = dateStr === format(selectedDate, "yyyy-MM-dd");

        if (isSingleMode && existingIncident) {
          await entitiesAPI.AttendanceIncident.update(existingIncident.id, incidentPayload);
        } else {
          await entitiesAPI.AttendanceIncident.create(incidentPayload);
        }

        const existingRecord = todayRecords.find(r => r.employee_id === justifyingEmployee.id && r.date === dateStr);
        const newWorkedHours = hoursToAdjust;
        const newLateMinutes = justificationData.incident_type === "Tardanza"
          ? Math.max(0, (existingRecord?.late_minutes || 0) - lateMinutesToAdjust)
          : 0;

        const recordUpdate = {
          worked_hours: Math.min(newWorkedHours, 8),
          late_minutes: newLateMinutes,
          is_late: newLateMinutes > 0,
          status: newLateMinutes === 0 && newWorkedHours >= 8 ? "Completo" : "Justificado",
        };

        // Preserve original clock_in/clock_out if they already exist — don't overwrite with justified times
        if (!existingRecord?.clock_in && timeStart) recordUpdate.clock_in = timeStart;
        if (!existingRecord?.clock_out && timeEnd) recordUpdate.clock_out = timeEnd;

        let savedRecordId = null;
        if (existingRecord) {
          await entitiesAPI.AttendanceRecord.update(existingRecord.id, recordUpdate);
          savedRecordId = existingRecord.id;
        } else {
          const created = await entitiesAPI.AttendanceRecord.create({
            employee_id: justifyingEmployee.id,
            date: dateStr,
            clock_in: timeStart || null,
            clock_out: timeEnd || null,
            worked_hours: Math.min(newWorkedHours, 8),
            late_minutes: 0,
            is_late: false,
            is_absent: false,
            status: "Justificado",
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
              fromStr <= dateStr && toStr >= dateStr;
          });

          if (schedule) {
            const dow = new Date(dateStr + "T00:00:00").getDay();
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

      toast.success(
        targetDates.length === 1
          ? "Justificación creada y aprobada correctamente"
          : `${targetDates.length} justificaciones creadas y aprobadas correctamente`
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
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tardanza">Tardanza</SelectItem>
                  <SelectItem value="Falta">Falta</SelectItem>
                  <SelectItem value="Salida Temprana">Salida Temprana</SelectItem>
                  <SelectItem value="Olvido de Marcación">Olvido de Marcación</SelectItem>
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
