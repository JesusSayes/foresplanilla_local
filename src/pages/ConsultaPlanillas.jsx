import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, Users, DollarSign, Eye, Printer, ChevronRight,
  CheckCircle, Search, Calendar, ArrowLeft, Settings, PenTool,
  Loader2, Download
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import PayslipPreview from "../components/payroll/PayslipPreview";
import PlanillaCompletaView from "../components/payroll/PlanillaCompletaView";
import ConfigFirmantesModal from "../components/payroll/ConfigFirmantesModal";

const TIPO_COLORS = {
  Quincenal:    "bg-blue-100 text-blue-700 border-blue-200",
  Mensual:      "bg-green-100 text-green-700 border-green-200",
  Adicional:    "bg-purple-100 text-purple-700 border-purple-200",
  SNP:          "bg-orange-100 text-orange-700 border-orange-200",
  CTS:          "bg-teal-100 text-teal-700 border-teal-200",
  Gratificacion:"bg-pink-100 text-pink-700 border-pink-200",
};

const STATUS_COLORS = {
  Generada:  "bg-yellow-100 text-yellow-700",
  Calculada: "bg-yellow-100 text-yellow-700",
  Aprobada:  "bg-blue-100 text-blue-700",
  Pagada:    "bg-green-100 text-green-700",
  default:   "bg-slate-100 text-slate-700",
};

// Deriva el status consolidado del grupo a partir de sus boletas
const getGrupoStatus = (payslips) => {
  if (!payslips || payslips.length === 0) return "Calculada";
  if (payslips.every(p => p.status === "Pagada")) return "Pagada";
  if (payslips.every(p => p.status === "Aprobada" || p.status === "Pagada")) return "Aprobada";
  if (payslips.some(p => p.status === "Aprobada")) return "Aprobada";
  return "Calculada";
};

export default function ConsultaPlanillas() {
  const [employee, setEmployee] = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [firmantes, setFirmantes] = useState(null);

  // Filtros cabecera
  const [filterYear, setFilterYear]   = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterTipo, setFilterTipo]   = useState("all");
  const [searchTerm, setSearchTerm]   = useState("");

  // Vista activa
  const [selectedGroup, setSelectedGroup] = useState(null); // cabecera seleccionada
  const [previewPayslip, setPreviewPayslip] = useState(null); // boleta individual
  const [showPlanillaCompleta, setShowPlanillaCompleta] = useState(false);
  const [showConfigFirmantes, setShowConfigFirmantes] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(user => {
      base44.entities.Employee.filter({ work_email: user.email }).then(emps => {
        if (emps?.length > 0) setEmployee(emps[0]);
      });
    });
    base44.entities.CompanyInfo.filter({ is_active: true }).then(res => {
      if (res?.length > 0) {
        const ci = res[0];
        setCompanyInfo(ci);
        // Cargar firmantes guardados en CompanyInfo
        try {
          const gg = ci.firmante_gg ? JSON.parse(ci.firmante_gg) : null;
          const del = ci.firmante_delegado ? JSON.parse(ci.firmante_delegado) : null;
          if (gg || del) setFirmantes({ firmante_gg: gg, firmante_delegado: del });
        } catch (e) { /* noop */ }
      }
    });
  }, []);

  const { data: allPayslips = [], isLoading } = useQuery({
    queryKey: ["allPayslipsConsulta"],
    queryFn: () => base44.entities.Payslip.list("-created_date", 5000),
  });

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployeesConsulta"],
    queryFn: () => base44.entities.Employee.list("-created_date"),
  });

  // Agrupar boletas en cabeceras de planilla
  const grupos = React.useMemo(() => {
    const map = {};
    allPayslips.forEach(p => {
      const key = `${p.year}-${String(p.month).padStart(2,"0")}-${p.payroll_type}-${p.payroll_number || ""}`;
      if (!map[key]) {
        map[key] = {
          key,
          year: p.year,
          month: p.month,
          payroll_type: p.payroll_type,
          payroll_number: p.payroll_number || `${p.payroll_type}-${p.year}-${String(p.month).padStart(2,"0")}`,
          period: p.period || format(new Date(p.year, p.month - 1), "MMMM yyyy", { locale: es }),
          payslips: [],
        };
      }
      map[key].payslips.push(p);
    });
    // Calcular status consolidado para cada grupo
    Object.values(map).forEach(g => { g.status = getGrupoStatus(g.payslips); });
    return Object.values(map).sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      if (b.month !== a.month) return b.month - a.month;
      return a.payroll_type.localeCompare(b.payroll_type);
    });
  }, [allPayslips]);

  // Filtrar grupos
  const filteredGrupos = grupos.filter(g => {
    const matchYear  = g.year === filterYear;
    const matchMonth = filterMonth === "all" || g.month === parseInt(filterMonth);
    const matchTipo  = filterTipo  === "all" || g.payroll_type === filterTipo;
    const matchSearch = !searchTerm || g.period.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.payroll_number?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchYear && matchMonth && matchTipo && matchSearch;
  });

  // Estadísticas del año seleccionado
  const gruposAnio = grupos.filter(g => g.year === filterYear);
  const totalAnio  = gruposAnio.reduce((s, g) => s + g.payslips.reduce((ss, p) => ss + (p.net_pay || 0), 0), 0);
  const totalEmps  = new Set(gruposAnio.flatMap(g => g.payslips.map(p => p.employee_id))).size;

  const availableYears = [...new Set(allPayslips.map(p => p.year))].sort((a, b) => b - a);
  if (!availableYears.includes(new Date().getFullYear())) availableYears.unshift(new Date().getFullYear());

  const getGrupoStats = (g) => ({
    empleados:   g.payslips.length,
    totalIncome: g.payslips.reduce((s, p) => s + (p.total_income || 0), 0),
    totalDesc:   g.payslips.reduce((s, p) => s + (p.total_deductions || 0), 0),
    totalNeto:   g.payslips.reduce((s, p) => s + (p.net_pay || 0), 0),
  });

  // --- Si hay boleta individual seleccionada ---
  if (previewPayslip) {
    const emp = allEmployees.find(e => e.id === previewPayslip.employee_id);
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <Button variant="outline" onClick={() => setPreviewPayslip(null)}>
              <ArrowLeft className="w-4 h-4 mr-2" />Volver al Detalle
            </Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" />Imprimir Boleta
            </Button>
          </div>
          <PayslipPreview
            payslip={previewPayslip}
            employee={emp}
            companyInfo={companyInfo}
            firmantes={firmantes}
          />
        </div>
      </div>
    );
  }

  // --- Si hay planilla completa seleccionada ---
  if (showPlanillaCompleta && selectedGroup) {
    const payslipsGrupo = selectedGroup.payslips.map(p => ({
      payslip: p,
      employee: allEmployees.find(e => e.id === p.employee_id),
    })).filter(r => r.employee);
    return (
      <PlanillaCompletaView
        grupo={selectedGroup}
        payslips={payslipsGrupo}
        companyInfo={companyInfo}
        firmantes={firmantes}
        onBack={() => setShowPlanillaCompleta(false)}
      />
    );
  }

  // --- Detalle de un grupo ---
  if (selectedGroup) {
    const stats = getGrupoStats(selectedGroup);
    const payslipsConEmp = selectedGroup.payslips.map(p => ({
      p,
      emp: allEmployees.find(e => e.id === p.employee_id),
    })).filter(r => r.emp);

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Header detalle */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-start gap-4">
              <Button variant="outline" onClick={() => setSelectedGroup(null)}>
                <ArrowLeft className="w-4 h-4 mr-2" />Volver
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">
                  {selectedGroup.period}
                </h1>
                <div className="flex items-center gap-3 mt-2">
                  <Badge className={TIPO_COLORS[selectedGroup.payroll_type] || "bg-slate-100 text-slate-700"}>
                    {selectedGroup.payroll_type}
                  </Badge>
                  <Badge className={STATUS_COLORS[selectedGroup.status] || "bg-slate-100"}>
                    {selectedGroup.status}
                  </Badge>
                  <span className="text-sm text-slate-500">N° {selectedGroup.payroll_number}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                onClick={() => setShowPlanillaCompleta(true)}
              >
                <Eye className="w-4 h-4 mr-2" />Ver Planilla Completa
              </Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={() => { setShowPlanillaCompleta(true); setTimeout(() => window.print(), 800); }}
              >
                <Printer className="w-4 h-4 mr-2" />Imprimir Planilla
              </Button>
            </div>
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Empleados incluidos", value: stats.empleados, icon: Users, color: "blue" },
              { label: "Total Ingresos", value: `S/ ${stats.totalIncome.toFixed(2)}`, icon: DollarSign, color: "green" },
              { label: "Total Descuentos", value: `S/ ${stats.totalDesc.toFixed(2)}`, icon: DollarSign, color: "red" },
              { label: "Total Neto a Pagar", value: `S/ ${stats.totalNeto.toFixed(2)}`, icon: DollarSign, color: "indigo", big: true },
            ].map(({ label, value, icon: Icon, color, big }) => (
              <Card key={label} className="border-0 shadow-lg">
                <CardContent className="p-5">
                  <div className={`inline-flex p-2 rounded-lg bg-${color}-100 mb-3`}>
                    <Icon className={`w-5 h-5 text-${color}-600`} />
                  </div>
                  <p className="text-xs text-slate-500 mb-1">{label}</p>
                  <p className={`font-bold text-slate-900 ${big ? "text-2xl text-indigo-600" : "text-lg"}`}>{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabla de boletas */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-500" />
                Detalle por Empleado — {stats.empleados} persona(s)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      {["#","Código","Empleado","Cargo","Área","Días","Ingresos","Descuentos","Neto a Pagar","Estado","Acciones"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payslipsConEmp.map(({ p, emp }, idx) => (
                      <tr key={p.id} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="px-4 py-3 text-slate-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{emp.employee_code}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {emp.first_name[0]}{emp.last_name[0]}
                            </div>
                            <span className="font-medium text-slate-900 whitespace-nowrap">{emp.first_name} {emp.last_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{emp.position || "—"}</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{emp.department_name || "—"}</td>
                        <td className="px-4 py-3 text-center font-medium">{p.worked_days}</td>
                        <td className="px-4 py-3 text-green-700 font-semibold">S/ {(p.total_income || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-red-600 font-semibold">S/ {(p.total_deductions || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 font-bold text-indigo-700 text-base">S/ {(p.net_pay || 0).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <Badge className={STATUS_COLORS[p.status] || "bg-slate-100"}>{p.status}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50 text-xs"
                              onClick={() => setPreviewPayslip(p)}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />Ver
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-slate-600 hover:bg-slate-50 text-xs"
                              onClick={() => { setPreviewPayslip(p); setTimeout(() => window.print(), 600); }}
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-indigo-50 border-t-2 border-indigo-200">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 font-bold text-slate-900 text-sm">TOTALES</td>
                      <td className="px-4 py-3 font-bold text-center">{payslipsConEmp.reduce((s, {p}) => s + (p.worked_days || 0), 0)}</td>
                      <td className="px-4 py-3 font-bold text-green-700">S/ {stats.totalIncome.toFixed(2)}</td>
                      <td className="px-4 py-3 font-bold text-red-600">S/ {stats.totalDesc.toFixed(2)}</td>
                      <td className="px-4 py-3 font-bold text-indigo-700 text-base">S/ {stats.totalNeto.toFixed(2)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // --- Vista principal: lista de cabeceras ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2 flex items-center gap-3">
              <FileText className="w-9 h-9 text-indigo-600" />
              Consulta de Planillas
            </h1>
            <p className="text-slate-600 text-lg">Visualiza, imprime y firma planillas por período</p>
          </div>
          <Button
            variant="outline"
            className="border-slate-300 hover:bg-slate-50 gap-2"
            onClick={() => setShowConfigFirmantes(true)}
          >
            <Settings className="w-4 h-4" />Configurar Firmantes
          </Button>
        </div>

        {/* KPIs del año */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: `Planillas ${filterYear}`, value: gruposAnio.length, icon: FileText, color: "indigo" },
            { label: "Empleados únicos", value: totalEmps, icon: Users, color: "blue" },
            { label: `Total neto ${filterYear}`, value: `S/ ${totalAnio.toFixed(2)}`, icon: DollarSign, color: "green" },
            { label: "Tipos de planilla", value: [...new Set(gruposAnio.map(g => g.payroll_type))].length, icon: Calendar, color: "purple" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="border-0 shadow-lg">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className={`p-2 bg-${color}-100 rounded-lg shrink-0`}>
                    <Icon className={`w-4 h-4 text-${color}-600`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xl font-bold text-slate-900 leading-tight">{value}</div>
                    <p className="text-slate-600 text-xs truncate">{label}</p>
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
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input placeholder="Buscar período o número..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Select value={String(filterYear)} onValueChange={v => setFilterYear(parseInt(v))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Todos los meses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los meses</SelectItem>
                  {Array.from({length: 12}, (_, i) => (
                    <SelectItem key={i+1} value={String(i+1)}>
                      {format(new Date(2024, i), "MMMM", { locale: es })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {["Quincenal","Mensual","Adicional","SNP","CTS","Gratificacion"].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-slate-500 ml-auto">{filteredGrupos.length} planilla(s) encontrada(s)</span>
            </div>
          </CardContent>
        </Card>

        {/* Lista de planillas (cabecera) */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : filteredGrupos.length === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="py-20 text-center">
              <FileText className="w-16 h-16 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 text-lg">No se encontraron planillas para los filtros seleccionados</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredGrupos.map(g => {
              const stats = getGrupoStats(g);
              return (
                <Card
                  key={g.key}
                  className="border-0 shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer group"
                  onClick={() => setSelectedGroup(g)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      {/* Info */}
                      <div className="flex items-center gap-5 flex-1">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex flex-col items-center justify-center text-white shrink-0">
                          <span className="text-xs font-bold leading-none">
                            {format(new Date(g.year, g.month - 1), "MMM", { locale: es }).toUpperCase()}
                          </span>
                          <span className="text-lg font-bold leading-none">{g.year}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-bold text-slate-900 capitalize">{g.period}</h3>
                            <Badge className={TIPO_COLORS[g.payroll_type] || "bg-slate-100 text-slate-700"}>
                              {g.payroll_type}
                            </Badge>
                            <Badge className={STATUS_COLORS[g.status] || "bg-slate-100"}>
                              {g.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-500">N° {g.payroll_number}</p>
                        </div>
                      </div>

                      {/* Métricas */}
                      <div className="hidden md:grid grid-cols-4 gap-6 text-center mx-6">
                        <div>
                          <p className="text-xs text-slate-400 mb-0.5">Empleados</p>
                          <div className="flex items-center justify-center gap-1">
                            <Users className="w-3.5 h-3.5 text-blue-500" />
                            <span className="font-bold text-slate-900">{stats.empleados}</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 mb-0.5">Ingresos</p>
                          <p className="font-semibold text-green-600 text-sm">S/ {stats.totalIncome.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 mb-0.5">Descuentos</p>
                          <p className="font-semibold text-red-500 text-sm">S/ {stats.totalDesc.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 mb-0.5">Neto Total</p>
                          <p className="font-bold text-indigo-700 text-base">S/ {stats.totalNeto.toFixed(2)}</p>
                        </div>
                      </div>

                      {/* Acciones rápidas */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="hidden sm:flex"
                          onClick={e => { e.stopPropagation(); setSelectedGroup(g); setShowPlanillaCompleta(true); }}
                        >
                          <Eye className="w-4 h-4 mr-1" />Ver
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="hidden sm:flex"
                          onClick={e => { e.stopPropagation(); setSelectedGroup(g); setShowPlanillaCompleta(true); setTimeout(() => window.print(), 800); }}
                        >
                          <Printer className="w-4 h-4 mr-1" />Imprimir
                        </Button>
                        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal configuración de firmantes */}
      {showConfigFirmantes && (
        <ConfigFirmantesModal
          companyInfo={companyInfo}
          onClose={() => setShowConfigFirmantes(false)}
          onSave={async (data) => {
            setFirmantes(data);
            setShowConfigFirmantes(false);
            toast.success("Firmantes configurados correctamente");
            // Persistir en CompanyInfo para que se recarguen automáticamente
            if (companyInfo?.id) {
              await base44.entities.CompanyInfo.update(companyInfo.id, {
                firmante_gg: JSON.stringify(data.firmante_gg || {}),
                firmante_delegado: JSON.stringify(data.firmante_delegado || {}),
              });
            }
          }}
        />
      )}
    </div>
  );
}