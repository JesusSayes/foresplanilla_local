import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from '@/api/entitiesClient';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Download, Upload, RefreshCw, CheckCircle, XCircle,
  AlertCircle, Clock, BookOpen, Filter, Eye, Loader2
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";

const ESTADO_CONFIG = {
  Pendiente: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
  Migrado:   { color: "bg-green-100 text-green-700 border-green-200",   icon: CheckCircle },
  Error:     { color: "bg-red-100 text-red-700 border-red-200",         icon: XCircle },
  Excluido:  { color: "bg-slate-100 text-slate-600 border-slate-200",   icon: AlertCircle },
};

const ORIGEN_COLORS = {
  Planilla:      "bg-indigo-100 text-indigo-700",
  CTS:           "bg-purple-100 text-purple-700",
  Gratificacion: "bg-pink-100 text-pink-700",
  Liquidacion:   "bg-orange-100 text-orange-700",
  Vacaciones:    "bg-teal-100 text-teal-700",
  Prestamo:      "bg-blue-100 text-blue-700",
  Manual:        "bg-slate-100 text-slate-600",
  Otro:          "bg-gray-100 text-gray-600",
};

export default function AsientosContables() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPeriodo, setFilterPeriodo] = useState("");
  const [filterSubdiario, setFilterSubdiario] = useState("all");
  const [filterOrigen, setFilterOrigen] = useState("all");
  const [filterMigracion, setFilterMigracion] = useState("all");
  const [filterDH, setFilterDH] = useState("all");
  const [filterAnulado, setFilterAnulado] = useState("all");

  // Detail modal
  const [selectedAsiento, setSelectedAsiento] = useState(null);
  const [migratingIds, setMigratingIds] = useState(new Set());

  useEffect(() => {
    if (currentUser?.employee?.role === "admin" || currentUser?.employee?.role === "super_admin") {
      updateEmployeeStatuses().then(result => {
        if (result.success && result.updatedCount > 0) {
          console.log(`${result.updatedCount} empleado(s) actualizado(s) a estado Cesado automáticamente`);
        }
      });
    }
  }, [currentUser]);

  const { data: asientos = [], isLoading } = useQuery({
    queryKey: ["asientosContables"],
    queryFn: () => entitiesAPI.AsientoContable.list("-fecha_registro", 1000),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: () => entitiesAPI.Employee.list("-created_date"),
  });

  const { data: cuentas = [] } = useQuery({
    queryKey: ["accountingAccounts"],
    queryFn: () => entitiesAPI.AccountingAccount.list("cuenta"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => entitiesAPI.AsientoContable.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(["asientosContables"]),
  });

  // Filtrado
  const filtered = asientos.filter(a => {
    const emp = employees.find(e => e.id === a.employee_id);
    const empName = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
    const matchSearch = !searchTerm ||
      a.cuenta?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.comprobante?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.glosa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.glosa_mov?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.cod_anexo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.nro_doc?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      empName.includes(searchTerm.toLowerCase());
    const matchPeriodo = !filterPeriodo || a.annomes?.startsWith(filterPeriodo.replace("-", ""));
    const matchSubdiario = filterSubdiario === "all" || a.subdiario === filterSubdiario;
    const matchOrigen = filterOrigen === "all" || a.origen === filterOrigen;
    const matchMigracion = filterMigracion === "all" || a.estado_migracion === filterMigracion;
    const matchDH = filterDH === "all" || a.debe_haber === filterDH;
    const matchAnulado = filterAnulado === "all" || (filterAnulado === "si" ? a.anulado : !a.anulado);
    return matchSearch && matchPeriodo && matchSubdiario && matchOrigen && matchMigracion && matchDH && matchAnulado;
  });

  // Estadísticas
  const stats = {
    total: filtered.length,
    pendientes: filtered.filter(a => a.estado_migracion === "Pendiente").length,
    migrados: filtered.filter(a => a.estado_migracion === "Migrado").length,
    errores: filtered.filter(a => a.estado_migracion === "Error").length,
    excluidos: filtered.filter(a => a.estado_migracion === "Excluido").length,
    totalDebe: filtered.filter(a => a.debe_haber === "D" && !a.anulado).reduce((s, a) => s + (a.importe || 0), 0),
    totalHaber: filtered.filter(a => a.debe_haber === "H" && !a.anulado).reduce((s, a) => s + (a.importe || 0), 0),
  };

  const subdiarios = [...new Set(asientos.map(a => a.subdiario).filter(Boolean))].sort();

  const handleMarcarMigrado = async (asiento) => {
    setMigratingIds(prev => new Set([...prev, asiento.id]));
    await updateMutation.mutateAsync({
      id: asiento.id,
      data: {
        estado_migracion: "Migrado",
        migrado: true,
        fecha_migracion: new Date().toISOString(),
        migrado_por: currentUser?.email || "",
      }
    });
    setMigratingIds(prev => { const s = new Set(prev); s.delete(asiento.id); return s; });
    toast.success(`Asiento ${asiento.comprobante} marcado como migrado`);
  };

  const handleMarcarError = async (asiento) => {
    const motivo = prompt("Ingresa el motivo del error de migración:");
    if (!motivo) return;
    await updateMutation.mutateAsync({
      id: asiento.id,
      data: {
        estado_migracion: "Error",
        migrado: false,
        error_migracion: motivo,
      }
    });
    toast.error(`Asiento marcado con error de migración`);
  };

  const handleExcluir = async (asiento) => {
    await updateMutation.mutateAsync({
      id: asiento.id,
      data: { estado_migracion: "Excluido" }
    });
    toast.success("Asiento excluido de la migración");
  };

  const handleRevertir = async (asiento) => {
    await updateMutation.mutateAsync({
      id: asiento.id,
      data: {
        estado_migracion: "Pendiente",
        migrado: false,
        fecha_migracion: null,
        migrado_por: "",
        error_migracion: "",
      }
    });
    toast.info("Asiento revertido a Pendiente");
  };

  const handleMarcarMigradoLote = async () => {
    const pendientes = filtered.filter(a => a.estado_migracion === "Pendiente");
    if (pendientes.length === 0) { toast.info("No hay asientos pendientes en la selección actual"); return; }
    if (!confirm(`¿Marcar ${pendientes.length} asientos como MIGRADOS?`)) return;
    for (const a of pendientes) {
      await updateMutation.mutateAsync({
        id: a.id,
        data: {
          estado_migracion: "Migrado",
          migrado: true,
          fecha_migracion: new Date().toISOString(),
          migrado_por: currentUser?.email || "",
        }
      });
    }
    toast.success(`${pendientes.length} asientos marcados como migrados`);
  };

  const handleExportExcel = () => {
    const data = filtered.map(a => {
      const emp = employees.find(e => e.id === a.employee_id);
      return {
        "Período": a.annomes,
        "Subdiario": a.subdiario,
        "Comprobante": a.comprobante,
        "Cuenta": a.cuenta,
        "Fecha Doc.": a.fecha_doc,
        "Tipo Anexo": a.tipo_anexo,
        "Cód. Anexo": a.cod_anexo,
        "Tipo Doc.": a.tipo_doc,
        "N° Doc.": a.nro_doc,
        "Moneda": a.moneda,
        "D/H": a.debe_haber,
        "Importe": a.importe,
        "TC": a.tc,
        "Importe Soles": a.importe_soles,
        "Glosa": a.glosa,
        "Glosa Movimiento": a.glosa_mov,
        "Centro Costos": a.centro_costos,
        "Medio Pago": a.medio_pago,
        "Origen": a.origen,
        "Planilla": a.payroll_period,
        "Tipo Planilla": a.payroll_type,
        "Empleado": emp ? `${emp.first_name} ${emp.last_name}` : "",
        "Anulado": a.anulado ? "SÍ" : "NO",
        "Estado Migración": a.estado_migracion,
        "Fecha Migración": a.fecha_migracion ? format(new Date(a.fecha_migracion), "dd/MM/yyyy HH:mm") : "",
        "Migrado por": a.migrado_por,
        "Sistema Destino": a.sistema_destino,
        "Cód. Migración": a.codigo_migracion,
        "Error Migración": a.error_migracion,
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Asientos");
    XLSX.writeFile(wb, `AsientosContables_${filterPeriodo || "todos"}.xlsx`);
    toast.success("Excel exportado correctamente");
  };

  const formatMoney = (n) => n == null ? "--" : new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2 }).format(n);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2 flex items-center gap-3">
              <BookOpen className="w-9 h-9 text-indigo-600" />
              Libro Diario — Asientos Contables
            </h1>
            <p className="text-slate-600 text-lg">Consulta, control y migración de asientos al sistema contable</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => queryClient.invalidateQueries(["asientosContables"])}>
              <RefreshCw className="w-4 h-4 mr-2" />Actualizar
            </Button>
            <Button variant="outline" className="bg-green-600 text-white hover:bg-green-700" onClick={handleExportExcel}>
              <Download className="w-4 h-4 mr-2" />Exportar Excel
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={handleMarcarMigradoLote}
            >
              <Upload className="w-4 h-4 mr-2" />Marcar Migrados (lote)
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {[
            { label: "Total", value: stats.total, color: "blue", icon: BookOpen },
            { label: "Pendientes", value: stats.pendientes, color: "yellow", icon: Clock },
            { label: "Migrados", value: stats.migrados, color: "green", icon: CheckCircle },
            { label: "Errores", value: stats.errores, color: "red", icon: XCircle },
            { label: "Excluidos", value: stats.excluidos, color: "slate", icon: AlertCircle },
            { label: "Total Debe", value: `S/ ${formatMoney(stats.totalDebe)}`, color: "indigo", icon: null, small: true },
            { label: "Total Haber", value: `S/ ${formatMoney(stats.totalHaber)}`, color: "purple", icon: null, small: true },
          ].map(({ label, value, color, icon: Icon, small }) => (
            <Card key={label} className="border-0 shadow-lg">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  {Icon && <div className={`p-2 bg-${color}-100 rounded-lg shrink-0`}><Icon className={`w-4 h-4 text-${color}-600`} /></div>}
                  <div>
                    <div className={`font-bold text-slate-900 leading-tight ${small ? "text-sm" : "text-xl"}`}>{value}</div>
                    <p className="text-slate-500 text-xs">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <Card className="border-0 shadow-lg mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input placeholder="Buscar cuenta, comprobante, glosa, empleado..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Input
                type="month"
                value={filterPeriodo}
                onChange={e => setFilterPeriodo(e.target.value)}
                className="w-40"
                title="Filtrar por período"
              />
              <Select value={filterSubdiario} onValueChange={setFilterSubdiario}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Subdiario" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {subdiarios.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterOrigen} onValueChange={setFilterOrigen}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Origen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {["Manual","Planilla","CTS","Gratificacion","Liquidacion","Vacaciones","Prestamo","Otro"].map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterDH} onValueChange={setFilterDH}>
                <SelectTrigger className="w-28"><SelectValue placeholder="D/H" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Debe/Haber</SelectItem>
                  <SelectItem value="D">Debe</SelectItem>
                  <SelectItem value="H">Haber</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterMigracion} onValueChange={setFilterMigracion}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Migración" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Pendiente">Pendiente</SelectItem>
                  <SelectItem value="Migrado">Migrado</SelectItem>
                  <SelectItem value="Error">Error</SelectItem>
                  <SelectItem value="Excluido">Excluido</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterAnulado} onValueChange={setFilterAnulado}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Anulados" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="no">Vigentes</SelectItem>
                  <SelectItem value="si">Anulados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabla de asientos */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b bg-slate-50/50 py-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              {filtered.length} asiento(s) encontrado(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <BookOpen className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-500">No se encontraron asientos con los filtros aplicados</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      {["Período","Subdiario","Comprobante","Cuenta","Glosa","D/H","Importe","Moneda","Origen","Empleado","Anulado","Estado Migración","Acciones"].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(asiento => {
                      const emp = employees.find(e => e.id === asiento.employee_id);
                      const estConfig = ESTADO_CONFIG[asiento.estado_migracion] || ESTADO_CONFIG.Pendiente;
                      const EstIcon = estConfig.icon;
                      const isMigrating = migratingIds.has(asiento.id);
                      return (
                        <tr key={asiento.id} className={`hover:bg-slate-50 transition-colors ${asiento.anulado ? "opacity-50" : ""}`}>
                          <td className="px-3 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{asiento.annomes}</td>
                          <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{asiento.subdiario || "—"}</td>
                          <td className="px-3 py-3 font-medium text-indigo-700 whitespace-nowrap">{asiento.comprobante}</td>
                          <td className="px-3 py-3 font-mono text-xs text-slate-800 whitespace-nowrap">{asiento.cuenta}</td>
                          <td className="px-3 py-3 text-slate-600 max-w-[180px] truncate" title={asiento.glosa_mov || asiento.glosa}>
                            {asiento.glosa_mov || asiento.glosa || "—"}
                          </td>
                          <td className="px-3 py-3">
                            <Badge className={asiento.debe_haber === "D" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}>
                              {asiento.debe_haber === "D" ? "DEBE" : "HABER"}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                            {formatMoney(asiento.importe)}
                          </td>
                          <td className="px-3 py-3 text-slate-600">{asiento.moneda}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ORIGEN_COLORS[asiento.origen] || ORIGEN_COLORS.Manual}`}>
                              {asiento.origen || "Manual"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-600 whitespace-nowrap text-xs">
                            {emp ? `${emp.first_name} ${emp.last_name}` : (asiento.cod_anexo || "—")}
                          </td>
                          <td className="px-3 py-3">
                            {asiento.anulado
                              ? <Badge className="bg-red-100 text-red-700">Anulado</Badge>
                              : <Badge className="bg-green-100 text-green-700">Vigente</Badge>}
                          </td>
                          <td className="px-3 py-3">
                            <Badge className={`${estConfig.color} flex items-center gap-1 w-fit`}>
                              <EstIcon className="w-3 h-3" />
                              {asiento.estado_migracion}
                            </Badge>
                            {asiento.fecha_migracion && (
                              <p className="text-xs text-slate-400 mt-0.5">
                                {format(new Date(asiento.fecha_migracion), "dd/MM/yy HH:mm")}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSelectedAsiento(asiento)} title="Ver detalle">
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              {asiento.estado_migracion === "Pendiente" && !asiento.anulado && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-green-700 border-green-300 hover:bg-green-50 text-xs"
                                  disabled={isMigrating}
                                  onClick={() => handleMarcarMigrado(asiento)}
                                >
                                  {isMigrating ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                                </Button>
                              )}
                              {asiento.estado_migracion === "Pendiente" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-red-600 border-red-200 hover:bg-red-50 text-xs"
                                  onClick={() => handleMarcarError(asiento)}
                                  title="Marcar error"
                                >
                                  <XCircle className="w-3 h-3" />
                                </Button>
                              )}
                              {asiento.estado_migracion === "Pendiente" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-slate-500 border-slate-200 hover:bg-slate-50 text-xs"
                                  onClick={() => handleExcluir(asiento)}
                                  title="Excluir de migración"
                                >
                                  <AlertCircle className="w-3 h-3" />
                                </Button>
                              )}
                              {["Migrado","Error","Excluido"].includes(asiento.estado_migracion) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-slate-500 border-slate-200 hover:bg-slate-50 text-xs"
                                  onClick={() => handleRevertir(asiento)}
                                  title="Revertir a Pendiente"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal detalle */}
        {selectedAsiento && (
          <DetalleAsientoModal
            asiento={selectedAsiento}
            employees={employees}
            cuentas={cuentas}
            onClose={() => setSelectedAsiento(null)}
          />
        )}
      </div>
    </div>
  );
}

function DetalleAsientoModal({ asiento, employees, cuentas, onClose }) {
  const emp = employees.find(e => e.id === asiento.employee_id);
  const cuenta = cuentas.find(c => c.cuenta === asiento.cuenta);
  const estConfig = ESTADO_CONFIG[asiento.estado_migracion] || ESTADO_CONFIG.Pendiente;
  const EstIcon = estConfig.icon;

  const Row = ({ label, value }) => value ? (
    <div className="flex justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500 font-medium">{label}</span>
      <span className="text-sm text-slate-900 text-right max-w-[60%]">{value}</span>
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Detalle del Asiento</h2>
            <p className="text-sm text-slate-500">Comprobante {asiento.comprobante} — {asiento.annomes}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={`${estConfig.color} flex items-center gap-1`}>
              <EstIcon className="w-3 h-3" />{asiento.estado_migracion}
            </Badge>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold">✕</button>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <Section title="Identificación del Asiento">
            <Row label="Período" value={asiento.annomes} />
            <Row label="Subdiario" value={asiento.subdiario} />
            <Row label="Comprobante" value={asiento.comprobante} />
            <Row label="Fecha Documento" value={asiento.fecha_doc} />
            <Row label="Fecha Registro" value={asiento.fecha_registro} />
            <Row label="Fecha Vencimiento" value={asiento.fecha_vencimiento} />
          </Section>
          <Section title="Cuenta Contable">
            <Row label="Cuenta" value={asiento.cuenta} />
            <Row label="Nombre Cuenta" value={cuenta?.nombre} />
            <Row label="Debe / Haber" value={asiento.debe_haber === "D" ? "DEBE" : "HABER"} />
          </Section>
          <Section title="Importe">
            <Row label="Moneda" value={asiento.moneda} />
            <Row label="Importe" value={asiento.importe?.toLocaleString("es-PE", { minimumFractionDigits: 2 })} />
            <Row label="Tipo de Cambio" value={asiento.tc} />
            <Row label="Importe Soles" value={asiento.importe_soles?.toLocaleString("es-PE", { minimumFractionDigits: 2 })} />
            <Row label="Conversión TC" value={asiento.conversion_tc} />
            <Row label="Medio de Pago" value={asiento.medio_pago} />
          </Section>
          <Section title="Anexo / Documento">
            <Row label="Tipo Anexo" value={asiento.tipo_anexo} />
            <Row label="Cód. Anexo" value={asiento.cod_anexo} />
            <Row label="Tipo Documento" value={asiento.tipo_doc} />
            <Row label="N° Documento" value={asiento.nro_doc} />
          </Section>
          <Section title="Glosas y Clasificación">
            <Row label="Glosa Cabecera" value={asiento.glosa} />
            <Row label="Glosa Movimiento" value={asiento.glosa_mov} />
            <Row label="Centro de Costos" value={asiento.centro_costos} />
            <Row label="Origen" value={asiento.origen} />
          </Section>
          {asiento.employee_id && (
            <Section title="Relación con Planilla">
              <Row label="Empleado" value={emp ? `${emp.first_name} ${emp.last_name}` : asiento.employee_id} />
              <Row label="Período Planilla" value={asiento.payroll_period} />
              <Row label="Tipo Planilla" value={asiento.payroll_type} />
            </Section>
          )}
          <Section title="Control de Migración">
            <Row label="Estado" value={asiento.estado_migracion} />
            <Row label="Migrado" value={asiento.migrado ? "Sí" : "No"} />
            <Row label="Fecha Migración" value={asiento.fecha_migracion ? format(new Date(asiento.fecha_migracion), "dd/MM/yyyy HH:mm", { locale: es }) : null} />
            <Row label="Migrado por" value={asiento.migrado_por} />
            <Row label="Sistema Destino" value={asiento.sistema_destino} />
            <Row label="Cód. Migración" value={asiento.codigo_migracion} />
            {asiento.error_migracion && <Row label="Error" value={asiento.error_migracion} />}
          </Section>
          {asiento.anulado && (
            <Section title="Anulación">
              <Row label="Anulado" value="Sí" />
              <Row label="Motivo" value={asiento.motivo_anulacion} />
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{title}</h3>
      <div className="bg-slate-50 rounded-lg px-4 py-1">{children}</div>
    </div>
  );
}
