import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, RefreshCw, Play, Settings, ChevronDown, ChevronUp, CalendarClock, Zap } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";

// Configuración por defecto de la lógica Biotime
export const DEFAULT_BIOTIME_CONFIG = {
  // Tabla y campos en Biotime
  tableName: "iclock_transaction",
  fieldEmpCode: "emp_code",
  fieldPunchTime: "punch_time",
  fieldPunchState: "punch_state",
  fieldTerminal: "terminal_alias",
  // Mapeo del código de empleado
  empCodePadLength: 8,
  empCodeField: "document_number", // campo en Employee que corresponde al emp_code
  // Ventana de clasificación entrada/salida (minutos)
  windowMinutes: 120,
  // Horario por defecto si no hay schedule asignado
  defaultScheduledStart: "09:00",
  defaultScheduledEnd: "18:00",
  defaultBreakMinutes: 60,
  defaultToleranceMinutes: 10,
};

export default function BiotimeSyncConfig({ onSync }) {
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("biotime_sync_config");
      return saved ? { ...DEFAULT_BIOTIME_CONFIG, ...JSON.parse(saved) } : { ...DEFAULT_BIOTIME_CONFIG };
    } catch {
      return { ...DEFAULT_BIOTIME_CONFIG };
    }
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [syncDateFrom, setSyncDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [syncDateTo, setSyncDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  // Estado para generación diaria
  const [dailyDate, setDailyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isGenerating, setIsGenerating] = useState(false);
  const [dailyResult, setDailyResult] = useState(null);

  const update = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSaveConfig = () => {
    localStorage.setItem("biotime_sync_config", JSON.stringify(config));
    setIsDirty(false);
    toast.success("Configuración guardada");
  };

  const handleResetConfig = () => {
    setConfig({ ...DEFAULT_BIOTIME_CONFIG });
    localStorage.removeItem("biotime_sync_config");
    setIsDirty(false);
    toast.info("Configuración restaurada a valores por defecto");
  };

  const handleGenerateDaily = async () => {
    if (!dailyDate) { toast.error("Selecciona una fecha"); return; }
    setIsGenerating(true);
    setDailyResult(null);
    try {
      const response = await base44.functions.invoke('generarRegistrosDiarios', {
        date: dailyDate,
        config,
      });
      setDailyResult(response.data);
      if (response.data?.success) {
        toast.success(`Registros generados: ${response.data.created} nuevos, ${response.data.updated} actualizados`);
      } else {
        toast.error(`Error: ${response.data?.error || "Error desconocido"}`);
      }
    } catch (err) {
      toast.error("Error al generar registros: " + err.message);
      setDailyResult({ success: false, error: err.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSync = async () => {
    if (!syncDateFrom || !syncDateTo) { toast.error("Selecciona el rango de fechas"); return; }
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const response = await base44.functions.invoke('syncBiotimeAttendance', {
        startDate: syncDateFrom,
        endDate: syncDateTo,
        config,
      });
      setSyncResult(response.data);
      if (response.data?.success) {
        toast.success(`Sincronización completada: ${response.data.inserted} insertados, ${response.data.updated} actualizados`);
      } else {
        toast.error(`Error: ${response.data?.error || "Error desconocido"}`);
      }
    } catch (err) {
      toast.error("Error al ejecutar la sincronización: " + err.message);
      setSyncResult({ success: false, error: err.message });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
    {/* Panel: Generación Diaria Automática */}
    <Card className="border-0 shadow-lg mb-4">
      <CardHeader className="border-b bg-gradient-to-r from-emerald-50 to-teal-50 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-600 rounded-lg"><CalendarClock className="w-5 h-5 text-white" /></div>
          <div className="flex-1">
            <CardTitle className="text-base">Generación Diaria de Registros</CardTitle>
            <p className="text-xs text-slate-600 mt-0.5">
              Crea el registro de cada trabajador activo con su horario programado y marcaciones del Biotime.
              <span className="ml-1 font-semibold text-emerald-700">⏰ Automatizado: corre cada día a las 00:05 UTC</span>
            </p>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 shrink-0">
            Automático ✓
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div>
            <Label className="text-xs text-slate-600">Fecha a procesar</Label>
            <Input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} className="mt-1 w-44" />
          </div>
          <Button
            onClick={handleGenerateDaily}
            disabled={isGenerating}
            className="bg-emerald-600 hover:bg-emerald-700 h-9"
          >
            {isGenerating
              ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Generando...</>
              : <><Zap className="w-4 h-4 mr-2" />Generar Registros del Día</>}
          </Button>
          <p className="text-xs text-slate-500 self-end pb-1">
            Crea o actualiza el registro de cada empleado activo con su horario y marcación del marcador
          </p>
        </div>

        {dailyResult && (
          <div className={`p-4 rounded-lg border ${dailyResult.success ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
            {dailyResult.success ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold text-emerald-800 text-sm">
                    Registros generados para {format(new Date(dailyDate + "T00:00:00"), "dd/MM/yyyy")}
                  </span>
                  <span className="text-xs text-emerald-600 ml-auto">
                    {dailyResult.durationMs ? `${(dailyResult.durationMs / 1000).toFixed(1)}s` : ""}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Nuevos", value: dailyResult.created, color: "text-emerald-700" },
                    { label: "Actualizados", value: dailyResult.updated, color: "text-blue-700" },
                    { label: "Saltados", value: dailyResult.skipped, color: "text-slate-500" },
                    { label: "Empleados", value: dailyResult.totalEmployees, color: "text-indigo-700" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white rounded-lg p-2 text-center border border-slate-100">
                      <p className={`text-xl font-bold ${color}`}>{value ?? 0}</p>
                      <p className="text-xs text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
                {dailyResult.errors > 0 && (
                  <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                    {dailyResult.errors} error(es): {dailyResult.errorDetails?.slice(0, 3).join(", ")}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-red-800 text-sm">Error: {dailyResult.error}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Panel: Sincronización Biotime (rango) */}
    <Card className="border-0 shadow-lg mb-6">
      <CardHeader className="border-b bg-gradient-to-r from-indigo-50 to-blue-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg"><RefreshCw className="w-5 h-5 text-white" /></div>
          <div className="flex-1">
            <CardTitle className="text-lg">Sincronización Biotime (Rango)</CardTitle>
            <p className="text-xs text-slate-600 mt-0.5">Importa marcaciones y genera registros para todos los empleados activos en un rango de fechas</p>
          </div>
          {isDirty && <Badge className="bg-amber-100 text-amber-700 border-amber-300">Cambios sin guardar</Badge>}
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">

        {/* Rango de fechas + botón ejecutar */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label className="text-xs text-slate-600">Fecha Desde</Label>
            <Input type="date" value={syncDateFrom} onChange={(e) => setSyncDateFrom(e.target.value)} className="mt-1 w-44" />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Fecha Hasta</Label>
            <Input type="date" value={syncDateTo} onChange={(e) => setSyncDateTo(e.target.value)} className="mt-1 w-44" />
          </div>
          <Button onClick={handleSync} disabled={isSyncing} className="bg-indigo-600 hover:bg-indigo-700 h-9">
            {isSyncing
              ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Sincronizando...</>
              : <><Play className="w-4 h-4 mr-2" />Ejecutar Sincronización</>}
          </Button>
        </div>

        {/* Configuración básica de tabla/campos */}
        <div className="border rounded-xl p-4 bg-slate-50 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-4 h-4 text-slate-600" />
            <h3 className="font-semibold text-slate-800 text-sm">Configuración de Tabla Biotime</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Tabla de marcaciones</Label>
              <Input value={config.tableName} onChange={e => update("tableName", e.target.value)} className="mt-1 font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs">Campo código empleado</Label>
              <Input value={config.fieldEmpCode} onChange={e => update("fieldEmpCode", e.target.value)} className="mt-1 font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs">Campo fecha/hora marcación</Label>
              <Input value={config.fieldPunchTime} onChange={e => update("fieldPunchTime", e.target.value)} className="mt-1 font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs">Campo estado marcación</Label>
              <Input value={config.fieldPunchState} onChange={e => update("fieldPunchState", e.target.value)} className="mt-1 font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs">Campo terminal</Label>
              <Input value={config.fieldTerminal} onChange={e => update("fieldTerminal", e.target.value)} className="mt-1 font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs">Campo empleado local (coincide con emp_code)</Label>
              <Input value={config.empCodeField} onChange={e => update("empCodeField", e.target.value)} className="mt-1 font-mono text-xs" />
              <p className="text-[10px] text-slate-400 mt-0.5">Campo de Employee a comparar</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">Relleno código (pad zeros)</Label>
              <Input type="number" min={0} max={20} value={config.empCodePadLength} onChange={e => update("empCodePadLength", parseInt(e.target.value) || 0)} className="mt-1" />
            </div>
          </div>
        </div>

        {/* Configuración avanzada - lógica de clasificación */}
        <div className="border rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-semibold text-slate-700"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span className="flex items-center gap-2"><Settings className="w-4 h-4" />Lógica de Clasificación (Avanzado)</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showAdvanced && (
            <div className="p-4 space-y-4 bg-white">
              <p className="text-xs text-slate-500">
                El sistema busca la marcación más cercana al horario de entrada/salida dentro de una ventana de ±<strong>{config.windowMinutes} min</strong>.
                Si el empleado no tiene horario asignado, se usan los valores por defecto.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Ventana clasificación (min ±)</Label>
                  <Input type="number" min={1} value={config.windowMinutes} onChange={e => update("windowMinutes", parseInt(e.target.value) || 120)} className="mt-1" />
                  <p className="text-[10px] text-slate-400 mt-0.5">Margen en minutos alrededor del horario</p>
                </div>
                <div>
                  <Label className="text-xs">Horario entrada por defecto</Label>
                  <Input type="time" value={config.defaultScheduledStart} onChange={e => update("defaultScheduledStart", e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Horario salida por defecto</Label>
                  <Input type="time" value={config.defaultScheduledEnd} onChange={e => update("defaultScheduledEnd", e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Break por defecto (min)</Label>
                  <Input type="number" min={0} value={config.defaultBreakMinutes} onChange={e => update("defaultBreakMinutes", parseInt(e.target.value) || 60)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Tolerancia tardanza por defecto (min)</Label>
                  <Input type="number" min={0} value={config.defaultToleranceMinutes} onChange={e => update("defaultToleranceMinutes", parseInt(e.target.value) || 10)} className="mt-1" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Botones guardar/restaurar config */}
        <div className="flex gap-3">
          <Button onClick={handleSaveConfig} disabled={!isDirty} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
            Guardar Configuración
          </Button>
          <Button onClick={handleResetConfig} size="sm" variant="outline">
            Restaurar Defaults
          </Button>
        </div>

        {/* Resultado sincronización */}
        {syncResult && (
          <div className={`p-4 rounded-lg border ${syncResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
            {syncResult.success ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="font-semibold text-green-800">Sincronización completada</span>
                  <span className="text-xs text-green-600 ml-auto">{syncResult.durationMs ? `${(syncResult.durationMs / 1000).toFixed(1)}s` : ""}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Insertados", value: syncResult.inserted, color: "text-green-700" },
                    { label: "Actualizados", value: syncResult.updated, color: "text-blue-700" },
                    { label: "Empleados", value: syncResult.totalEmployees, color: "text-indigo-700" },
                    { label: "Días", value: syncResult.totalDays, color: "text-slate-700" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white rounded-lg p-3 text-center border border-slate-100">
                      <p className={`text-2xl font-bold ${color}`}>{value ?? 0}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
                {syncResult.errors > 0 && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm font-semibold text-amber-800">{syncResult.errors} error(es):</p>
                    <ul className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                      {(syncResult.errorDetails || []).map((e, i) => (
                        <li key={i} className="text-xs text-amber-700">• {e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <span className="text-red-800 font-semibold">Error: {syncResult.error}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
}