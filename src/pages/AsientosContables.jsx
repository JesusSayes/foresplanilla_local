import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from '@/api/entitiesClient';
import { starsoftAPI } from '@/api/localClient';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Download, RefreshCw, CheckCircle, XCircle,
  AlertCircle, Clock, BookOpen, Filter, Eye, Loader2, Send
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
  const [filterPeriodo, setFilterPeriodo] = useState("all");
  const [filterSubdiario, setFilterSubdiario] = useState("all");
  const [filterOrigen, setFilterOrigen] = useState("all");
  const [filterMigracion, setFilterMigracion] = useState("all");
  const [filterDH, setFilterDH] = useState("all");
  const [filterAnulado, setFilterAnulado] = useState("all");
  const [filterTipoPlanilla, setFilterTipoPlanilla] = useState("all");
  const [filterCuadre, setFilterCuadre] = useState("all"); // all | cuadrado | descuadrado

  // Detail modal
  const [selectedAsiento, setSelectedAsiento] = useState(null);
  const [migratingIds, setMigratingIds] = useState(new Set());
  const [migrandoStarsoft, setMigrandoStarsoft] = useState(false);
  const [reinciandoErrores, setReinciandoErrores] = useState(false);
  const [modalMigracion, setModalMigracion] = useState(null);
  const [progresoMigracion, setProgresoMigracion] = useState({ logs: [], total: 0, procesados: 0 });
  const [previewStarsoft, setPreviewStarsoft] = useState(null);
  const [cargandoPreviewStarsoft, setCargandoPreviewStarsoft] = useState(false);
  const [previewPendientes, setPreviewPendientes] = useState([]);

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
    queryKey: ["cuentas_contables"],
    queryFn: () => entitiesAPI.CuentaContable.list("cuenta"),
  });

  const { data: subdiariosCatalog = [] } = useQuery({
    queryKey: ["subdiarios_catalog"],
    queryFn: () => entitiesAPI.Subdiario.list("codigo"),
  });

  const { data: tipoAnexos = [] } = useQuery({
    queryKey: ["tipo_anexos"],
    queryFn: () => entitiesAPI.TipoAnexo.list("codigo_tipo_anexo"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => entitiesAPI.AsientoContable.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(["asientosContables"]),
  });

  // Filtrado
  const filtered = asientos.filter(a => {
    const emp = employees.find(e => e.id === a.employee_id);
    const empName = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
    const cuentaInfo = cuentas.find(c => c.cuenta === a.cuenta);
    const cuentaDesc = cuentaInfo?.descripcion?.toLowerCase() || "";
    const matchSearch = !searchTerm ||
      a.cuenta?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cuentaDesc.includes(searchTerm.toLowerCase()) ||
      a.comprobante?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.glosa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.glosa_mov?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.cod_anexo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.nro_doc?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      empName.includes(searchTerm.toLowerCase());
    const matchPeriodo = filterPeriodo === "all" || a.annomes === filterPeriodo;
    const matchSubdiario = filterSubdiario === "all" || a.subdiario === filterSubdiario;
    const matchOrigen = filterOrigen === "all" || a.origen === filterOrigen;
    const matchMigracion = filterMigracion === "all" || a.estado_migracion === filterMigracion;
    const matchDH = filterDH === "all" || a.debe_haber === filterDH;
    const matchAnulado = filterAnulado === "all" || (filterAnulado === "si" ? a.anulado : !a.anulado);
    const matchTipoPlanilla = filterTipoPlanilla === "all" || a.payroll_type === filterTipoPlanilla;
    return matchSearch && matchPeriodo && matchSubdiario && matchOrigen && matchMigracion && matchDH && matchAnulado && matchTipoPlanilla;
  });

  // ── Cálculo de cuadre por trabajador (Debe = Haber) ──────────────────────
  // Agrupa asientos por (empleado + periodo + tipo planilla + comprobante) y
  // suma Debe/Haber. Un grupo "descuadrado" tiene |Debe - Haber| > 0.01.
  const gruposCuadre = useMemo(() => {
    const map = new Map();
    for (const a of asientos) {
      if (a.anulado) continue;
      const key = `${a.employee_id || ""}|${a.payroll_period || ""}|${a.payroll_type || ""}|${a.comprobante || ""}`;
      if (!map.has(key)) map.set(key, { key, employee_id: a.employee_id, payroll_period: a.payroll_period, payroll_type: a.payroll_type, comprobante: a.comprobante, annomes: a.annomes, debe: 0, haber: 0, count: 0 });
      const g = map.get(key);
      const imp = Number(a.importe) || 0;
      if (a.debe_haber === "D") g.debe += imp; else g.haber += imp;
      g.count += 1;
    }
    return Array.from(map.values()).map(g => ({ ...g, debe: Math.round(g.debe * 100) / 100, haber: Math.round(g.haber * 100) / 100, diferencia: Math.round((g.debe - g.haber) * 100) / 100, cuadrado: Math.abs(g.debe - g.haber) <= 0.01 }));
  }, [asientos]);

  // Set de claves de grupos descuadrados, para filtrar asientos
  const descuadradosKeys = useMemo(() => {
    const s = new Set();
    for (const g of gruposCuadre) if (!g.cuadrado) s.add(g.key);
    return s;
  }, [gruposCuadre]);

  const asientoKey = (a) => `${a.employee_id || ""}|${a.payroll_period || ""}|${a.payroll_type || ""}|${a.comprobante || ""}`;

  // Aplicar filtro de cuadre sobre el resultado filtrado
  const filteredFinal = filterCuadre === "all" ? filtered : filtered.filter(a => {
    const isDescuadrado = descuadradosKeys.has(asientoKey(a));
    return filterCuadre === "descuadrado" ? isDescuadrado : !isDescuadrado;
  });

  // Lista de trabajadores descuadrados (para el banner de alerta)
  const descuadradosResumen = useMemo(() => gruposCuadre.filter(g => !g.cuadrado).map(g => {
    const emp = employees.find(e => e.id === g.employee_id);
    return { ...g, employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "—" };
  }), [gruposCuadre, employees]);

  // Periodos existentes (annomes) ordenados descendentemente
  const periodosExistentes = useMemo(() => {
    const set = new Set(asientos.map(a => a.annomes).filter(Boolean));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [asientos]);

  // Estadísticas
  const stats = {
    total: filteredFinal.length,
    pendientes: filteredFinal.filter(a => a.estado_migracion === "Pendiente").length,
    migrados: filteredFinal.filter(a => a.estado_migracion === "Migrado").length,
    errores: filteredFinal.filter(a => a.estado_migracion === "Error").length,
    excluidos: filteredFinal.filter(a => a.estado_migracion === "Excluido").length,
    totalDebe: filteredFinal.filter(a => a.debe_haber === "D" && !a.anulado).reduce((s, a) => s + (Number(a.importe) || 0), 0),
    totalHaber: filteredFinal.filter(a => a.debe_haber === "H" && !a.anulado).reduce((s, a) => s + (Number(a.importe) || 0), 0),
    descuadrados: filteredFinal.filter(a => !a.anulado && descuadradosKeys.has(asientoKey(a))).length,
  };

  // Combinar catálogo de subdiarios con los que aparecen en asientos (por si hay sin catálogo aún)
  const subdiariosCodigos = [...new Set([
    ...subdiariosCatalog.map(s => s.codigo),
    ...asientos.map(a => a.subdiario).filter(Boolean),
  ])].sort();

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

  const handleMigrarStarsoft = async () => {
    const pendientes = filteredFinal.filter(a => a.estado_migracion === "Pendiente" && !a.anulado);
    if (pendientes.length === 0) {
      toast.info("No hay asientos pendientes para migrar en la selección actual");
      return;
    }
    setCargandoPreviewStarsoft(true);
    try {
      const res = await base44.functions.invoke("migrarAsientosStarsoft", {
        mode: "preview",
        asiento_ids: pendientes.map(a => a.id),
      });
      const data = res.data;
      if (data?.success === false || data?.error) {
        toast.error(data?.error || "No se pudo generar la vista previa de envío a Starsoft");
        return;
      }
      setPreviewStarsoft({
        total: data?.total ?? 0,
        destination: data?.destination ?? null,
        payload: data?.payload ?? [],
      });
      setPreviewPendientes(pendientes);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "No se pudo generar la vista previa de envío a Starsoft";
      toast.error(msg);
    } finally {
      setCargandoPreviewStarsoft(false);
    }
  };

  const handleConfirmarMigracionStarsoft = () => {
    const pendientes = previewPendientes;
    setPreviewStarsoft(null);
    setPreviewPendientes([]);
    ejecutarMigracionStarsoft(pendientes);
  };

  const ejecutarMigracionStarsoft = async (pendientes) => {
    setMigrandoStarsoft(true);
    setModalMigracion(null);
    setProgresoMigracion({ logs: [], total: pendientes.length, procesados: 0 });

    const CHUNK_SIZE = 20;
    const chunks = [];
    for (let i = 0; i < pendientes.length; i += CHUNK_SIZE) {
      chunks.push(pendientes.slice(i, i + CHUNK_SIZE));
    }

    let totalMigrados = 0;
    let totalErrores = 0;
    const detalleErrores = [];

    for (const chunk of chunks) {
      // Marcar los registros del lote como "procesando"
      setProgresoMigracion(prev => ({
        ...prev,
        logs: [...prev.logs, ...chunk.map(a => ({
          id: a.id, comprobante: a.comprobante, cuenta: a.cuenta,
          estado: "procesando", mensaje: "Enviando a Starsoft…",
        }))],
      }));

      try {
        const data = await starsoftAPI.migrate({
          mode: "migrate",
          asiento_ids: chunk.map(a => a.id),
        });
        const ok = data?.success !== false && !data?.error;
        const errMsg = data?.error || "";

        setProgresoMigracion(prev => {
          const newLogs = [...prev.logs];
          chunk.forEach(a => {
            const idx = newLogs.findIndex(l => l.id === a.id);
            if (idx >= 0) {
              newLogs[idx] = {
                ...newLogs[idx],
                estado: ok ? "ok" : "error",
                mensaje: ok ? "Migrado correctamente" : errMsg,
              };
            }
          });
          return { ...prev, logs: newLogs, procesados: prev.procesados + chunk.length };
        });

        if (ok) {
          totalMigrados += chunk.length;
        } else {
          totalErrores += chunk.length;
          chunk.forEach(a => detalleErrores.push({ id: a.id, comprobante: a.comprobante, cuenta: a.cuenta, error: errMsg }));
        }
      } catch (err) {
        const msg = err?.response?.data?.error || err.message;
        totalErrores += chunk.length;
        chunk.forEach(a => detalleErrores.push({ id: a.id, comprobante: a.comprobante, cuenta: a.cuenta, error: msg }));
        setProgresoMigracion(prev => {
          const newLogs = [...prev.logs];
          chunk.forEach(a => {
            const idx = newLogs.findIndex(l => l.id === a.id);
            if (idx >= 0) {
              newLogs[idx] = { ...newLogs[idx], estado: "error", mensaje: msg };
            }
          });
          return { ...prev, logs: newLogs, procesados: prev.procesados + chunk.length };
        });
      }
    }

    setModalMigracion({
      total: pendientes.length,
      migrados: totalMigrados,
      errores: totalErrores,
      detalle_errores: detalleErrores,
    });
    queryClient.invalidateQueries(["asientosContables"]);
    if (totalErrores > 0) {
      toast.warning(`Migración finalizada: ${totalMigrados} exitosos, ${totalErrores} errores`);
    } else {
      toast.success(`${totalMigrados} asiento(s) migrados a Starsoft`);
    }
    setMigrandoStarsoft(false);
  };

  // Reiniciar masivamente los asientos con estado "Error" a "Pendiente" para
  // permitir reintentar la migración sobre el lote que falló.
  const handleReiniciarErrores = async () => {
    const errores = filteredFinal.filter(a => a.estado_migracion === "Error");
    if (errores.length === 0) { toast.info("No hay asientos con error en la selección actual"); return; }
    if (!confirm(`¿Reiniciar ${errores.length} asiento(s) con error a estado "Pendiente"?`)) return;
    setReinciandoErrores(true);
    try {
      for (const a of errores) {
        await updateMutation.mutateAsync({
          id: a.id,
          data: {
            estado_migracion: "Pendiente",
            migrado: false,
            error_migracion: "",
            fecha_migracion: null,
            migrado_por: "",
          }
        });
      }
      toast.success(`${errores.length} asiento(s) reiniciado(s) a Pendiente`);
    } finally {
      setReinciandoErrores(false);
    }
  };

  // Exporta con la cadena de conexión exacta que requiere el sistema contable externo
  const handleExportExcel = () => {
    // Hoja 1: Cadena de conexión del sistema contable (campos exactos requeridos)
    const dataConexion = filteredFinal.map(a => ({
      "empresa":          a.empresa || "003",
      "cuenta":           a.cuenta || "",
      "annomes":          a.annomes || "",
      "subdiario":        a.subdiario || "",
      "comprobante":      a.comprobante || "",
      "fecha_Documento":  a.fecha_doc || "",
      "tipo_Anexo":       a.tipo_anexo || "",
      "cod_Proveedor":    a.cod_anexo || "",
      "tipo_Doc":         a.tipo_doc || "",
      "nro_Doc":          a.nro_doc || "",
      "fecha_Vencimiento": a.fecha_vencimiento || a.fecha_doc || "",
      "importe_Doc":      a.importe ?? 0,
      "conversion_Tc":    a.conversion_tc || "M",
      "fecha_Registro":   a.fecha_registro || "",
      "tc":               a.tc ?? 1,
      "glosa":            a.glosa || "",
      "destino_Compra":   a.centro_costos || "",
      "centro_Costos":    a.centro_costos || "",
      "glosa_Mov":        a.glosa_mov || "",
      "anulado":          a.anulado ? "1" : "0",
      "debe_Haber":       a.debe_haber || "",
    }));

    // Hoja 2: Detalle interno con información adicional
    const dataDetalle = filteredFinal.map(a => {
      const emp = employees.find(e => e.id === a.employee_id);
      return {
        "Período":          a.annomes,
        "Subdiario":        a.subdiario,
        "Comprobante":      a.comprobante,
        "Cuenta":           a.cuenta,
        "Fecha Doc.":       a.fecha_doc,
        "Tipo Anexo":       a.tipo_anexo,
        "Cód. Anexo":       a.cod_anexo,
        "Tipo Doc.":        a.tipo_doc,
        "N° Doc.":          a.nro_doc,
        "Fecha Vencimiento": a.fecha_vencimiento || "",
        "Moneda":           a.moneda,
        "D/H":              a.debe_haber,
        "Importe":          a.importe,
        "TC":               a.tc,
        "Importe Soles":    a.importe_soles,
        "Conv. TC":         a.conversion_tc || "M",
        "Glosa":            a.glosa,
        "Glosa Movimiento": a.glosa_mov,
        "Centro Costos":    a.centro_costos,
        "Origen":           a.origen,
        "Tipo Planilla":    a.payroll_type,
        "Período Planilla": a.payroll_period,
        "Trabajador/Proveedor": emp ? `${emp.first_name} ${emp.last_name}` : (a.cod_anexo || ""),
        "Anulado":          a.anulado ? "SÍ" : "NO",
        "Estado Migración": a.estado_migracion,
        "Fecha Migración":  a.fecha_migracion ? format(new Date(a.fecha_migracion), "dd/MM/yyyy HH:mm") : "",
        "Migrado por":      a.migrado_por,
        "Error Migración":  a.error_migracion,
      };
    });

    const wb = XLSX.utils.book_new();
    const wsConexion = XLSX.utils.json_to_sheet(dataConexion);
    const wsDetalle  = XLSX.utils.json_to_sheet(dataDetalle);
    // Anchos de columna para la hoja de conexión
    wsConexion["!cols"] = [
      {wch:10},{wch:8},{wch:10},{wch:14},{wch:14},{wch:10},{wch:14},{wch:8},
      {wch:22},{wch:14},{wch:12},{wch:10},{wch:14},{wch:6},{wch:40},{wch:14},{wch:14},{wch:50},{wch:6},{wch:8}
    ];
    XLSX.utils.book_append_sheet(wb, wsConexion, "Cadena_Conexion");
    XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle_Interno");
    XLSX.writeFile(wb, `AsientosContables_${filterPeriodo || "todos"}.xlsx`);
    toast.success("Excel exportado: Hoja 'Cadena_Conexion' lista para importar al sistema contable");
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
              variant="outline"
              onClick={handleReiniciarErrores}
              disabled={reinciandoErrores}
              title="Reiniciar asientos con error a estado Pendiente"
            >
              {reinciandoErrores ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Reiniciar Errores
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={handleMigrarStarsoft}
              disabled={migrandoStarsoft || cargandoPreviewStarsoft}
            >
              {migrandoStarsoft || cargandoPreviewStarsoft ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              {cargandoPreviewStarsoft ? "Generando vista previa…" : "Migrar Pendientes"}
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
              <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Todos los períodos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los períodos</SelectItem>
                  {periodosExistentes.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterSubdiario} onValueChange={setFilterSubdiario}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Subdiario" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los subdiarios</SelectItem>
                  {subdiariosCodigos.map(codigo => {
                    const cat = subdiariosCatalog.find(s => s.codigo === codigo);
                    return (
                      <SelectItem key={codigo} value={codigo}>
                        {codigo}{cat ? ` — ${cat.nombre_breve || cat.descripcion}` : ""}
                      </SelectItem>
                    );
                  })}
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
              <Select value={filterTipoPlanilla} onValueChange={setFilterTipoPlanilla}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Tipo Planilla" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="SNP">SNP (Honorarios)</SelectItem>
                  <SelectItem value="Mensual">Mensual</SelectItem>
                  <SelectItem value="Quincenal">Quincenal</SelectItem>
                  <SelectItem value="Adicional">Adicional</SelectItem>
                  <SelectItem value="CTS">CTS</SelectItem>
                  <SelectItem value="Gratificacion">Gratificación</SelectItem>
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
              <Select value={filterCuadre} onValueChange={setFilterCuadre}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Cuadre" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos (cuadre)</SelectItem>
                  <SelectItem value="cuadrado">Cuadrados</SelectItem>
                  <SelectItem value="descuadrado">Descuadrados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Banner de alerta de trabajadores descuadrados */}
        {descuadradosResumen.length > 0 && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-bold text-red-800">
                  {descuadradosResumen.length} trabajador(es) con asiento descuadrado (Debe ≠ Haber)
                </h3>
                <p className="text-xs text-red-600 mt-0.5">
                  Regenera el asiento desde Consulta de Planillas tras completar la homologación de los conceptos faltantes (cada aporte del empleador necesita entrada DEBE y HABER con el mismo código PLAME).
                </p>
                <div className="mt-3 max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0">
                      <tr className="text-left text-red-700 bg-red-100/80 border-b border-red-200">
                        <th className="py-1.5 px-2 font-semibold">Trabajador</th>
                        <th className="py-1.5 px-2 font-semibold">Período</th>
                        <th className="py-1.5 px-2 font-semibold">Tipo</th>
                        <th className="py-1.5 px-2 font-semibold">Comprobante</th>
                        <th className="py-1.5 px-2 font-semibold text-right">Debe</th>
                        <th className="py-1.5 px-2 font-semibold text-right">Haber</th>
                        <th className="py-1.5 px-2 font-semibold text-right">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {descuadradosResumen.map(g => (
                        <tr key={g.key} className="border-b border-red-100">
                          <td className="py-1.5 px-2 text-red-900 font-medium">{g.employee_name}</td>
                          <td className="py-1.5 px-2 text-red-700 font-mono">{g.payroll_period || g.annomes}</td>
                          <td className="py-1.5 px-2 text-red-700">{g.payroll_type || "—"}</td>
                          <td className="py-1.5 px-2 text-red-700 font-mono">{g.comprobante || "—"}</td>
                          <td className="py-1.5 px-2 text-right text-red-700">{g.debe.toFixed(2)}</td>
                          <td className="py-1.5 px-2 text-right text-red-700">{g.haber.toFixed(2)}</td>
                          <td className="py-1.5 px-2 text-right text-red-900 font-bold">{g.diferencia > 0 ? "+" : ""}{g.diferencia.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabla de asientos */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b bg-slate-50/50 py-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              {filteredFinal.length} asiento(s) encontrado(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
            ) : filteredFinal.length === 0 ? (
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
                    {filteredFinal.map(asiento => {
                     const emp = employees.find(e => e.id === asiento.employee_id);
                     const cuentaInfo = cuentas.find(c => c.cuenta === asiento.cuenta);
                     const estConfig = ESTADO_CONFIG[asiento.estado_migracion] || ESTADO_CONFIG.Pendiente;
                      const EstIcon = estConfig.icon;
                      const isMigrating = migratingIds.has(asiento.id);
                      return (
                        <tr key={asiento.id} className={`hover:bg-slate-50 transition-colors ${asiento.anulado ? "opacity-50" : ""}`}>
                          <td className="px-3 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{asiento.annomes}</td>
                          <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                            {asiento.subdiario
                              ? (() => { const cat = subdiariosCatalog.find(s => s.codigo === asiento.subdiario); return cat ? <span title={cat.descripcion}>{asiento.subdiario} <span className="text-xs text-slate-400">{cat.nombre_breve}</span></span> : asiento.subdiario; })()
                              : "—"}
                          </td>
                          <td className="px-3 py-3 font-medium text-indigo-700 whitespace-nowrap">{asiento.comprobante}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className="font-mono text-xs font-semibold text-slate-800">{asiento.cuenta}</span>
                            {cuentaInfo && (
                              <p className="text-xs text-slate-500 max-w-[160px] truncate" title={cuentaInfo.descripcion}>{cuentaInfo.descripcion}</p>
                            )}
                          </td>
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
            tipoAnexos={tipoAnexos}
            onClose={() => setSelectedAsiento(null)}
          />
        )}

        {/* Modal vista previa de envío a Starsoft */}
        {previewStarsoft && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-bold text-slate-900">Vista previa de envío a Starsoft</h2>
                <button onClick={() => { setPreviewStarsoft(null); setPreviewPendientes([]); }} className="text-slate-400 hover:text-slate-700 text-xl font-bold">✕</button>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500">Total de registros</p>
                    <p className="text-lg font-bold text-slate-900">{previewStarsoft.total}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500">URL destino</p>
                    <p className="text-sm font-mono text-slate-900 break-all">{previewStarsoft.destination || "—"}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Payload</p>
                  <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono text-slate-800 overflow-auto max-h-[55vh]">
{JSON.stringify(previewStarsoft.payload, null, 2)}
                  </pre>
                </div>
              </div>
              <div className="flex gap-3 p-6 border-t">
                <Button variant="outline" className="flex-1" onClick={() => { setPreviewStarsoft(null); setPreviewPendientes([]); }}>
                  Cancelar
                </Button>
                <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={handleConfirmarMigracionStarsoft}>
                  Confirmar y migrar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de progreso durante la migración a Starsoft */}
        {migrandoStarsoft && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="relative">
                  <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                  <Send className="w-4 h-4 text-indigo-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-slate-900">Migrando asientos a Starsoft</h2>
                  <p className="text-slate-500 text-sm">
                    Procesando <span className="font-bold text-indigo-600">{progresoMigracion.procesados}</span> de {progresoMigracion.total} asiento(s)…
                  </p>
                </div>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden mb-4">
                <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progresoMigracion.total ? (progresoMigracion.procesados / progresoMigracion.total) * 100 : 0}%` }} />
              </div>
              <div className="border border-slate-200 rounded-xl max-h-72 overflow-y-auto divide-y divide-slate-100">
                {progresoMigracion.logs.length === 0 ? (
                  <p className="p-4 text-sm text-slate-400 text-center">Iniciando proceso…</p>
                ) : progresoMigracion.logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-3 text-sm">
                    <div className="shrink-0 mt-0.5">
                      {log.estado === "procesando" && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
                      {log.estado === "ok" && <CheckCircle className="w-4 h-4 text-green-600" />}
                      {log.estado === "error" && <XCircle className="w-4 h-4 text-red-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">
                        <span className="text-indigo-700">{log.comprobante || "—"}</span>
                        {" · "}
                        <span className="font-mono text-xs text-slate-600">{log.cuenta || ""}</span>
                      </p>
                      <p className={`text-xs ${log.estado === "error" ? "text-red-600" : log.estado === "ok" ? "text-green-600" : "text-slate-500"}`}>
                        {log.mensaje}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-3 text-center">No cierre esta ventana hasta que finalice el proceso.</p>
            </div>
          </div>
        )}

        {/* Modal resumen migración Starsoft */}
        {modalMigracion && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={() => setModalMigracion(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-bold text-slate-900">Resumen de Migración a Starsoft</h2>
                <button onClick={() => setModalMigracion(null)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">✕</button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-4 bg-slate-50 rounded-xl">
                    <p className="text-3xl font-bold text-slate-900">{modalMigracion.total}</p>
                    <p className="text-xs text-slate-500 mt-1">Total enviados</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-xl">
                    <p className="text-3xl font-bold text-green-600">{modalMigracion.migrados}</p>
                    <p className="text-xs text-green-600 mt-1">Migrados</p>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-xl">
                    <p className="text-3xl font-bold text-red-600">{modalMigracion.errores}</p>
                    <p className="text-xs text-red-600 mt-1">Errores</p>
                  </div>
                </div>
                {modalMigracion.detalle_errores?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">Detalle de errores:</h3>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {modalMigracion.detalle_errores.map((err, i) => (
                        <div key={i} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm font-semibold text-red-800">
                            {err.comprobante || "—"} · {err.cuenta || ""}
                          </p>
                          <p className="text-xs text-red-600 mt-0.5">{err.error}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => setModalMigracion(null)}>
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetalleAsientoModal({ asiento, employees, cuentas, tipoAnexos, onClose }) {
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
            <Row label="Código" value={asiento.cuenta} />
            <Row label="Descripción" value={cuenta?.descripcion} />
            <Row label="Tipo" value={cuenta?.tipo} />
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
            <Row label="Tipo Anexo" value={asiento.tipo_anexo ? `${asiento.tipo_anexo}${(() => { const ta = tipoAnexos?.find(t => t.codigo_tipo_anexo === asiento.tipo_anexo); return ta ? ` — ${ta.descripcion}` : ""; })()}` : null} />
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
