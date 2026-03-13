import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

export default function JustifyModal({
  justifyingEmployee,
  justificationData,
  setJustificationData,
  selectedDate,
  todayRecords,
  employee,
  existingIncident,
  onClose,
  onSuccess,
}) {
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState("");

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

    // Validaciones con mensajes específicos
    if (!justificationData.incident_type) {
      setValidationError("El campo 'Tipo de Incidente' es obligatorio.");
      return;
    }
    if (!justificationData.justification.trim()) {
      setValidationError("El campo 'Justificación' es obligatorio. Debes explicar el motivo de la incidencia.");
      return;
    }
    if (!justificationData.full_day_justification) {
      const isOlvidoMarcacion = justificationData.incident_type === "Olvido de Marcación";
      if (!isOlvidoMarcacion) {
        // Para otros tipos, ambas horas son obligatorias
        if (!justificationData.justified_time_start) {
          setValidationError("El campo 'Hora de Inicio' es obligatorio cuando no se justifica el día completo.");
          return;
        }
        if (!justificationData.justified_time_end) {
          setValidationError("El campo 'Hora de Fin' es obligatorio cuando no se justifica el día completo.");
          return;
        }
      } else {
        // Para Olvido de Marcación, al menos uno es obligatorio
        if (!justificationData.justified_time_start && !justificationData.justified_time_end) {
          setValidationError("Debes ingresar al menos la Hora de Inicio o la Hora de Fin.");
          return;
        }
      }
      // Validar orden solo si ambas están presentes
      if (justificationData.justified_time_start && justificationData.justified_time_end) {
        const [startHour, startMin] = justificationData.justified_time_start.split(":").map(Number);
        const [endHour, endMin] = justificationData.justified_time_end.split(":").map(Number);
        if ((endHour * 60 + endMin) <= (startHour * 60 + startMin)) {
          setValidationError("La 'Hora de Fin' debe ser posterior a la 'Hora de Inicio'.");
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const timeStart = justificationData.full_day_justification ? "09:00" : justificationData.justified_time_start;
      const timeEnd = justificationData.full_day_justification ? "18:00" : justificationData.justified_time_end;

      // Calcular horas a ajustar
      let hoursToAdjust = 0;
      let lateMinutesToAdjust = 0;

      if (justificationData.full_day_justification) {
        hoursToAdjust = 8;
      } else {
        const [startHour, startMin] = timeStart.split(":").map(Number);
        const [endHour, endMin] = timeEnd.split(":").map(Number);
        const totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
        hoursToAdjust = Math.min(totalMinutes / 60, 8);

        if (justificationData.incident_type === "Tardanza") {
          const record = todayRecords.find(r => r.employee_id === justifyingEmployee.id);
          if (record && record.clock_in) {
            const scheduledStart = record.scheduled_start || "09:00";
            const [schedHour, schedMin] = scheduledStart.split(":").map(Number);
            const scheduledMinutes = schedHour * 60 + schedMin;
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;
            if (startMinutes <= scheduledMinutes && endMinutes >= startMinutes) {
              lateMinutesToAdjust = record.late_minutes || 0;
            }
          }
        }
      }

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
        review_date: dateStr,
        review_comments: "Aprobada automáticamente al crear la justificación",
      };

      // Si ya existe justificación previa, actualizarla; si no, crearla
      if (existingIncident) {
        await base44.entities.AttendanceIncident.update(existingIncident.id, incidentPayload);
      } else {
        await base44.entities.AttendanceIncident.create(incidentPayload);
      }

      // Siempre usar los tiempos de la justificación para el registro de asistencia (sobreescribir)
      const existingRecord = todayRecords.find(r => r.employee_id === justifyingEmployee.id);
      const newWorkedHours = hoursToAdjust; // Usar directamente las horas de la justificación
      const newLateMinutes = justificationData.incident_type === "Tardanza" ? Math.max(0, (existingRecord?.late_minutes || 0) - lateMinutesToAdjust) : 0;

      if (existingRecord) {
        await base44.entities.AttendanceRecord.update(existingRecord.id, {
          clock_in: timeStart,
          clock_out: timeEnd,
          worked_hours: Math.min(newWorkedHours, 8),
          late_minutes: newLateMinutes,
          is_late: newLateMinutes > 0,
          status: newLateMinutes === 0 && newWorkedHours >= 8 ? "Completo" : "Justificado",
        });
      } else {
        await base44.entities.AttendanceRecord.create({
          employee_id: justifyingEmployee.id,
          date: dateStr,
          clock_in: timeStart,
          clock_out: timeEnd,
          worked_hours: Math.min(newWorkedHours, 8),
          late_minutes: 0,
          is_late: false,
          is_absent: false,
          status: "Justificado",
        });
      }

      toast.success("Justificación creada y aprobada correctamente");
      onSuccess();
    } catch (error) {
      toast.error("Error al crear la justificación");
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

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
                {justifyingEmployee.first_name} {justifyingEmployee.last_name} •{" "}
                {format(selectedDate, "dd 'de' MMMM, yyyy", { locale: es })}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>✕</Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-6">

            {/* Error de validación */}
            {validationError && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-red-700">{validationError}</p>
              </div>
            )}

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
                        justified_time_start: e.target.checked ? "09:00" : justificationData.justified_time_start,
                        justified_time_end: e.target.checked ? "18:00" : justificationData.justified_time_end,
                      });
                      setValidationError("");
                    }}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <label className="text-sm font-medium text-slate-900">
                    Justificar día completo (8 horas)
                  </label>
                </div>

                {!justificationData.full_day_justification && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Hora de Inicio <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="time"
                        value={justificationData.justified_time_start}
                        onChange={(e) => {
                          setJustificationData({ ...justificationData, justified_time_start: e.target.value });
                          setValidationError("");
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Hora de Fin <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="time"
                        value={justificationData.justified_time_end}
                        onChange={(e) => {
                          setJustificationData({ ...justificationData, justified_time_end: e.target.value });
                          setValidationError("");
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-900">
                    <strong>Nota:</strong> Las horas extras NO se ajustan con justificaciones.
                    Solo se ajustan las horas regulares (máximo 8h) y las tardanzas.
                  </p>
                </div>
              </div>
            </div>

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
                {uploadingFile && (
                  <p className="text-xs text-blue-600">Subiendo archivo...</p>
                )}
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
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setJustificationData({ ...justificationData, supporting_document_url: "" })}
                    >
                      ✕
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "Guardando..." : existingIncident ? "Actualizar Justificación" : "Crear Justificación"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}