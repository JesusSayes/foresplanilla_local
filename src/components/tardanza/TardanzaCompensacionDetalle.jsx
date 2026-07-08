import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { X, Save, Check, Clock, Calendar, TrendingUp, AlertCircle, Lock } from "lucide-react";

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function TardanzaCompensacionDetalle({ record, employee, onClose, onSave }) {
  const [minutosAutorizados, setMinutosAutorizados] = useState(record.minutos_autorizados || 0);
  const [observacion, setObservacion] = useState(record.observacion || "");
  const [solicitadoA, setSolicitadoA] = useState(record.solicitado_a || "");
  const [dailyData, setDailyData] = useState({ tardanzaDays: [], adicionalesDays: [] });
  const [loadingDaily, setLoadingDaily] = useState(true);
  const [error, setError] = useState("");

  const isClosed = record.estado === "Cerrado";
  const minutosTardanza = record.minutos_tardanza || 0;
  const minutosAdicionales = record.minutos_adicionales_trabajados || 0;
  const minutosSugeridos = Math.min(minutosTardanza, minutosAdicionales);
  const descontable = Math.max(0, minutosTardanza - (parseInt(minutosAutorizados) || 0));

  useEffect(() => {
    const loadDaily = async () => {
      try {
        const startDate = `${record.year}-${String(record.month).padStart(2, "0")}-01`;
        const lastDay = new Date(record.year, record.month, 0).getDate();
        const endDate = `${record.year}-${String(record.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

        const attRecords = await base44.entities.AttendanceRecord.filter(
          { employee_id: record.employee_id }, "-date", 500
        );
        const monthRecords = (attRecords || []).filter(r => r.date >= startDate && r.date <= endDate);

        const tardanzaDays = monthRecords
          .filter(r => (r.late_minutes || 0) > 0)
          .map(r => ({ date: r.date, minutes: r.late_minutes || 0 }))
          .sort((a, b) => a.date.localeCompare(b.date));

        const adicionalesDays = monthRecords
          .filter(r => ((r.overtime_hours_25 || 0) + (r.overtime_hours_35 || 0)) > 0)
          .map(r => ({
            date: r.date,
            minutes: Math.round(((r.overtime_hours_25 || 0) + (r.overtime_hours_35 || 0)) * 60)
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        setDailyData({ tardanzaDays, adicionalesDays });
      } catch (err) {
        console.error("Error loading daily data:", err);
      } finally {
        setLoadingDaily(false);
      }
    };
    loadDaily();
  }, [record.employee_id, record.month, record.year]);

  const validate = () => {
    const val = parseInt(minutosAutorizados) || 0;
    if (val > minutosTardanza) {
      setError(`Los minutos autorizados (${val}) no pueden ser mayores que los minutos de tardanza (${minutosTardanza}).`);
      return false;
    }
    if (val > minutosAdicionales) {
      setError(`Los minutos autorizados (${val}) no pueden ser mayores que los minutos adicionales trabajados (${minutosAdicionales}).`);
      return false;
    }
    if (val < 0) {
      setError("Los minutos autorizados no pueden ser negativos.");
      return false;
    }
    setError("");
    return true;
  };

  const handleSave = (action) => {
    if (!validate()) return;
    onSave({
      minutos_autorizados: parseInt(minutosAutorizados) || 0,
      observacion,
      solicitado_a: solicitadoA,
    }, action);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {employee ? `${employee.first_name} ${employee.last_name}` : "Empleado"}
            </h2>
            <p className="text-sm text-slate-500">
              {MESES[record.month]} {record.year} · {employee?.department_name || employee?.area_trabajo || "—"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs">{record.estado}</Badge>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-3 text-center">
                <Clock className="w-4 h-4 text-red-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Tardanza acumulada</p>
                <p className="text-lg font-bold text-red-600">{minutosTardanza} min</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-3 text-center">
                <TrendingUp className="w-4 h-4 text-green-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Adicionales trabajados</p>
                <p className="text-lg font-bold text-green-600">{minutosAdicionales} min</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-3 text-center">
                <Calendar className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Sugerido a compensar</p>
                <p className="text-lg font-bold text-blue-600">{minutosSugeridos} min</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-100 border-slate-300">
              <CardContent className="p-3 text-center">
                <AlertCircle className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Descontable final</p>
                <p className="text-lg font-bold text-slate-700">{descontable} min</p>
              </CardContent>
            </Card>
          </div>

          {/* Daily breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-red-500" />
                  Días con tardanza ({dailyData.tardanzaDays.length})
                </h3>
                {loadingDaily ? (
                  <p className="text-sm text-slate-400">Cargando...</p>
                ) : dailyData.tardanzaDays.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin tardanzas en el período.</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {dailyData.tardanzaDays.map((d, i) => (
                      <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-100">
                        <span className="text-slate-600">{d.date}</span>
                        <span className="text-red-600 font-medium">{d.minutes} min</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  Días con tiempo adicional ({dailyData.adicionalesDays.length})
                </h3>
                {loadingDaily ? (
                  <p className="text-sm text-slate-400">Cargando...</p>
                ) : dailyData.adicionalesDays.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin tiempo adicional en el período.</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {dailyData.adicionalesDays.map((d, i) => (
                      <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-100">
                        <span className="text-slate-600">{d.date}</span>
                        <span className="text-green-600 font-medium">{d.minutes} min</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Editable fields or closed notice */}
          {isClosed ? (
            <Card className="bg-slate-50">
              <CardContent className="p-4 text-center">
                <Lock className="w-5 h-5 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Este registro está cerrado y no puede editarse.</p>
                {record.aprobado_por && (
                  <p className="text-xs text-slate-400 mt-2">
                    Aprobado por: {record.aprobado_por}
                    {record.fecha_aprobacion ? ` · ${new Date(record.fecha_aprobacion).toLocaleString()}` : ""}
                  </p>
                )}
                {record.cerrado_por && (
                  <p className="text-xs text-slate-400 mt-1">
                    Cerrado por: {record.cerrado_por}
                    {record.fecha_cierre ? ` · ${new Date(record.fecha_cierre).toLocaleString()}` : ""}
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-slate-700">Minutos autorizados *</Label>
                  <Input
                    type="number"
                    min="0"
                    value={minutosAutorizados}
                    onChange={e => setMinutosAutorizados(e.target.value)}
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Máx: {Math.min(minutosTardanza, minutosAdicionales)} min (menor entre tardanza y adicionales)
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-700">Personal que debe autorizar</Label>
                  <Input
                    value={solicitadoA}
                    onChange={e => setSolicitadoA(e.target.value)}
                    placeholder="Nombre del responsable"
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-slate-700">Observación</Label>
                <Textarea
                  value={observacion}
                  onChange={e => setObservacion(e.target.value)}
                  placeholder="Observaciones sobre la compensación..."
                  rows={3}
                  className="mt-1"
                />
              </div>

              <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-slate-200">
                <Button variant="outline" onClick={() => handleSave("save")}>
                  <Save className="w-4 h-4" /> Guardar Borrador
                </Button>
                <Button variant="destructive" onClick={() => handleSave("reject")}>
                  <X className="w-4 h-4" /> Rechazar
                </Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleSave("approve")}>
                  <Check className="w-4 h-4" /> Aprobar Compensación
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}