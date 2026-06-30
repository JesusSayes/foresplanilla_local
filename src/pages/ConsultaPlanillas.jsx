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
  Loader2, Download, BookOpen, RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import PayslipPreview from "../components/payroll/PayslipPreview";
import PlanillaCompletaView from "../components/payroll/PlanillaCompletaView";
import ConfigFirmantesModal from "../components/payroll/ConfigFirmantesModal";
import { safePayrollNumber, formatMoney } from "@/lib/payrollUtils";

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
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [previewPayslip, setPreviewPayslip] = useState(null);
  const [showPlanillaCompleta, setShowPlanillaCompleta] = useState(false);
  const [showConfigFirmantes, setShowConfigFirmantes] = useState(false);
  const [generatingAsiento, setGeneratingAsiento] = useState(null); // payroll_number en proceso

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

  const { data: allAsientos = [] } = useQuery({
    queryKey: ["asientosContablesConsulta"],
    queryFn: () => base44.entities.AsientoContable.list("-fecha_registro", 5000),
  });

  const { data: costCenterAssignments = [] } = useQuery({
    queryKey: ["ccAssignmentsConsulta"],
    queryFn: () => base44.entities.CostCenterAssignment.list("-created_date"),
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ["costCentersConsulta"],
    queryFn: () => base44.entities.CostCenter.list("code"),
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
  const totalAnio  = gruposAnio.reduce((s, g) => s + g.payslips.reduce((ss, p) => ss + safePayrollNumber(p.net_pay), 0), 0);
  const totalEmps  = new Set(gruposAnio.flatMap(g => g.payslips.map(p => p.employee_id))).size;

  const availableYears = [...new Set(allPayslips.map(p => p.year))].sort((a, b) => b - a);
  if (!availableYears.includes(new Date().getFullYear())) availableYears.unshift(new Date().getFullYear());

  const getGrupoStats = (g) => ({
    empleados:   g.payslips.length,
    totalIncome: g.payslips.reduce((s, p) => s + safePayrollNumber(p.total_income), 0),
    totalDesc:   g.payslips.reduce((s, p) => s + safePayrollNumber(p.total_deductions), 0),
    totalNeto:   g.payslips.reduce((s, p) => s + safePayrollNumber(p.net_pay), 0),
  });

  // Verifica si un grupo ya tiene asientos generados
  const getGrupoAsientoStatus = (grupo) => {
    const existing = allAsientos.filter(
      a => a.payroll_period === grupo.period && a.payroll_type === grupo.payroll_type &&
        (a.origen === "Planilla" || a.origen === "Otro")
    );
    if (existing.length > 0) return "Generado";
    return null;
  };

  // Genera o actualiza asientos contables agrupados por centro de costo
  // Para SNP: genera un asiento individual por cada trabajador (Recibo de Honorarios)
  const handleGenerarAsiento = async (grupo) => {
    setGeneratingAsiento(grupo.key);
    try {
      const period = grupo.period;
      const payrollType = grupo.payroll_type;
      const isSNP = payrollType === "SNP";
      const annomes = `${grupo.year}${String(grupo.month).padStart(2, "0")}`;
      const fechaDoc = format(new Date(grupo.year, grupo.month - 1, 1), "yyyy-MM-dd");
      const fechaRegistro = format(new Date(), "yyyy-MM-dd");
      const comprobante = grupo.payroll_number || `${isSNP ? "RH" : "PL"}-${annomes}`;

      // Eliminar asientos anteriores de esta planilla para actualizar
      const existing = allAsientos.filter(
        a => a.payroll_period === period && a.payroll_type === payrollType &&
          (a.origen === "Planilla" || (isSNP && a.origen === "Otro"))
      );
      for (const a of existing) {
        await base44.entities.AsientoContable.delete(a.id);
      }

      const asientosToCreate = [];

      if (isSNP) {
        // ── SNP: un asiento por persona (Recibo de Honorarios) ──────────────
        // Estructura de cadena de conexión del sistema contable externo
        for (const p of grupo.payslips) {
          const emp = allEmployees.find(e => e.id === p.employee_id);
          if (!emp) continue;

          // Centro de costo del trabajador
          let assignment = costCenterAssignments.find(
            a => a.assignment_type === "Empleado" && a.employee_id === emp.id && a.is_active
          );
          if (!assignment && emp.department_name) {
            assignment = costCenterAssignments.find(
              a => a.assignment_type === "Departamento" && a.department_name === emp.department_name && a.is_active
            );
          }
          const cc = assignment?.cost_center_id
            ? costCenters.find(c => c.id === assignment.cost_center_id)
            : null;
          const ccCode = cc?.code || "";
          const codAnexo = emp.document_number || "";
          const empName = `${emp.first_name} ${emp.last_name}`;
          const importeBruto = Math.round((p.total_income || 0) * 100) / 100;
          const importeRet   = Math.round((p.total_deductions || 0) * 100) / 100;
          const importeNeto  = Math.round((p.net_pay || 0) * 100) / 100;
          const glosa    = `SNP ${period}`;
          const glosaEmp = `RH ${empName} - ${period}`;
          const nroDoc   = `RH-${annomes}-${emp.document_number}`;

          // Campos comunes a todos los movimientos de este trabajador
          const base = {
            annomes,
            subdiario: "07",           // Subdiario Honorarios
            comprobante,
            fecha_doc: fechaDoc,
            fecha_vencimiento: fechaDoc,
            fecha_registro: fechaRegistro,
            tipo_doc: "RH",            // Recibo de Honorarios
            nro_doc: nroDoc,
            tipo_anexo: "P",           // Proveedor (contratista)
            cod_anexo: codAnexo,
            conversion_tc: "M",
            moneda: "PEN",
            tc: 1,
            glosa,
            centro_costos: ccCode,
            centro_costos_id: assignment?.cost_center_id || "",
            employee_id: emp.id,
            payroll_period: period,
            payroll_type: payrollType,
            payslip_id: p.id,
            origen: "Otro",            // Distingue de planilla regular
            estado_migracion: "Pendiente",
            anulado: false,
          };

          // DEBE: 6320000 Servicios de Terceros (honorarios brutos)
          asientosToCreate.push({
            ...base,
            cuenta: "6320000",
            importe: importeBruto,
            importe_soles: importeBruto,
            debe_haber: "D",
            glosa_mov: `${glosaEmp} - Honorario bruto`,
          });

          // HABER: 4212100 Honorarios por pagar (neto)
          asientosToCreate.push({
            ...base,
            cuenta: "4212100",
            importe: importeNeto,
            importe_soles: importeNeto,
            debe_haber: "H",
            glosa_mov: `${glosaEmp} - Neto a pagar`,
          });

          // HABER: 4017100 Retención de 4ta categoría (si hay descuentos)
          if (importeRet > 0) {
            asientosToCreate.push({
              ...base,
              cuenta: "4017100",
              importe: importeRet,
              importe_soles: importeRet,
              debe_haber: "H",
              glosa_mov: `${glosaEmp} - Retención 4ta categoría`,
            });
          }
        }

      } else {
        // ── PLANILLA REGULAR: agrupado por centro de costo ──────────────────
        const ccMap = {};

        for (const p of grupo.payslips) {
          const emp = allEmployees.find(e => e.id === p.employee_id);
          if (!emp) continue;

          let assignment = costCenterAssignments.find(
            a => a.assignment_type === "Empleado" && a.employee_id === emp.id && a.is_active
          );
          if (!assignment && emp.department_name) {
            assignment = costCenterAssignments.find(
              a => a.assignment_type === "Departamento" && a.department_name === emp.department_name && a.is_active
            );
          }

          const ccId = assignment?.cost_center_id || "sin_cc";
          const cc = ccId !== "sin_cc" ? costCenters.find(c => c.id === ccId) : null;

          if (!ccMap[ccId]) {
            ccMap[ccId] = { cc, ccId, totalIncome: 0, totalDeductions: 0, totalNeto: 0, employeeCount: 0 };
          }
          ccMap[ccId].totalIncome += p.total_income || 0;
          ccMap[ccId].totalDeductions += p.total_deductions || 0;
          ccMap[ccId].totalNeto += p.net_pay || 0;
          ccMap[ccId].employeeCount += 1;
        }

        for (const data of Object.values(ccMap)) {
          const ccCode = data.cc?.code || "S/CC";
          const ccName = data.cc?.name || "Sin Centro de Costo";
          const glosa  = `${payrollType} - ${period}`;
          const glosaCC = `${glosa} | ${ccCode} - ${ccName} (${data.employeeCount} emp.)`;

          const base = {
            annomes,
            subdiario: "08",
            comprobante,
            fecha_doc: fechaDoc,
            fecha_registro: fechaRegistro,
            tipo_doc: "PL",
            nro_doc: comprobante,
            tipo_anexo: "T",           // Trabajador
            conversion_tc: "M",
            moneda: "PEN",
            tc: 1,
            glosa,
            centro_costos: ccCode,
            centro_costos_id: data.ccId !== "sin_cc" ? data.ccId : "",
            origen: "Planilla",
            payroll_period: period,
            payroll_type: payrollType,
            estado_migracion: "Pendiente",
            anulado: false,
          };

          asientosToCreate.push({
            ...base,
            cuenta: "6210000",
            importe: Math.round(data.totalIncome * 100) / 100,
            importe_soles: Math.round(data.totalIncome * 100) / 100,
            debe_haber: "D",
            glosa_mov: glosaCC,
          });

          asientosToCreate.push({
            ...base,
            cuenta: "4110000",
            importe: Math.round(data.totalNeto * 100) / 100,
            importe_soles: Math.round(data.totalNeto * 100) / 100,
            debe_haber: "H",
            glosa_mov: `${glosaCC} - Neto a pagar`,
          });

          if (data.totalDeductions > 0) {
            asientosToCreate.push({
              ...base,
              cuenta: "4030000",
              importe: Math.round(data.totalDeductions * 100) / 100,
              importe_soles: Math.round(data.totalDeductions * 100) / 100,
              debe_haber: "H",
              glosa_mov: `${glosaCC} - Descuentos/Tributos`,
            });
          }
        }
      }

      await base44.entities.AsientoContable.bulkCreate(asientosToCreate);
      queryClient.invalidateQueries(["asientosContablesConsulta"]);
      const label = existing.length > 0 ? "Asientos actualizados" : "Asientos generados";
      toast.success(`${label}: ${asientosToCreate.length} líneas${isSNP ? ` (${grupo.payslips.length} Recibos de Honorarios)` : ""}`);
    } catch (error) {
      toast.error("Error al generar asientos contables");
      console.error(error);
    } finally {
      setGeneratingAsiento(null);
    }
  };

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Empleados incluidos", value: stats.empleados, icon: Users, color: "blue" },
              { label: "Total Ingresos", value: formatMoney(stats.totalIncome), icon: DollarSign, color: "green" },
              { label: "Total Descuentos", value: formatMoney(stats.totalDesc), icon: DollarSign, color: "red" },
              { label: "Total Neto a Pagar", value: formatMoney(stats.totalNeto), icon: DollarSign, color: "indigo" },
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
                      {["#","DNI","Empleado","Cargo","Área","Días","Ingresos","Descuentos","Neto a Pagar","Estado","Acciones"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payslipsConEmp.map(({ p, emp }, idx) => (
                      <tr key={p.id} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="px-4 py-3 text-slate-400 text-xs">{idx + 1}</td>
                         <td className="px-4 py-3 font-mono text-xs text-slate-700">{emp.document_type} {emp.document_number}</td>
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
                        <td className="px-4 py-3 text-green-700 font-semibold">{formatMoney(p.total_income)}</td>
                        <td className="px-4 py-3 text-red-600 font-semibold">{formatMoney(p.total_deductions)}</td>
                        <td className="px-4 py-3 font-bold text-indigo-700 text-base">{formatMoney(p.net_pay)}</td>
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
                      <td className="px-4 py-3 font-bold text-green-700">{formatMoney(stats.totalIncome)}</td>
                      <td className="px-4 py-3 font-bold text-red-600">{formatMoney(stats.totalDesc)}</td>
                      <td className="px-4 py-3 font-bold text-indigo-700 text-base">{formatMoney(stats.totalNeto)}</td>
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

  // --- Imprimir todas las boletas de un grupo de un solo golpe ---
  const handlePrintAllBoletas = (grupo) => {
    const ci = companyInfo || { company_name: "Empresa", ruc: "00000000000", address: "" };
    const logoHtml = ci.logo_url
      ? `<img src="${ci.logo_url}" alt="Logo" style="width:48px;height:48px;object-fit:contain;background:white;border-radius:6px;padding:3px;" />`
      : `<div style="width:48px;height:48px;background:#4f46e5;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-size:18px;">🏢</div>`;

    const fmt = (v) => safePayrollNumber(v).toFixed(2);

    const boletasHTML = grupo.payslips.map(p => {
      const emp = allEmployees.find(e => e.id === p.employee_id);
      if (!emp) return "";

      const firmanteGG  = firmantes?.firmante_gg;
      const firmanteD   = firmantes?.firmante_delegado;

      const incomeRows = [
        `<tr><td>Remuneración Básica</td><td>S/ ${fmt(p.base_salary)}</td></tr>`,
        p.family_allowance > 0 ? `<tr><td>Asignación Familiar</td><td>S/ ${fmt(p.family_allowance)}</td></tr>` : "",
        p.overtime_pay > 0 ? `<tr><td>Horas Extras</td><td>S/ ${fmt(p.overtime_pay)}</td></tr>` : "",
        p.bonuses > 0 ? `<tr><td>Bonificaciones</td><td>S/ ${fmt(p.bonuses)}</td></tr>` : "",
        p.commissions > 0 ? `<tr><td>Comisiones</td><td>S/ ${fmt(p.commissions)}</td></tr>` : "",
        p.other_income > 0 ? `<tr><td>Otros Ingresos</td><td>S/ ${fmt(p.other_income)}</td></tr>` : "",
      ].filter(Boolean).join("");

      const deductRows = [
        p.pension_deduction > 0 ? `<tr><td>AFP/ONP</td><td>S/ ${fmt(p.pension_deduction)}</td></tr>` : "",
        p.health_insurance > 0 ? `<tr><td>Seguro de Salud</td><td>S/ ${fmt(p.health_insurance)}</td></tr>` : "",
        p.income_tax > 0 ? `<tr><td>Impuesto 5ta Cat.</td><td>S/ ${fmt(p.income_tax)}</td></tr>` : "",
        p.tardiness_discount > 0 ? `<tr><td>Desc. Tardanzas</td><td>S/ ${fmt(p.tardiness_discount)}</td></tr>` : "",
        p.absence_discount > 0 ? `<tr><td>Desc. Inasistencias</td><td>S/ ${fmt(p.absence_discount)}</td></tr>` : "",
        p.advance_deduction > 0 ? `<tr><td>Adelanto Quincenal</td><td>S/ ${fmt(p.advance_deduction)}</td></tr>` : "",
        p.loan_deduction > 0 ? `<tr><td>Préstamos</td><td>S/ ${fmt(p.loan_deduction)}</td></tr>` : "",
        p.other_deductions > 0 ? `<tr><td>Otros Descuentos</td><td>S/ ${fmt(p.other_deductions)}</td></tr>` : "",
      ].filter(Boolean).join("");

      return `
        <div class="boleta">
          <div class="header">
            <div class="header-left">
              ${logoHtml}
              <div>
                <div class="company-name">${ci.company_name}</div>
                <div class="company-sub">RUC: ${ci.ruc}</div>
                <div class="company-sub">${ci.address || ""}</div>
              </div>
            </div>
            <div class="header-right">
              <div class="boleta-title">BOLETA DE PAGO</div>
              <div class="boleta-period">${p.period || ""}</div>
              <span class="tipo-badge">${p.payroll_type}</span>
            </div>
          </div>
          <div class="body">
            <div class="section-title">Información del Trabajador</div>
            <div class="grid2">
              <div><span class="lbl">Nombres y Apellidos:</span><span class="val">${emp.first_name} ${emp.last_name}</span></div>
              <div><span class="lbl">DNI:</span><span class="val">${emp.document_type || ""} ${emp.document_number || ""}</span></div>
              <div><span class="lbl">Cargo:</span><span class="val">${emp.position || "—"}</span></div>
              <div><span class="lbl">Área/Depto:</span><span class="val">${emp.department_name || "—"}</span></div>
              <div><span class="lbl">Tipo Trabajador:</span><span class="val">${emp.worker_type || "Empleado"}</span></div>
            </div>
            <div class="metrics">
              <div class="metric"><span class="mlbl">Días trabajados</span><span class="mval">${p.worked_days || 0}</span></div>
              <div class="metric"><span class="mlbl">Horas extras</span><span class="mval">${p.overtime_hours || 0}</span></div>
              <div class="metric"><span class="mlbl">Sistema pensiones</span><span class="mval">${emp.pension_system || "N/A"}</span></div>
            </div>
            <div class="two-cols">
              <div class="col">
                <div class="col-title green">INGRESOS</div>
                <table class="items-table">
                  <tbody>${incomeRows || '<tr><td colspan="2" style="color:#94a3b8;">Sin ingresos</td></tr>'}</tbody>
                  <tfoot><tr class="total-row green"><td>TOTAL INGRESOS</td><td>S/ ${fmt(p.total_income)}</td></tr></tfoot>
                </table>
              </div>
              <div class="col">
                <div class="col-title red">DESCUENTOS</div>
                <table class="items-table">
                  <tbody>${deductRows || '<tr><td colspan="2" style="color:#94a3b8;">Sin descuentos</td></tr>'}</tbody>
                  <tfoot><tr class="total-row red"><td>TOTAL DESCUENTOS</td><td>S/ ${fmt(p.total_deductions)}</td></tr></tfoot>
                </table>
              </div>
            </div>
            <div class="neto-box">
              <div>
                <div class="neto-label">NETO A PAGAR</div>
                <div class="neto-amount">S/ ${fmt(p.net_pay)}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:8pt;color:#64748b;">Fecha de pago:</div>
                <div style="font-size:9pt;font-weight:600;">${p.payment_date || "—"}</div>
              </div>
            </div>
            ${(firmanteGG || firmanteD) ? `
            <div class="firmantes">
              ${firmanteGG ? `<div class="firmante">${firmanteGG.signature_url ? `<img src="${firmanteGG.signature_url}" style="height:36px;object-fit:contain;" />` : '<div style="height:36px;"></div>'}<div class="firma-line"></div><div class="firma-name">${firmanteGG.full_name || ""}</div><div class="firma-role">${firmanteGG.position || "Gerente General"}</div></div>` : ""}
              ${firmanteD ? `<div class="firmante">${firmanteD.signature_url ? `<img src="${firmanteD.signature_url}" style="height:36px;object-fit:contain;" />` : '<div style="height:36px;"></div>'}<div class="firma-line"></div><div class="firma-name">${firmanteD.full_name || ""}</div><div class="firma-role">${firmanteD.position || "Delegado"}</div></div>` : ""}
            </div>` : ""}
            <div class="footer-note">Documento generado automáticamente — Para consultas, contacte a Recursos Humanos</div>
          </div>
        </div>
      `;
    }).join("");

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Boletas ${grupo.period} - ${grupo.payroll_type}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, sans-serif; font-size: 9pt; color: #1e293b; margin: 0; }
  .boleta { page-break-after: always; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 10px; }
  .boleta:last-child { page-break-after: auto; }
  .header { background: linear-gradient(135deg,#4f46e5,#2563eb); color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; }
  .header-left { display: flex; align-items: center; gap: 10px; }
  .company-name { font-size: 12pt; font-weight: 700; }
  .company-sub { font-size: 7.5pt; color: #c7d2fe; }
  .header-right { text-align: right; }
  .boleta-title { font-size: 13pt; font-weight: 700; }
  .boleta-period { font-size: 8.5pt; color: #c7d2fe; }
  .tipo-badge { display: inline-block; background: white; color: #4f46e5; padding: 1px 8px; border-radius: 10px; font-size: 7.5pt; font-weight: 700; margin-top: 3px; }
  .body { padding: 12px 16px; }
  .section-title { font-size: 9pt; font-weight: 700; color: #0f172a; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 6px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 12px; font-size: 8pt; margin-bottom: 8px; }
  .lbl { color: #64748b; margin-right: 4px; }
  .val { font-weight: 600; }
  .metrics { display: flex; gap: 10px; margin-bottom: 8px; }
  .metric { flex: 1; text-align: center; background: #f8fafc; border-radius: 5px; padding: 5px 4px; }
  .mlbl { display: block; font-size: 7pt; color: #64748b; }
  .mval { display: block; font-size: 11pt; font-weight: 700; color: #1d4ed8; }
  .two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; }
  .col-title { font-size: 8.5pt; font-weight: 700; border-bottom: 1.5px solid; padding-bottom: 3px; margin-bottom: 5px; }
  .col-title.green { color: #15803d; border-color: #bbf7d0; }
  .col-title.red { color: #dc2626; border-color: #fecaca; }
  .items-table { width: 100%; font-size: 8pt; border-collapse: collapse; }
  .items-table td { padding: 1.5px 0; }
  .items-table td:last-child { text-align: right; font-weight: 600; }
  .total-row td { font-weight: 700; border-top: 1px solid #e2e8f0; padding-top: 3px; font-size: 8.5pt; }
  .total-row.green td { color: #15803d; }
  .total-row.red td { color: #dc2626; }
  .neto-box { background: linear-gradient(135deg,#eef2ff,#dbeafe); border: 1.5px solid #c7d2fe; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .neto-label { font-size: 8pt; color: #64748b; }
  .neto-amount { font-size: 18pt; font-weight: 700; color: #4338ca; }
  .firmantes { display: flex; gap: 30px; justify-content: center; margin: 8px 0; }
  .firmante { text-align: center; flex: 1; max-width: 160px; }
  .firma-line { border-top: 1px solid #94a3b8; margin-top: 4px; margin-bottom: 2px; }
  .firma-name { font-size: 8pt; font-weight: 700; }
  .firma-role { font-size: 7.5pt; color: #64748b; }
  .footer-note { text-align: center; font-size: 7pt; color: #94a3b8; border-top: 1px dashed #e2e8f0; padding-top: 5px; margin-top: 5px; }
</style>
</head>
<body>${boletasHTML}
<script>window.onload=function(){window.print();}</script>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) { toast.error("Permite las ventanas emergentes para imprimir."); return; }
    win.document.write(html);
    win.document.close();
    toast.success(`Preparando ${grupo.payslips.length} boleta(s) para imprimir…`);
  };

  // --- Vista principal: lista de cabeceras ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-[1600px] mx-auto px-4 py-8">

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
            { label: `Total neto ${filterYear}`, value: formatMoney(totalAnio), icon: DollarSign, color: "green" },
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

        {/* Lista de planillas — scroll horizontal único en este bloque */}
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
          /* Contenedor con scroll horizontal SOLO aquí, no afecta header ni filtros */
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="space-y-3" style={{ minWidth: "980px" }}>
              {filteredGrupos.map(g => {
                const stats = getGrupoStats(g);
                const asientoStatus = getGrupoAsientoStatus(g);
                return (
                  <Card
                    key={g.key}
                    className="border-0 shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer group overflow-hidden"
                    onClick={() => setSelectedGroup(g)}
                  >
                    <CardContent className="p-0">
                      {/* Fila única, se expande al ancho disponible, sin scroll propio */}
                      <div className="flex items-stretch w-full min-h-[76px]">

                        {/* Col 1 — Fecha + badges: ancho fijo razonable */}
                        <div className="flex items-center gap-3 px-4 py-3 w-[230px] shrink-0">
                          <div className="w-[46px] h-[46px] rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex flex-col items-center justify-center text-white shrink-0">
                            <span className="text-[9px] font-bold leading-none uppercase">
                              {format(new Date(g.year, g.month - 1), "MMM", { locale: es })}
                            </span>
                            <span className="text-sm font-bold leading-none">{g.year}</span>
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-slate-900 capitalize leading-tight truncate">{g.period}</h3>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              <Badge className={`text-[10px] px-1.5 py-0 ${TIPO_COLORS[g.payroll_type] || "bg-slate-100 text-slate-700"}`}>
                                {g.payroll_type}
                              </Badge>
                              <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[g.status] || "bg-slate-100"}`}>
                                {g.status}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate">N° {g.payroll_number}</p>
                          </div>
                        </div>

                        <div className="w-px bg-slate-100 my-3 shrink-0" />

                        {/* Col 2 — Empleados: compacto */}
                        <div className="flex flex-col items-center justify-center px-2 py-3 w-[76px] shrink-0">
                          <p className="text-[10px] text-slate-400 mb-0.5 whitespace-nowrap">Empleados</p>
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3 text-blue-500" />
                            <span className="font-bold text-slate-900 text-sm">{stats.empleados}</span>
                          </div>
                        </div>

                        <div className="w-px bg-slate-100 my-3 shrink-0" />

                        {/* Col 3 — Ingresos */}
                        <div className="flex flex-col items-end justify-center px-3 py-3 w-[120px] shrink-0">
                          <p className="text-[10px] text-slate-400 mb-0.5">Ingresos</p>
                          <p className="font-semibold text-slate-700 text-xs whitespace-nowrap">{formatMoney(stats.totalIncome)}</p>
                        </div>

                        <div className="w-px bg-slate-100 my-3 shrink-0" />

                        {/* Col 4 — Descuentos */}
                        <div className="flex flex-col items-end justify-center px-3 py-3 w-[120px] shrink-0">
                          <p className="text-[10px] text-slate-400 mb-0.5">Descuentos</p>
                          <p className="font-semibold text-red-500 text-xs whitespace-nowrap">{formatMoney(stats.totalDesc)}</p>
                        </div>

                        <div className="w-px bg-slate-100 my-3 shrink-0" />

                        {/* Col 5 — Neto Total: crece para llenar espacio restante */}
                        <div className="flex flex-col items-end justify-center px-3 py-3 min-w-[120px] flex-1">
                          <p className="text-[10px] text-slate-400 mb-0.5">Neto Total</p>
                          <p className="font-bold text-indigo-700 text-sm whitespace-nowrap">{formatMoney(stats.totalNeto)}</p>
                        </div>

                        <div className="w-px bg-slate-100 my-3 shrink-0" />

                        {/* Col 6 — Ver / Imprimir / Boletas: ancho justo para los 3 botones */}
                        <div className="flex items-center justify-center gap-1.5 px-3 py-3 w-[196px] shrink-0" onClick={e => e.stopPropagation()}>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs whitespace-nowrap"
                            onClick={e => { e.stopPropagation(); setSelectedGroup(g); setShowPlanillaCompleta(true); }}>
                            <Eye className="w-3 h-3 mr-1" />Ver
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs whitespace-nowrap"
                            onClick={e => { e.stopPropagation(); setSelectedGroup(g); setShowPlanillaCompleta(true); setTimeout(() => window.print(), 800); }}>
                            <Printer className="w-3 h-3 mr-1" />Imprimir
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs whitespace-nowrap text-purple-700 border-purple-200 hover:bg-purple-50"
                            onClick={e => { e.stopPropagation(); handlePrintAllBoletas(g); }}>
                            <Printer className="w-3 h-3 mr-1" />Boletas
                          </Button>
                        </div>

                        <div className="w-px bg-slate-100 my-3 shrink-0" />

                        {/* Col 7 — Generar Asiento: ancho fijo, centrado, vacío si Quincenal */}
                        <div className="flex items-center justify-center px-3 py-3 w-[170px] shrink-0" onClick={e => e.stopPropagation()}>
                          {g.payroll_type !== "Quincenal" ? (
                            <div className="flex flex-col items-stretch gap-1 w-full">
                              {asientoStatus && (
                                <span className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                  <CheckCircle className="w-2.5 h-2.5" />Asiento generado
                                </span>
                              )}
                              <Button
                                size="sm"
                                className={`h-8 text-xs whitespace-nowrap w-full ${asientoStatus ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
                                disabled={generatingAsiento === g.key}
                                onClick={e => { e.stopPropagation(); handleGenerarAsiento(g); }}
                              >
                                {generatingAsiento === g.key
                                  ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                  : <BookOpen className="w-3 h-3 mr-1" />
                                }
                                {asientoStatus ? "Actualizar Asiento" : "Generar Asiento"}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-slate-200 text-sm">—</span>
                          )}
                        </div>

                        {/* Flecha */}
                        <div className="flex items-center justify-center px-2 shrink-0">
                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                        </div>

                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
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