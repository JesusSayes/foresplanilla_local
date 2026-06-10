import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Clock, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima } from "@/lib/dateUtils";

const FIELD_LABELS = {
  clock_in: "Hora de entrada",
  clock_out: "Hora de salida",
  status: "Estado",
  notes: "Notas",
};

const STATUS_OPTIONS = ["Completo", "Incompleto", "Ausente", "Justificado", "Vacaciones"];

export default function AttendanceEditRequestModal({
  record,
  employee,
  requester,
  onClose,
  onSuccess,
}) {
  const [formValues, setFormValues] = useState({
    clock_in: record?.clock_in || "",
    clock_out: record?.clock_out || "",
    status: record?.status || "Completo",
    notes: record?.notes || "",
  });
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const originalValues = {
    clock_in: record?.clock_in || "",
    clock_out: record?.clock_out || "",
    status: record?.status || "Completo",
    notes: record?.notes || "",
  };

  // Detectar qué campos cambiaron
  const changedFields = Object.keys(FIELD_LABELS).filter(
    (k) => formValues[k] !== originalValues[k]
  );

  const validateTime = (t) => !t || /^\d{2}:\d{2}$/.test(t);

  const handleSubmit = async () => {
    if (changedFields.length === 0) {
      toast.error("No hay cambios para solicitar");
      return;
    }
    if (!reason.trim()) {
      toast.error("El motivo de la edición es obligatorio");
      return;
    }
    if (!validateTime(formValues.clock_in) || !validateTime(formValues.clock_out)) {
      toast.error("Formato de hora inválido (HH:mm)");
      return;
    }
    if (formValues.clock_in && formValues.clock_out && formValues.clock_in >= formValues.clock_out) {
      toast.error("La hora de salida debe ser posterior a la de entrada");
      return;
    }

    setSubmitting(true);
    try {
      // Solo guardar campos que cambiaron
      const requestedValues = {};
      const origValues = {};
      changedFields.forEach((k) => {
        requestedValues[k] = formValues[k];
        origValues[k] = originalValues[k];
      });

      await base44.entities.AttendanceEditRequest.create({
        attendance_record_id: record.id,
        employee_id: record.employee_id,
        attendance_date: record.date,
        original_values: origValues,
        requested_values: requestedValues,
        edit_reason: reason.trim(),
        status: "Pendiente",
        requested_by_id: requester.id,
        requested_by_name: `${requester.first_name} ${requester.last_name}`,
        requested_at: new Date().toISOString(),
      });

      toast.success("Solicitud de edición enviada correctamente");
      onSuccess?.();
      onClose();
    } catch (e) {
      toast.error("Error al crear la solicitud: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
        <CardContent className="p-6 space-y-6">
          {/* Formulario de valores nuevos */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Hora de entrada</label>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={formValues.clock_in}
                  onChange={(e) => setFormValues({ ...formValues, clock_in: e.target.value })}
                />
                {formValues.clock_in && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400"
                    onClick={() => setFormValues({ ...formValues, clock_in: "" })}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Hora de salida</label>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={formValues.clock_out}
                  onChange={(e) => setFormValues({ ...formValues, clock_out: e.target.value })}
                />
                {formValues.clock_out && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400"
                    onClick={() => setFormValues({ ...formValues, clock_out: "" })}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Estado</label>
              <Select value={formValues.status} onValueChange={(v) => setFormValues({ ...formValues, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Notas</label>
              <Input
                value={formValues.notes}
                onChange={(e) => setFormValues({ ...formValues, notes: e.target.value })}
                placeholder="Observaciones..."
              />
            </div>
          </div>

          {/* Resumen de cambios */}
          {changedFields.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-blue-900 mb-3">Cambios solicitados:</p>
              <div className="space-y-2">
                {changedFields.map((k) => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <span className="text-slate-600 w-32 font-medium">{FIELD_LABELS[k]}:</span>
                    <span className="text-slate-500 line-through">{originalValues[k] || "—"}</span>
                    <ArrowRight className="w-3 h-3 text-blue-500 shrink-0" />
                    <span className="text-blue-800 font-semibold">{formValues[k] || "—"}</span>
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

          {/* Motivo */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Motivo de la edición <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
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