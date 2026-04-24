import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { entitiesAPI } from "@/api/entitiesClient";
import { Clock, CheckCircle, XCircle, AlertTriangle, Loader2, X } from "lucide-react";
import { format, parse, differenceInMinutes, addHours, subHours, isValid } from "date-fns";
import { es } from "date-fns/locale";

// Parsea "HH:mm" a un objeto Date usando la fecha del record como base
const parseTime = (timeStr, baseDate) => {
  if (!timeStr || !baseDate) return null;
  try {
    const dateStr = typeof baseDate === "string" ? baseDate.slice(0, 10) : format(new Date(baseDate), "yyyy-MM-dd");
    const dt = parse(`${dateStr} ${timeStr}`, "yyyy-MM-dd HH:mm", new Date());
    return isValid(dt) ? dt : null;
  } catch {
    return null;
  }
};

// Formatea minutos a "Xh Ym"
const formatDuration = (minutes) => {
  if (!minutes || minutes <= 0) return "0h 0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
};

// Formatea decimal de horas a "Xh Ym"
const formatHoursDecimal = (hoursDecimal) => {
  if (!hoursDecimal || hoursDecimal <= 0) return "0h 0m";
  const totalMinutes = Math.round(hoursDecimal * 60);
  return formatDuration(totalMinutes);
};

export default function AttendanceValidationModal({ record, logs = [], onClose, onSave }) {
  const [selectedIn, setSelectedIn] = useState(null);   // timestamp string "HH:mm"
  const [selectedOut, setSelectedOut] = useState(null);  // timestamp string "HH:mm"
  const [saving, setSaving] = useState(false);

  // Calcular ventana válida
  const window = useMemo(() => {
    const start = parseTime(record?.scheduled_start, record?.date);
    const end = parseTime(record?.scheduled_end, record?.date);
    if (!start || !end) return null;
    return {
      from: subHours(start, 2),
      to: addHours(end, 2),
      fromStr: format(subHours(start, 2), "HH:mm"),
      toStr: format(addHours(end, 2), "HH:mm"),
    };
  }, [record]);

  // Ordenar logs ascendente por hora
  const sortedLogs = useMemo(() => {
    if (!logs || logs.length === 0) return [];
    return [...logs].sort((a, b) => {
      const ta = a.time || a.timestamp || a.clock_time || "";
      const tb = b.time || b.timestamp || b.clock_time || "";
      return ta.localeCompare(tb);
    });
  }, [logs]);

  const isInsideWindow = (timeStr) => {
    if (!window || !timeStr) return false;
    const t = parseTime(timeStr, record?.date);
    if (!t) return false;
    return t >= window.from && t <= window.to;
  };

  // Duración calculada en tiempo real
  const calculatedDuration = useMemo(() => {
    if (!selectedIn || !selectedOut) return null;
    const inDt = parseTime(selectedIn, record?.date);
    const outDt = parseTime(selectedOut, record?.date);
    if (!inDt || !outDt) return null;
    const diff = differenceInMinutes(outDt, inDt);
    return diff > 0 ? diff : null;
  }, [selectedIn, selectedOut, record?.date]);

  const handleSave = async () => {
    if (!selectedIn || !selectedOut) {
      toast.error("Debes seleccionar una marcación de entrada y una de salida.");
      return;
    }
    const inDt = parseTime(selectedIn, record?.date);
    const outDt = parseTime(selectedOut, record?.date);
    if (!inDt || !outDt || outDt <= inDt) {
      toast.error("La hora de salida debe ser posterior a la de entrada.");
      return;
    }

    const diffMinutes = differenceInMinutes(outDt, inDt);
    const worked_hours = Math.round((diffMinutes / 60) * 100) / 100;

    const payload = {
      clock_in: selectedIn,
      clock_out: selectedOut,
      worked_hours,
      status: "approved",
      notes: "Corregido manualmente por RRHH",
      is_absent: false,
    };

    setSaving(true);
    try {
      const updated = await entitiesAPI.AttendanceRecord.update(record.id, payload);
      toast.success("Registro de asistencia corregido correctamente.");
      onSave(updated);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar la corrección. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  const getLogTime = (log) => log.time || log.timestamp || log.clock_time || "";

  const statusColor = {
    approved: "bg-green-100 text-green-700",
    Completo: "bg-green-100 text-green-700",
    Incompleto: "bg-yellow-100 text-yellow-700",
    Ausente: "bg-red-100 text-red-700",
    Justificado: "bg-blue-100 text-blue-700",
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              Validación Manual de Asistencia
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {record?.date
                ? format(new Date(record.date + "T12:00:00"), "EEEE d 'de' MMMM yyyy", { locale: es })
                : "—"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">

            {/* A. Horario + Ventana */}
            <Card className="border border-slate-200">
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-slate-700">Horario Programado y Ventana Válida</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                  <div>
                    <Label className="text-xs text-slate-500">Entrada programada</Label>
                    <p className="font-semibold text-slate-900">{record?.scheduled_start || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Salida programada</Label>
                    <p className="font-semibold text-slate-900">{record?.scheduled_end || "—"}</p>
                  </div>
                </div>
                {window ? (
                  <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span className="text-xs text-indigo-700 font-medium">
                      Ventana válida: <strong>{window.fromStr}</strong> — <strong>{window.toStr}</strong>
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Sin horario programado para calcular ventana.</p>
                )}

                {/* Estado actual */}
                <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <Label className="text-xs text-slate-500">Entrada actual</Label>
                    <p className="font-mono font-semibold text-slate-800">{record?.clock_in || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Salida actual</Label>
                    <p className="font-mono font-semibold text-slate-800">{record?.clock_out || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Horas trabajadas</Label>
                    <p className="font-semibold text-slate-800">{formatHoursDecimal(record?.worked_hours)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Estado actual</Label>
                    <Badge className={`text-xs mt-0.5 ${statusColor[record?.status] || "bg-slate-100 text-slate-600"}`}>
                      {record?.status || "—"}
                    </Badge>
                  </div>
                  {record?.notes && (
                    <div className="col-span-2">
                      <Label className="text-xs text-slate-500">Notas</Label>
                      <p className="text-xs text-slate-600 mt-0.5">{record.notes}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* B. Marcaciones */}
            <Card className="border border-slate-200">
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-slate-700">
                  Marcaciones del Día ({sortedLogs.length})
                </CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Selecciona una como entrada y otra como salida.</p>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {sortedLogs.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">
                    No hay marcaciones registradas para este día.
                  </div>
                ) : (
                  <ScrollArea className="h-48">
                    <div className="space-y-2 pr-2">
                      {sortedLogs.map((log, idx) => {
                        const timeStr = getLogTime(log);
                        const inside = isInsideWindow(timeStr);
                        const isIn = selectedIn === timeStr;
                        const isOut = selectedOut === timeStr;

                        return (
                          <div
                            key={log.id || idx}
                            className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all ${
                              isIn
                                ? "border-green-500 bg-green-50"
                                : isOut
                                ? "border-blue-500 bg-blue-50"
                                : "border-slate-200 bg-slate-50 hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-mono font-bold text-slate-900 text-sm w-12">{timeStr || "—"}</span>
                              <Badge
                                className={`text-xs ${
                                  inside
                                    ? "bg-green-100 text-green-700 border-green-200"
                                    : "bg-red-100 text-red-700 border-red-200"
                                }`}
                              >
                                {inside ? "Dentro de ventana" : "Fuera de ventana"}
                              </Badge>
                              {log.device_name && (
                                <span className="text-xs text-slate-400">{log.device_name}</span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setSelectedIn(isIn ? null : timeStr);
                                  if (selectedOut === timeStr) setSelectedOut(null);
                                }}
                                className={`text-xs px-2.5 py-1 rounded-md font-medium border transition-colors ${
                                  isIn
                                    ? "bg-green-500 text-white border-green-500"
                                    : "bg-white text-green-700 border-green-300 hover:bg-green-50"
                                }`}
                              >
                                Entrada
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedOut(isOut ? null : timeStr);
                                  if (selectedIn === timeStr) setSelectedIn(null);
                                }}
                                className={`text-xs px-2.5 py-1 rounded-md font-medium border transition-colors ${
                                  isOut
                                    ? "bg-blue-500 text-white border-blue-500"
                                    : "bg-white text-blue-700 border-blue-300 hover:bg-blue-50"
                                }`}
                              >
                                Salida
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* C. Resultado */}
            <Card className={`border-2 transition-colors ${
              calculatedDuration
                ? "border-indigo-300 bg-indigo-50"
                : "border-slate-200 bg-slate-50"
            }`}>
              <CardContent className="px-4 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs text-slate-500">Resultado de corrección</Label>
                    <div className="flex items-center gap-4 mt-1">
                      <div>
                        <span className="text-xs text-slate-500">Entrada:</span>{" "}
                        <span className="font-mono font-bold text-green-700">{selectedIn || "—"}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Salida:</span>{" "}
                        <span className="font-mono font-bold text-blue-700">{selectedOut || "—"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Label className="text-xs text-slate-500">Horas a registrar</Label>
                    <p className={`text-2xl font-bold mt-0.5 ${
                      calculatedDuration ? "text-indigo-700" : "text-slate-300"
                    }`}>
                      {calculatedDuration ? formatDuration(calculatedDuration) : "—"}
                    </p>
                  </div>
                </div>

                {selectedIn && selectedOut && !calculatedDuration && (
                  <div className="flex items-center gap-2 mt-3 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <XCircle className="w-4 h-4 shrink-0" />
                    La salida debe ser posterior a la entrada.
                  </div>
                )}

                {calculatedDuration && (
                  <div className="flex items-center gap-2 mt-3 text-green-700 text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    Se registrará: estado <strong>approved</strong> · Notas: "Corregido manualmente por RRHH"
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-slate-50">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !selectedIn || !selectedOut || !calculatedDuration}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Guardar Corrección
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}