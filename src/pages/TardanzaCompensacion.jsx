import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Search, Eye, Check, X, Lock, RefreshCw, FileText,
  ChevronLeft, ChevronRight
} from "lucide-react";
import TardanzaCompensacionDetalle from "@/components/tardanza/TardanzaCompensacionDetalle";

const MESES = [
  { value: 1, label: "Enero" }, { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" }, { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" }, { value: 6, label: "Junio" },
  { value: 7, label: "Julio" }, { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" }, { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" }, { value: 12, label: "Diciembre" },
];

const ESTADOS = ["Borrador", "Aprobado", "Rechazado", "Cerrado"];

function estadoBadge(estado) {
  const map = {
    "Borrador": "bg-amber-100 text-amber-700 border-amber-300",
    "Aprobado": "bg-green-100 text-green-700 border-green-300",
    "Rechazado": "bg-red-100 text-red-700 border-red-300",
    "Cerrado": "bg-slate-200 text-slate-600 border-slate-400",
  };
  return map[estado] || map["Borrador"];
}

export default function TardanzaCompensacion() {
  const now = new Date();
  const [filters, setFilters] = useState({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    employee_id: "",
    area: "",
    fechaInicial: "",
    fechaFinal: "",
    estado: "",
  });
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [detalleRecord, setDetalleRecord] = useState(null);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  useEffect(() => {
    base44.entities.Employee.filter({ status: "Activo" }, "first_name", 500)
      .then(setEmployees)
      .catch(() => {});
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const query = { month: filters.month, year: filters.year };
      if (filters.employee_id) query.employee_id = filters.employee_id;
      if (filters.estado) query.estado = filters.estado;
      const data = await base44.entities.TardanzaCompensacion.filter(query, "-updated_date", 500);
      let filtered = data || [];

      if (filters.area) {
        const areaLower = filters.area.toLowerCase();
        const empIds = new Set(
          employees.filter(e =>
            (e.department_name || "").toLowerCase().includes(areaLower) ||
            (e.area_trabajo || "").toLowerCase().includes(areaLower)
          ).map(e => e.id)
        );
        filtered = filtered.filter(r => empIds.has(r.employee_id));
      }
      if (filters.fechaInicial) {
        filtered = filtered.filter(r => (r.fecha_solicitud || "") >= filters.fechaInicial);
      }
      if (filters.fechaFinal) {
        filtered = filtered.filter(r => (r.fecha_solicitud || "") <= filters.fechaFinal + "T23:59:59");
      }

      setRecords(filtered);
      setPage(0);
    } catch (error) {
      console.error("Error loading records:", error);
    } finally {
      setLoading(false);
    }
  }, [filters, employees]);

  useEffect(() => {
    if (employees.length > 0) loadRecords();
  }, [loadRecords, employees.length]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const startDate = `${filters.year}-${String(filters.month).padStart(2, "0")}-01`;
      const lastDay = new Date(filters.year, filters.month, 0).getDate();
      const endDate = `${filters.year}-${String(filters.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const attRecords = await base44.entities.AttendanceRecord.filter({}, "-date", 5000);
      const monthRecords = (attRecords || []).filter(r => r.date >= startDate && r.date <= endDate);

      const empMap = {};
      monthRecords.forEach(r => {
        if (!empMap[r.employee_id]) empMap[r.employee_id] = { tardanza: 0, adicionales: 0 };
        empMap[r.employee_id].tardanza += r.late_minutes || 0;
        const overtimeMin = Math.round(((r.overtime_hours_25 || 0) + (r.overtime_hours_35 || 0)) * 60);
        empMap[r.employee_id].adicionales += overtimeMin;
      });

      const existing = await base44.entities.TardanzaCompensacion.filter(
        { month: filters.month, year: filters.year }, "-updated_date", 500
      );
      const existingIds = new Set((existing || []).map(r => r.employee_id));

      const empById = {};
      employees.forEach(e => { empById[e.id] = e; });

      const toCreate = [];
      Object.entries(empMap).forEach(([empId, data]) => {
        if (data.tardanza <= 0) return;
        if (existingIds.has(empId)) return;
        if (!empById[empId]) return;
        toCreate.push({
          employee_id: empId,
          month: filters.month,
          year: filters.year,
          minutos_tardanza: data.tardanza,
          minutos_adicionales_trabajados: data.adicionales,
          minutos_sugeridos: Math.min(data.tardanza, data.adicionales),
          minutos_autorizados: 0,
          estado: "Borrador",
          fecha_solicitud: new Date().toISOString(),
        });
      });

      if (toCreate.length > 0) {
        await base44.entities.TardanzaCompensacion.bulkCreate(toCreate);
      }
      await loadRecords();
    } catch (error) {
      console.error("Error generating drafts:", error);
    } finally {
      setGenerating(false);
    }
  };

  const handleAction = async (record, action, extraData = {}) => {
    try {
      const user = await base44.auth.me();
      const userName = user.full_name || user.email;
      const nowIso = new Date().toISOString();
      let update = { ...extraData };

      if (action === "approve") {
        update.estado = "Aprobado";
        update.aprobado_por = userName;
        update.fecha_aprobacion = nowIso;
      } else if (action === "reject") {
        update.estado = "Rechazado";
        update.aprobado_por = userName;
        update.fecha_aprobacion = nowIso;
      } else if (action === "close") {
        update.estado = "Cerrado";
        update.cerrado_por = userName;
        update.fecha_cierre = nowIso;
      } else if (action === "save") {
        update.estado = "Borrador";
      }

      await base44.entities.TardanzaCompensacion.update(record.id, update);
      await loadRecords();
      setDetalleRecord(null);
    } catch (error) {
      console.error("Error updating record:", error);
    }
  };

  const empById = {};
  employees.forEach(e => { empById[e.id] = e; });
  const getEmployeeName = (id) => {
    const e = empById[id];
    return e ? `${e.first_name} ${e.last_name}` : "—";
  };
  const getEmployeeArea = (id) => {
    const e = empById[id];
    return e ? (e.department_name || e.area_trabajo || "—") : "—";
  };

  const totalPages = Math.ceil(records.length / pageSize);
  const pageRecords = records.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compensación de Tardanzas</h1>
          <p className="text-sm text-slate-500">Gestión mensual de compensación de tardanzas por tiempo adicional trabajado</p>
        </div>
        <Button onClick={handleGenerate} disabled={generating || loading}>
          <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
          {generating ? "Generando..." : "Generar Borradores"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Mes</Label>
              <Select value={String(filters.month)} onValueChange={v => setFilters({ ...filters, month: parseInt(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Año</Label>
              <Input type="number" value={filters.year} onChange={e => setFilters({ ...filters, year: parseInt(e.target.value) || filters.year })} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Empleado</Label>
              <Select value={filters.employee_id || "all"} onValueChange={v => setFilters({ ...filters, employee_id: v === "all" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Área</Label>
              <Input value={filters.area} onChange={e => setFilters({ ...filters, area: e.target.value })} placeholder="Filtrar por área" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Fec. Inicial</Label>
              <Input type="date" value={filters.fechaInicial} onChange={e => setFilters({ ...filters, fechaInicial: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Fec. Final</Label>
              <Input type="date" value={filters.fechaFinal} onChange={e => setFilters({ ...filters, fechaFinal: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Estado</Label>
              <Select value={filters.estado || "all"} onValueChange={v => setFilters({ ...filters, estado: v === "all" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={loadRecords} className="w-full">
                <Search className="w-4 h-4" /> Buscar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Empleado</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Área</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">Tardanza (min)</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">Adicionales (min)</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">Sugerido</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">Autorizado</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">Descontable</th>
                  <th className="px-3 py-2 text-center font-medium text-slate-600 whitespace-nowrap">Estado</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Observación</th>
                  <th className="px-3 py-2 text-center font-medium text-slate-600 whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="text-center py-12 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Cargando...
                  </td></tr>
                ) : pageRecords.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No hay registros. Use "Generar Borradores" para crear registros del período.
                  </td></tr>
                ) : (
                  pageRecords.map(r => {
                    const descontable = Math.max(0, (r.minutos_tardanza || 0) - (r.minutos_autorizados || 0));
                    const isClosed = r.estado === "Cerrado";
                    return (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{getEmployeeName(r.employee_id)}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{getEmployeeArea(r.employee_id)}</td>
                        <td className="px-3 py-2 text-right text-red-600 font-medium">{r.minutos_tardanza || 0}</td>
                        <td className="px-3 py-2 text-right text-green-600 font-medium">{r.minutos_adicionales_trabajados || 0}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{r.minutos_sugeridos || 0}</td>
                        <td className="px-3 py-2 text-right text-indigo-600 font-medium">{r.minutos_autorizados || 0}</td>
                        <td className="px-3 py-2 text-right text-slate-800 font-bold">{descontable}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant="outline" className={`text-xs ${estadoBadge(r.estado)}`}>{r.estado}</Badge>
                        </td>
                        <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate" title={r.observacion || ""}>
                          {r.observacion || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-0.5">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDetalleRecord(r)} title="Ver detalle">
                              <Eye className="w-4 h-4" />
                            </Button>
                            {!isClosed && (
                              <>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => setDetalleRecord(r)} title="Editar">
                                  <FileText className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleAction(r, "approve")} title="Aprobar">
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => handleAction(r, "reject")} title="Rechazar">
                                  <X className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-600" onClick={() => handleAction(r, "close")} title="Cerrar">
                                  <Lock className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {isClosed && <span className="text-xs text-slate-400 px-1">—</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {records.length > pageSize && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
              <span className="text-sm text-slate-500">
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, records.length)} de {records.length}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {detalleRecord && (
        <TardanzaCompensacionDetalle
          record={detalleRecord}
          employee={empById[detalleRecord.employee_id]}
          onClose={() => setDetalleRecord(null)}
          onSave={(data, action) => handleAction(detalleRecord, action, data)}
        />
      )}
    </div>
  );
}