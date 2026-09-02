import React, { useState, useMemo } from "react";
import { entitiesAPI } from "@/api/entitiesClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Clock, AlertCircle, CheckCircle, RotateCcw, Loader2, Info } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { getAdditionalMinutes } from "@/lib/attendanceMetrics";

/**
 * Modal para que RRHH autorice o revierta la compensación de tardanza
 * usando minutos adicionales trabajados después de la hora programada de salida.
 *
 * Props:
 * - record: AttendanceRecord
 * - employee: Employee
 * - authorizer: Employee (usuario de RRHH que autoriza)
 * - enableCompensation: boolean (la funcionalidad debe estar habilitada)
 * - onClose: () => void
 * - onSuccess: () => void
 */
export default function TardinessCompensationModal({
  record,
  employee,
  authorizer,
  enableCompensation,
  onClose,
  onSuccess,
}) {
  const [minutes, setMinutes] = useState(
    record?.tardiness_compensation_status === "Activa"
      ? String(record.tardiness_compensation_minutes || 0)
      : ""
  );
  const [reason, setReason] = useState(record?.tardiness_compensation_reason || "");
  const [saving, setSaving] = useState(false);

  const originalLate = record?.late_minutes || 0;
  const additionalMinutes = useMemo(() => getAdditionalMinutes(record), [record]);
  const isCurrentlyActive = record?.tardiness_compensation_status === "Activa";
  const currentCompMin = isCurrentlyActive ? (record.tardiness_compensation_minutes || 0) : 0;
  const effectiveLate = Math.max(0, originalLate - currentCompMin);

  const parsedMinutes = parseInt(minutes, 10);
  const isValidMinutes = !isNaN(parsedMinutes) && parsedMinutes > 0;
  const exceedsTardiness = isValidMinutes && parsedMinutes > originalLate;
  const exceedsAdditional = isValidMinutes && parsedMinutes > additionalMinutes;
  const canCompensate = enableCompensation && originalLate > 0 && additionalMinutes > 0 && isValidMinutes && !exceedsTardiness && !exceedsAdditional && reason.trim().length > 0;
  const canRevert = isCurrentlyActive;

  // Preview de la tardanza efectiva con los minutos ingresados
  const previewEffectiveLate = isValidMinutes ? Math.max(0, originalLate - parsedMinutes) : originalLate;

  const handleCompensate = async () => {
    if (!canCompensate) return;
    setSaving(true);
    try {
      await entitiesAPI.AttendanceRecord.update(record.id, {
        tardiness_compensation_minutes: parsedMinutes,
        tardiness_compensation_authorizer: authorizer?.work_email || authorizer?.email || "",
        tardiness_compensation_authorized_at: new Date().toISOString(),
        tardiness_compensation_reason: reason.trim(),
        tardiness_compensation_status: "Activa",
      });
      toast.success(`Compensación aplicada: ${parsedMinutes} min. Tardanza efectiva: ${previewEffectiveLate} min.`);
      onSuccess();
      onClose();
    } catch (error) {
      toast.error("Error al aplicar la compensación: " + (error.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async () => {
    setSaving(true);
    try {
      await entitiesAPI.AttendanceRecord.update(record.id, {
        tardiness_compensation_status: "Revertida",
        tardiness_compensation_reason: `${record.tardiness_compensation_reason || ""} [REVERTIDA por ${authorizer?.work_email || authorizer?.email || ""} el ${new Date().toISOString()}]`,
      });
      toast.success("Compensación revertida. La tardanza efectiva vuelve al valor original.");
      onSuccess();
      onClose();
    } catch (error) {
      toast.error("Error al revertir la compensación: " + (error.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <Card className="max-w-xl w-full my-4 sm:my-0" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              Compensar Tardanza
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>✕</Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {/* Datos del empleado */}
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-sm font-semibold text-slate-900">
              {employee?.first_name} {employee?.last_name}
            </p>
            <p className="text-xs text-slate-500">
              {employee?.document_type} {employee?.document_number} · {format(new Date(record.date + "T00:00:00"), "dd 'de' MMMM, yyyy", { locale: es })}
            </p>
          </div>

          {/* Resumen de métricas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-xs text-slate-500">Tardanza original</p>
              <p className="text-xl font-bold text-orange-600">{originalLate} min</p>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-slate-500">Min. adicionales disponibles</p>
              <p className="text-xl font-bold text-blue-600">{additionalMinutes} min</p>
            </div>
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-xs text-slate-500">Tardanza efectiva actual</p>
              <p className="text-xl font-bold text-indigo-700">{effectiveLate} min</p>
            </div>
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs text-slate-500">Tardanza efectiva con nuevo valor</p>
              <p className="text-xl font-bold text-green-700">{previewEffectiveLate} min</p>
            </div>
          </div>

          {/* Estado actual */}
          {isCurrentlyActive && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-indigo-600" />
              <p className="text-xs text-indigo-700">
                Compensación activa: <strong>{currentCompMin} min</strong> autorizados por{" "}
                {record.tardiness_compensation_authorizer} el{" "}
                {record.tardiness_compensation_authorized_at
                  ? format(new Date(record.tardiness_compensation_authorized_at), "dd/MM/yyyy HH:mm")
                  : "—"}
              </p>
            </div>
          )}

          {/* Validaciones */}
          {!enableCompensation && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              <p className="text-xs text-yellow-700">La funcionalidad de compensación está deshabilitada en la configuración.</p>
            </div>
          )}
          {enableCompensation && originalLate === 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              <p className="text-xs text-yellow-700">No hay tardanza que compensar.</p>
            </div>
          )}
          {enableCompensation && originalLate > 0 && additionalMinutes === 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              <p className="text-xs text-yellow-700">No hay minutos adicionales disponibles (se requiere salida registrada después de la hora programada).</p>
            </div>
          )}
          {exceedsTardiness && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <p className="text-xs text-red-700">Los minutos compensados ({parsedMinutes}) no pueden superar la tardanza original ({originalLate}).</p>
            </div>
          )}
          {exceedsAdditional && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <p className="text-xs text-red-700">Los minutos compensados ({parsedMinutes}) no pueden superar los minutos adicionales disponibles ({additionalMinutes}).</p>
            </div>
          )}

          {/* Inputs */}
          {enableCompensation && originalLate > 0 && additionalMinutes > 0 && (
            <>
              <div>
                <Label className="text-sm font-semibold text-slate-700">
                  Minutos a compensar <span className="text-xs font-normal text-slate-400">(máx. {Math.min(originalLate, additionalMinutes)} min)</span>
                </Label>
                <Input
                  type="number"
                  min="1"
                  max={Math.min(originalLate, additionalMinutes)}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="Ej: 20"
                  className="mt-1"
                  disabled={saving}
                />
              </div>
              <div>
                <Label className="text-sm font-semibold text-slate-700">
                  Motivo / Observación <span className="text-xs font-normal text-slate-400">*</span>
                </Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Razón de la compensación..."
                  rows={2}
                  className="mt-1"
                  disabled={saving}
                />
              </div>
            </>
          )}

          {/* Nota sobre doble contabilización */}
          {enableCompensation && isValidMinutes && !exceedsTardiness && !exceedsAdditional && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2">
              <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600">
                Los {parsedMinutes} minutos compensados se descontarán de la tardanza efectiva y no se contabilizarán simultáneamente como horas extras en planillas.
              </p>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            {canRevert && (
              <Button
                variant="outline"
                className="flex-1 text-orange-600 border-orange-300 hover:bg-orange-50"
                onClick={handleRevert}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                Revertir
              </Button>
            )}
            {enableCompensation && originalLate > 0 && additionalMinutes > 0 && (
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                onClick={handleCompensate}
                disabled={!canCompensate || saving}
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                {isCurrentlyActive ? "Actualizar" : "Compensar"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
