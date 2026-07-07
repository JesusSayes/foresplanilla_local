import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Clock, ArrowRight, X, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima } from "@/lib/dateUtils";

const FIELD_LABELS = {
  clock_in: "Entrada seg. 1",
  clock_out: "Salida seg. 1",
  clock_in_2: "Entrada seg. 2",
  clock_out_2: "Salida seg. 2",
  clock_in_3: "Entrada seg. 3",
  clock_out_3: "Salida seg. 3",
  clock_in_4: "Entrada seg. 4",
  clock_out_4: "Salida seg. 4",
  status: "Estado",
  notes: "Notas",
};

const STATUS_OPTIONS = ["Completo", "Incompleto", "Ausente", "Justificado", "Vacaciones"];

const SEGMENTS = [
  { label: "Segmento 1", inKey: "clock_in",   outKey: "clock_out" },
  { label: "Segmento 2", inKey: "clock_in_2",  outKey: "clock_out_2" },
  { label: "Segmento 3", inKey: "clock_in_3",  outKey: "clock_out_3" },
  { label: "Segmento 4", inKey: "clock_in_4",  outKey: "clock_out_4" },
];

export default function AttendanceEditRequestModal({ record, employee, requester, onClose, onSuccess }) {
  const normalizeTime = (t) => t ? t.slice(0, 5) : "";

  const initialValues = {
    clock_in:    normalizeTime(record?.clock_in),
    clock_out:   normalizeTime(record?.clock_out),
    clock_in_2:  normalizeTime(record?.clock_in_2),
    clock_out_2: normalizeTime(record?.clock_out_2),
    clock_in_3:  normalizeTime(record?.clock_in_3),
    clock_out_3: normalizeTime(record?.clock_out_3),
    clock_in_4:  normalizeTime(record?.clock_in_4),
    clock_out_4: normalizeTime(record?.clock_out_4),
    status: record?.status || "Completo",
    notes:  record?.notes  || "",
  };

  const [formValues, setFormValues] = useState(initialValues);
  const [reason, setReason]         = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg]     = useState("");

  // Count active segments based on filled data
  const [activeSegments, setActiveSegments] = useState(() => {
    if (record?.clock_in_4 || record?.clock_out_4) return 4;
    if (record?.clock_in_3 || record?.clock_out_3) return 3;
    if (record?.clock_in_2 || record?.clock_out_2) return 2;
    return 1;
  });

  const scheduledStart = record?.scheduled_start || "";
  const scheduledEnd   = record?.scheduled_end   || "";
  const isNightShift   = scheduledStart && scheduledEnd && scheduledEnd < scheduledStart;

  // Compute segment_count and is_split_day from form values
  const segmentCount = useMemo(() => {
    if (formValues.clock_in_4 || formValues.clock_out_4) return 4;
    if (formValues.clock_in_3 || formValues.clock_out_3) return 3;
    if (formValues.clock_in_2 || formValues.clock_out_2) return 2;
    return 1;
  }, [formValues]);

  const isSplitDay = segmentCount > 1;

  const set = (key, value) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
    setErrorMsg("");
  };

  const clearSegment = (segIdx) => {
    const seg = SEGMENTS[segIdx];
    setFormValues(prev => ({ ...prev, [seg.inKey]: "", [seg.outKey]: "" }));
    setActiveSegments(segIdx); // collapse back
  };

  const changedFields = Object.keys(FIELD_LABELS).filter(k => formValues[k] !== initialValues[k]);

  const validateTime = (t) => !t || /^\d{2}:\d{2}$/.test(t);

  const handleSubmit = async () => {
    setErrorMsg("");

    if (changedFields.length === 0) {
      setErrorMsg("No hay cambios para solicitar. Modifica al menos un campo.");
      return;
    }
    if (!reason.trim()) {
      setErrorMsg("El motivo de la edición es obligatorio.");
      return;
    }

    // Validate each active segment
    for (let i = 0; i < activeSegments; i++) {
      const seg = SEGMENTS[i];
      const inVal  = formValues[seg.inKey];
      const outVal = formValues[seg.outKey];

      if (!validateTime(inVal) || !validateTime(outVal)) {
        setErrorMsg(`Formato de hora inválido en ${seg.label}. Usa el formato HH:mm.`);
        return;
      }
      // If one side filled, require the other
      if (inVal && !outVal) {
        setErrorMsg(`${seg.label}: si ingresas entrada debes ingresar también la salida.`);
        return;
      }
      if (!inVal && outVal) {
        setErrorMsg(`${seg.label}: si ingresas salida debes ingresar también la entrada.`);
        return;
      }
      // Segment 1 diurno: out > in
      if (i === 0 && inVal && outVal) {
        if (!isNightShift && inVal >= outVal) {
          setErrorMsg("Segmento 1: la hora de salida debe ser posterior a la de entrada.");
          return;
        }
        if (isNightShift && inVal === outVal) {
          setErrorMsg("Segmento 1: la hora de salida no puede ser igual a la de entrada.");
          return;
        }
      }
      // Subsequent segments allow crossing midnight (out < in = next day), but not equal
      if (i > 0 && inVal && outVal && inVal === outVal) {
        setErrorMsg(`${seg.label}: la hora de salida no puede ser igual a la de entrada.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const requestedValues = {};
      const origValues = {};
      changedFields.forEach(k => {
        requestedValues[k] = formValues[k];
        origValues[k] = initialValues[k];
      });

      // Always include derived fields
      requestedValues.segment_count = segmentCount;
      requestedValues.is_split_day  = isSplitDay;

      await base44.entities.AttendanceEditRequest.create({
        attendance_record_id: record.id,
        employee_id:          record.employee_id,
        attendance_date:      record.date,
        original_values:      origValues,
        requested_values:     requestedValues,
        edit_reason:          reason.trim(),
        status:               "Pendiente",
        requested_by_id:      requester.id,
        requested_by_name:    `${requester.first_name} ${requester.last_name}`,
        requested_at:         new Date().toISOString(),
      });

      toast.success("Solicitud de edición enviada correctamente");
      onSuccess?.();
      onClose();
    } catch (e) {
      setErrorMsg("Error al crear la solicitud: " + (e.message || "Error desconocido."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="max-w-2xl w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold">Solicitar Edición de Asistencia</CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                {employee?.first_name} {employee?.last_name} —{" "}
                {record?.date ? format(parseDateLima(record.date), "dd 'de' MMMM yyyy", { locale: es }) : ""}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-5">

          {/* Night shift notice */}
          {isNightShift && (
            <div className="flex items-start gap-2 bg-purple-50 border border-purple-200 rounded-lg p-3">
              <span className="text-purple-800 text-sm">🌙 <strong>Turno nocturno detectado</strong> ({scheduledStart}–{scheduledEnd}): La salida del segmento 1 puede ser menor que la entrada al cruzar medianoche.</span>
            </div>
          )}

          {/* Error banner */}
          {errorMsg && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-300 rounded-lg p-4">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 font-medium">{errorMsg}</p>
            </div>
          )}

          {/* Segment_count + is_split_day indicator */}
          <div className="flex items-center gap-3 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Segmentos detectados: <strong>{segmentCount}</strong></span>
            {isSplitDay && (
              <Badge className="bg-indigo-100 text-indigo-700 text-xs">Día partido (is_split_day)</Badge>
            )}
          </div>

          {/* Segments */}
          <div className="space-y-3">
            {SEGMENTS.slice(0, activeSegments).map((seg, idx) => (
              <div key={seg.inKey} className="border border-slate-200 rounded-xl p-4 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className={`w-5 h-5 rounded-full text-white text-xs flex items-center justify-center ${idx === 0 ? "bg-indigo-500" : "bg-slate-500"}`}>
                      {idx + 1}
                    </span>
                    {seg.label}
                    {idx === 0 && <span className="text-xs text-slate-400 font-normal">(principal)</span>}
                  </h4>
                  {idx > 0 && (
                    <button
                      onClick={() => clearSegment(idx)}
                      className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Eliminar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Entrada</label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="time"
                        value={formValues[seg.inKey]}
                        onChange={e => set(seg.inKey, e.target.value)}
                      />
                      {formValues[seg.inKey] && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-400"
                          onClick={() => set(seg.inKey, "")}>
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Salida {formValues[seg.inKey] && !formValues[seg.outKey] && <span className="text-red-500">*</span>}
                    </label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="time"
                        value={formValues[seg.outKey]}
                        onChange={e => set(seg.outKey, e.target.value)}
                      />
                      {formValues[seg.outKey] && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-400"
                          onClick={() => set(seg.outKey, "")}>
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add segment button */}
          {activeSegments < 4 && (
            <button
              onClick={() => setActiveSegments(s => Math.min(s + 1, 4))}
              className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar segmento {activeSegments + 1}
            </button>
          )}

          {/* Status + Notes */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Estado</label>
              <Select value={formValues.status} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Notas</label>
              <Input
                value={formValues.notes}
                onChange={e => set("notes", e.target.value)}
                placeholder="Observaciones..."
              />
            </div>
          </div>

          {/* Changed fields summary */}
          {changedFields.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-blue-900 mb-3">Cambios solicitados:</p>
              <div className="space-y-1.5">
                {changedFields.map(k => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <span className="text-slate-600 w-36 font-medium text-xs">{FIELD_LABELS[k] || k}:</span>
                    <span className="text-slate-400 line-through text-xs">{initialValues[k] || "—"}</span>
                    <ArrowRight className="w-3 h-3 text-blue-500 shrink-0" />
                    <span className="text-blue-800 font-semibold text-xs">{formValues[k] || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {changedFields.length === 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center text-sm text-slate-500">
              Modifica al menos un campo para crear la solicitud
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Motivo de la edición <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Describe el motivo de esta solicitud..."
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              onClick={handleSubmit}
              disabled={submitting || changedFields.length === 0}
            >
              {submitting ? "Enviando..." : "Enviar Solicitud"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}