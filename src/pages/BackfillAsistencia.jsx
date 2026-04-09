import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Play, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";

export default function BackfillAsistencia() {
  const [dateFrom, setDateFrom] = useState("2026-01-01");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loadingEmps, setLoadingEmps] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  const loadEmployees = async () => {
    setLoadingEmps(true);
    try {
      const PAGE = 10;
      const all = [];
      let skip = 0;
      while (true) {
        const raw = await entitiesAPI.Employee.filter({}, "-created_date", PAGE, skip);
        const items = Array.isArray(raw) ? raw : [];
        all.push(...items);
        if (items.length < PAGE) break;
        skip += PAGE;
        if (skip > 10000) break;
      }
      const active = all.filter(e => e.status === "Activo");
      setEmployees(active);
    } catch (e) {
      alert("Error cargando empleados: " + e.message);
    } finally {
      setLoadingEmps(false);
    }
  };

  const runBackfill = async () => {
    if (employees.length === 0) {
      alert("Primero carga los empleados");
      return;
    }
    setRunning(true);
    setResults([]);
    setStats(null);

    let created = 0;
    let errors = 0;
    const newResults = [];

    for (let i = currentIdx; i < employees.length; i++) {
      const emp = employees[i];
      setCurrentIdx(i);
      try {
        const res = await base44.functions.invoke("backfillAsistenciaEmpleado", {
          employee_id: emp.id,
          date_from: dateFrom,
        });
        const data = res.data;
        newResults.push({
          id: emp.id,
          name: `${emp.first_name} ${emp.last_name}`,
          created: data.records_created || 0,
          status: "ok",
        });
        created += data.records_created || 0;
      } catch (e) {
        newResults.push({
          id: emp.id,
          name: `${emp.first_name} ${emp.last_name}`,
          created: 0,
          status: "error",
          error: e.message,
        });
        errors++;
      }
      setResults([...newResults]);
      // Pausa entre empleados para respetar rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    setStats({ created, errors, total: employees.length - currentIdx });
    setRunning(false);
    setCurrentIdx(0);
  };

  const stop = () => setRunning(false);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Backfill de Asistencia</h1>
        <p className="text-slate-500 mt-1">Genera registros históricos de asistencia para todos los empleados activos.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuración</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Fecha desde</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-40"
                disabled={running}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={loadEmployees}
              variant="outline"
              disabled={running || loadingEmps}
            >
              {loadingEmps ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {loadingEmps ? "Cargando..." : `Cargar empleados${employees.length > 0 ? ` (${employees.length})` : ""}`}
            </Button>

            {employees.length > 0 && !running && (
              <Button
                onClick={runBackfill}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Play className="w-4 h-4 mr-2" />
                Iniciar Backfill ({employees.length} empleados)
              </Button>
            )}

            {running && (
              <Button onClick={stop} variant="destructive">
                Detener
              </Button>
            )}
          </div>

          {running && (
            <div className="bg-indigo-50 rounded-lg p-3 text-sm text-indigo-700 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Procesando empleado {currentIdx + 1} de {employees.length}...
            </div>
          )}

          {stats && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="font-semibold text-green-800">✓ Backfill completado</p>
              <p className="text-sm text-green-700 mt-1">
                {stats.created} registros creados · {stats.errors} errores · {stats.total} empleados procesados
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progreso ({results.length}/{employees.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {results.map(r => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-2">
                    {r.status === "ok"
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      : <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    }
                    <span className="text-sm text-slate-800">{r.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status === "ok"
                      ? <Badge className="bg-green-100 text-green-700">{r.created} creados</Badge>
                      : <Badge className="bg-red-100 text-red-700 text-xs">{r.error?.slice(0, 30)}</Badge>
                    }
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
