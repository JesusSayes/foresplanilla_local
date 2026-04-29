import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { entitiesAPI } from "@/api/entitiesClient";
import { Clock, CheckCircle, XCircle, AlertTriangle, Loader2, X, Info, ShieldCheck } from "lucide-react";
import { format, parse, differenceInMinutes, addHours, subHours, isValid } from "date-fns";
import { es } from "date-fns/locale";

// ─── Helpers ────────────────────────────────────────────────────────────────

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

const formatDuration = (minutes) => {
  if (!minutes || minutes <= 0) return "0h 0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
};

const formatHoursDecimal = (hoursDecimal) => {
  if (!hoursDecimal || hoursDecimal <= 0) return "0h 0m";
  return formatDuration(Math.round(hoursDecimal * 60));
};

// Extrae "HH:mm" de punch_time (puede venir como "HH:mm", "HH:mm:ss" o ISO)
const extractTime = (punchTime) => {
  if (!punchTime) return "";
  // Si ya tiene formato HH:mm o HH:mm:ss
  if (/^\d{2}:\d{2}/.test(punchTime)) return punchTime.slice(0, 5);
  // Si es ISO datetime
  try {
    return format(new Date(punchTime), "HH:mm");
  } catch {
    return punchTime.slice(0, 5) || "";
  }
};

// ─── Detectar motivo según el estado real del sistema ───────────────────────
const detectMotive = (record, logs) => {
  if (!record.scheduled_start || !record.scheduled_end) {
    return "Sin horario programado";
  }
  if (logs.length === 0) return "Sin marcaciones registradas";
  if (logs.length === 1) return "Solo una marcación detectada";
  const allOutside = logs.every(l => l.is_within_window === false);
  if (allOutside) return "Marcaciones fuera de ventana";
  if (record.status === "Completo" || record.status === "Aprobada") return "Pendiente de aprobación RRHH";
  return "Revisión manual solicitada";
};

// ─── Status badges ───────────────────────────────────────────────────────────
const STATUS_COLORS = {
  "Sin marcar": "bg-slate-100 text-slate-600",
  "Incompleto": "bg-yellow-100 text-yellow-700",
  "Revisar":    "bg-orange-100 text-orange-700",
  "Completo":   "bg-green-100 text-green-700",
  "Aprobada":   "bg-indigo-100 text-indigo-700",
};

// ─── Componente principal ────────────────────────────────────────────────────

export default function AttendanceValidationModal({ record, logs = [], onClose, onSave }) {
  const [selectedIn, setSelectedIn]   = useState(null);
  const [selectedOut, setSelectedOut] = useState(null);
  const [saving, setSaving]           = useState(false);
  const [savingApprove, setSavingApprove] = useState(false);
  // Permite marcar como Incompleto (1 marcación) sin forzar salida
  const [keepIncomplete, setKeepIncomplete] = useState(false);

  const hasSchedule = !!(record?.scheduled_start && record?.scheduled_end);

  // Ventana válida: scheduled_start -2h / scheduled_end +2h
  const validWindow = useMemo(() => {
    if (!hasSchedule) return null;
    const start = parseTime(record.scheduled_start, record.date);
    const end   = parseTime(record.scheduled_end,   record.date);
    if (!start || !end) return null;
    return {
      from:    subHours(start, 2),
      to:      addHours(end,   2),
      fromStr: format(subHours(start, 2), "HH:mm"),
      toStr:   format(addHours(end,   2), "HH:mm"),
    };
  }, [record, hasSchedule]);

  // Ordenar logs ascendente por punch_time (campo real del modelo)
  const sortedLogs = useMemo(() => {
    if (!logs || logs.length === 0) return [];
    return [...logs].sort((a, b) => extractTime(a.punch_time).localeCompare(extractTime(b.punch_time)));
  }, [logs]);

  // Sugerencia automática: primera y última marcación válida dentro de ventana
  const suggestion = useMemo(() => {
    const inside = sortedLogs.filter(l => l.is_within_window !== false);
    if (inside.length === 0) {
      // Si ninguna está dentro, sugerir primera y última igualmente
      if (sortedLogs.length === 0) return null;
      return {
        entry: extractTime(sortedLogs[0].punch_time),
        exit:  sortedLogs.length > 1 ? extractTime(sortedLogs[sortedLogs.length - 1].punch_time) : null,
        allOutside: true,
      };
    }
    return {
      entry: extractTime(inside[0].punch_time),
      exit:  inside.length > 1 ? extractTime(inside[inside.length - 1].punch_time) : null,
      allOutside: false,
    };
  }, [sortedLogs]);

  const isInsideWindow = (timeStr) => {
    if (!validWindow || !timeStr) return null; // null = sin horario
    const t = parseTime(timeStr, record?.date);
    if (!t) return false;
    return t >= validWindow.from && t <= validWindow.to;
  };

  // Verificar si alguna selección es fuera de ventana
  const selectedInOutside  = selectedIn  && isInsideWindow(selectedIn)  === false;
  const selectedOutOutside = selectedOut && isInsideWindow(selectedOut) === false;
  const anyOutsideWarning  = selectedInOutside || selectedOutOutside;

  // Duración calculada en tiempo real
  const calculatedDuration = useMemo(() => {
    if (!selectedIn || !selectedOut) return null;
    const inDt  = parseTime(selectedIn,  record?.date);
    const outDt = parseTime(selectedOut, record?.date);
    if (!inDt || !outDt) return null;
    const diff = differenceInMinutes(outDt, inDt);
    return diff > 0 ? diff : null;
  }, [selectedIn, selectedOut, record?.date]);

  // ── Aprobar cálculo automático ──────────────────────────────────────────
  const handleApproveAutomatic = async () => {
    setSavingApprove(true);
    try {
      const payload = {
        status: "Aprobada",
        notes:  "Aprobado por RRHH",
      };
      const updated = await entitiesAPI.AttendanceRecord.update(record.id, payload);
      toast.success("Asistencia aprobada correctamente.");
      onSave(updated);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Error al aprobar. Intenta nuevamente.");
    } finally {
      setSavingApprove(false);
    }
  };

  // ── Guardar corrección manual ────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedIn) {
      toast.error("Debes seleccionar al menos la marcación de entrada.");
      return;
    }

    // Caso: solo 1 marcación y RRHH acepta mantener Incompleto
    if (keepIncomplete && !selectedOut) {
      setSaving(true);
      try {
        const payload = {
          clock_in:    selectedIn,
          clock_out:   null,
          worked_hours: 0,
          status:      "Incompleto",
          is_absent:   false,
          notes:       `Validado manualmente por RRHH: Antes: ${record.clock_in || "—"} / ${record.clock_out || "—"} → Entrada registrada: ${selectedIn}, salida pendiente`,
        };
        const updated = await entitiesAPI.AttendanceRecord.update(record.id, payload);
        toast.success("Registro guardado como Incompleto.");
        onSave(updated);
        onClose();
      } catch (err) {
        console.error(err);
        toast.error("Error al guardar. Intenta nuevamente.");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!selectedOut) {
      toast.error("Debes seleccionar la marcación de salida o marcar como Incompleto.");
      return;
    }

    const inDt  = parseTime(selectedIn,  record?.date);
    const outDt = parseTime(selectedOut, record?.date);
    if (!inDt || !outDt || outDt <= inDt) {
      toast.error("La hora de salida debe ser posterior a la de entrada.");
      return;
    }

    const diffMinutes = differenceInMinutes(outDt, inDt);
    const worked_hours = Math.round((diffMinutes / 60) * 100) / 100;
    const notesAudit = `Validado manualmente por RRHH: Antes: ${record.clock_in || "—"} / ${record.clock_out || "—"} → Después: ${selectedIn} / ${selectedOut}`;

    setSaving(true);
    try {
      const payload = {
        clock_in:    selectedIn,
        clock_out:   selectedOut,
        worked_hours,
        status:      "Aprobada",
        is_absent:   false,
        notes:       notesAudit,
      };
      const updated = await entitiesAPI.AttendanceRecord.update(record.id, payload);
      toast.success("Registro corregido y aprobado correctamente.");
      onSave(updated);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar la corrección. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  const motive = detectMotive(record, sortedLogs);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              Validar Asistencia
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
          <div className="p-6 space-y-4">

            {/* ── A. Horario + Ventana + Estado actual ── */}
            <Card className="border border-slate-200">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-slate-700">Horario y Estado Actual</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">

                {/* Horario programado */}
                {!hasSchedule ? (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-xs text-red-700 font-medium">Sin horario programado — la validación manual es necesaria</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <Label className="text-xs text-slate-500">Entrada programada</Label>
                      <p className="font-semibold text-slate-900">{record.scheduled_start}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Salida programada</Label>
                      <p className="font-semibold text-slate-900">{record.scheduled_end}</p>
                    </div>
                  </div>
                )}

                {/* Ventana válida */}
                {validWindow && (
                  <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                    <Info className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span className="text-xs text-indigo-700 font-medium">
                      Ventana válida: <strong>{validWindow.fromStr}</strong> — <strong>{validWindow.toStr}</strong>
                    </span>
                  </div>
                )}

                {/* Estado actual + clock_in / clock_out / horas */}
                <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-3 text-sm">
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
                    <Badge className={`text-xs mt-0.5 ${STATUS_COLORS[record?.status] || "bg-slate-100 text-slate-600"}`}>
                      {record?.status || "Sin marcar"}
                    </Badge>
                  </div>
                  {record?.notes && (
                    <div className="col-span-2">
                      <Label className="text-xs text-slate-500">Notas</Label>
                      <p className="text-xs text-slate-600 mt-0.5 truncate" title={record.notes}>{record.notes}</p>
                    </div>
                  )}
                </div>

                {/* Motivo detectado */}
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-xs text-amber-800 font-medium">Motivo detectado: {motive}</span>
                </div>
              </CardContent>
            </Card>

            {/* ── Botón aprobar cálculo automático ── */}
            {(record?.status === "Completo" || record?.clock_in) && (
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                <ShieldCheck className="w-5 h-5 text-green-600 shrink-0" />
                <div className="flex-1 text-xs text-green-800">
                  <p className="font-semibold">¿El cálculo automático es correcto?</p>
                  <p className="text-green-700">Entrada: {record?.clock_in || "—"} · Salida: {record?.clock_out || "—"} · {formatHoursDecimal(record?.worked_hours)}</p>
                </div>
                <Button
                  size="sm"
                  onClick={handleApproveAutomatic}
                  disabled={savingApprove || saving}
                  className="bg-green-600 hover:bg-green-700 shrink-0"
                >
                  {savingApprove ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                  Aprobar
                </Button>
              </div>
            )}

            {/* ── B. Marcaciones del día ── */}
            <Card className="border border-slate-200">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-slate-700">
                  Marcaciones del Día ({sortedLogs.length})
                </CardTitle>
                {suggestion && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                    <Info className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>
                      Sugerencia sistema:{" "}
                      <button
                        onClick={() => { setSelectedIn(suggestion.entry); setSelectedOut(suggestion.exit); setKeepIncomplete(!suggestion.exit); }}
                        className="text-indigo-600 underline hover:text-indigo-800"
                      >
                        Entrada → {suggestion.entry} · Salida → {suggestion.exit || "no disponible"}
                        {suggestion.allOutside && " ⚠️ fuera de ventana"}
                      </button>
                    </span>
                  </div>
                )}
                <p className="text-xs text-slate-400 mt-1">Selecciona una marcación como entrada y otra como salida.</p>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {sortedLogs.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">
                    No hay marcaciones biométricas registradas para este día.
                  </div>
                ) : (
                  <ScrollArea className="h-52">
                    <div className="space-y-2 pr-2">
                      {sortedLogs.map((log, idx) => {
                        const timeStr = extractTime(log.punch_time);
                        const inside  = log.is_within_window;   // campo real del modelo
                        const usedForCalc = log.is_used_for_calculation;
                        const isIn  = selectedIn  === timeStr;
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
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-slate-900 text-sm w-12">{timeStr || "—"}</span>
                              {/* Badge ventana — usa campo real is_within_window */}
                              {inside !== null && inside !== undefined ? (
                                <Badge className={`text-xs ${inside ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                  {inside ? "Dentro de ventana" : "Fuera de ventana"}
                                </Badge>
                              ) : (
                                <Badge className="text-xs bg-slate-100 text-slate-500">Sin ventana</Badge>
                              )}
                              {usedForCalc && (
                                <Badge className="text-xs bg-indigo-100 text-indigo-700">Usado en cálculo</Badge>
                              )}
                              {log.source && (
                                <span className="text-xs text-slate-400">{log.source}</span>
                              )}
                            </div>
                            <div className="flex gap-1.5 shrink-0">
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
                                  if (isOut) setKeepIncomplete(false);
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

                {/* Opción Incompleto si solo hay 1 marcación */}
                {sortedLogs.length === 1 && selectedIn && !selectedOut && (
                  <label className="flex items-center gap-2 mt-3 cursor-pointer text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                    <input
                      type="checkbox"
                      checked={keepIncomplete}
                      onChange={(e) => setKeepIncomplete(e.target.checked)}
                      className="accent-yellow-600"
                    />
                    Mantener como <strong>Incompleto</strong> (solo entrada, salida pendiente)
                  </label>
                )}
              </CardContent>
            </Card>

            {/* ── C. Resultado en tiempo real ── */}
            <Card className={`border-2 transition-colors ${
              calculatedDuration
                ? "border-indigo-300 bg-indigo-50"
                : keepIncomplete && selectedIn
                ? "border-yellow-300 bg-yellow-50"
                : "border-slate-200 bg-slate-50"
            }`}>
              <CardContent className="px-4 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs text-slate-500">Corrección a aplicar</Label>
                    <div className="flex items-center gap-4 mt-1">
                      <div>
                        <span className="text-xs text-slate-500">Entrada:</span>{" "}
                        <span className="font-mono font-bold text-green-700">{selectedIn || "—"}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Salida:</span>{" "}
                        <span className="font-mono font-bold text-blue-700">
                          {keepIncomplete && !selectedOut ? "(pendiente)" : selectedOut || "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Label className="text-xs text-slate-500">Horas a registrar</Label>
                    <p className={`text-2xl font-bold mt-0.5 ${
                      calculatedDuration ? "text-indigo-700" : keepIncomplete ? "text-yellow-600" : "text-slate-300"
                    }`}>
                      {calculatedDuration ? formatDuration(calculatedDuration) : keepIncomplete ? "0h 0m" : "—"}
                    </p>
                  </div>
                </div>

                {/* Errores */}
                {selectedIn && selectedOut && !calculatedDuration && (
                  <div className="flex items-center gap-2 mt-3 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <XCircle className="w-4 h-4 shrink-0" />
                    La hora de salida debe ser posterior a la de entrada.
                  </div>
                )}

                {/* Advertencia marcación fuera de ventana */}
                {anyOutsideWarning && (
                  <div className="flex items-center gap-2 mt-3 text-orange-700 text-xs bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Estás aprobando una marcación fuera de ventana. Puedes guardar igualmente.
                  </div>
                )}

                {/* Confirmación */}
                {(calculatedDuration || (keepIncomplete && selectedIn)) && (
                  <div className="flex items-center gap-2 mt-3 text-green-700 text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    Estado → <strong>{keepIncomplete && !selectedOut ? "Incompleto" : "Aprobada"}</strong> · Las notas registrarán la auditoría RRHH.
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-slate-50">
          <Button variant="outline" onClick={onClose} disabled={saving || savingApprove}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || savingApprove || !selectedIn || (!selectedOut && !keepIncomplete) || (selectedIn && selectedOut && !calculatedDuration)}
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
                {keepIncomplete && !selectedOut ? "Guardar Incompleto" : "Guardar Corrección"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}