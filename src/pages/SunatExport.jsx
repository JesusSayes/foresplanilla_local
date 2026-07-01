import React, { useState } from "react";
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, FileText, AlertCircle, CheckCircle, Info } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import * as XLSX from "xlsx";
import { safePayrollNumber } from "@/lib/payrollUtils";
import { toast } from "sonner";

// ─── Helpers SUNAT ───────────────────────────────────────────────────────────

/** Padea a la derecha con espacios hasta la longitud indicada */
const rpad = (val, len) => String(val ?? "").slice(0, len).padEnd(len, " ");
/** Padea a la izquierda con ceros */
const lpad0 = (val, len) => String(val ?? "").slice(0, len).padStart(len, "0");
/** Limpia caracteres especiales que no acepta SUNAT */
const clean = (str) => String(str ?? "").replace(/[|"'\n\r\t]/g, " ").trim();

/** Formatea fecha DD/MM/YYYY o vacío */
const fmtDate = (d) => {
  if (!d) return "";
  const datePart = d instanceof Date
    ? d.toISOString().split("T")[0]
    : String(d).split("T")[0];
  const dt = new Date(datePart + "T00:00:00");
  if (isNaN(dt)) return "";
  return `${String(dt.getDate()).padStart(2,"0")}/${String(dt.getMonth()+1).padStart(2,"0")}/${dt.getFullYear()}`;
};

/** Tipo de trabajador SUNAT: 01-10 */
const tipoTrabajador = (emp) => {
  if (emp.contract_type === "Prácticas") return "04"; // Practicante
  if (emp.worker_type === "Directivo") return "06";
  if (emp.worker_type === "Obrero") return "02";
  if (emp.contract_type === "SNP") return "09";
  return "01"; // Empleado (default)
};

/** Régimen pensionario: 1=SNP/ONP, 2=AFP */
const regimenPensionario = (emp) => {
  if (emp.pension_system === "AFP") return "2";
  if (emp.pension_system === "ONP") return "1";
  return "0";
};

/** Código AFP SUNAT (simplificado, los más comunes en Perú) */
const afpCodigo = (afpName) => {
  const map = {
    "habitat": "06", "integra": "02", "prima": "03", "profuturo": "04",
    "horizonte": "01", "union": "05",
  };
  const key = String(afpName ?? "").toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (key.includes(k)) return v;
  }
  return "00";
};

/** Tipo de documento SUNAT */
const tipoDoc = (type) => {
  const map = { "DNI": "01", "CE": "04", "Pasaporte": "07", "CPP": "06" };
  return map[type] || "01";
};

// ─── Generador T-Registro ─────────────────────────────────────────────────────

/**
 * Genera las filas del T-Registro (formato plano de texto o xlsx).
 * Campos según "Instrucciones para el llenado de las planillas electrónicas"
 * Versión 3.x de SUNAT/MTPE.
 */
function buildTRegistroRows(employees, afps) {
  return asArray(employees).map(emp => {
    const afpRecord = afps.find(a => a.id === emp.afp_id);
    const afpNombre = afpRecord?.name || emp.afp_id || "";

    return {
      // Datos del trabajador
      "Tipo Doc. Identidad": tipoDoc(emp.document_type),
      "Nro. Doc. Identidad": clean(emp.document_number),
      "Apellido Paterno": clean(emp.last_name?.split(" ")[0] || ""),
      "Apellido Materno": clean(emp.last_name?.split(" ").slice(1).join(" ") || ""),
      "Nombres": clean(emp.first_name),
      "Fecha Nacimiento": fmtDate(emp.birth_date),
      "Sexo": emp.gender === "M" ? "1" : "2",
      "Nacionalidad": "PE",
      // Datos laborales
      "Tipo Trabajador": tipoTrabajador(emp),
      "Tipo Contrato": emp.contract_type === "Indeterminado" ? "01" :
                       emp.contract_type === "Plazo Fijo" ? "02" :
                       emp.contract_type === "Part-Time" ? "03" :
                       emp.contract_type === "Prácticas" ? "13" :
                       emp.contract_type === "SNP" ? "09" : "01",
      "Fecha Ingreso": fmtDate(emp.hire_date),
      "Fecha Cese": emp.status === "Cesado" ? fmtDate(emp.termination_date) : "",
      "Situación Especial": "",
      // Remuneración
      "Remuneración Básica": safePayrollNumber(emp.base_salary).toFixed(2),
      "Asig. Familiar": emp.family_allowance > 0 ? "1" : "0",
      // Previsional
      "Sistema Pensionario": regimenPensionario(emp),
      "Código AFP": emp.pension_system === "AFP" ? afpCodigo(afpNombre) : "",
      "CUSPP": emp.pension_system === "AFP" ? clean(emp.cuspp) : "",
      "Fecha Afiliación AFP": emp.pension_system === "AFP" ? fmtDate(emp.afp_affiliation_date) : "",
      // Seguro de Salud
      "Régimen Salud": emp.contract_type === "Prácticas" ? "2" : "1", // 1=ESSALUD, 2=EPS
      // Datos adicionales
      "Nro. Autorización MTPE": "",
      "Código Situación": emp.status === "Activo" ? "01" :
                           emp.status === "Suspendido" ? "05" : "02",
      "Correo Electrónico Trabajo": clean(emp.work_email),
      // Identificador interno (referencia)
      "Código Empleado": clean(emp.employee_code),
    };
  });
}

// ─── Generador PLAME ──────────────────────────────────────────────────────────

/**
 * Genera las filas de la PLAME (Planilla Mensual de Pagos).
 * Campos según esquema vigente de PDT Planilla Electrónica.
 */
function buildPlameRows(payslips, employees, selectedMonth, selectedYear) {
  const rows = [];

  for (const p of asArray(payslips)) {
    const emp = employees.find(e => e.id === p.employee_id);
    if (!emp) continue;

    const sueldo = safePayrollNumber(p.base_salary);
    const asigFam = safePayrollNumber(p.family_allowance);
    const heOrd25 = safePayrollNumber(p.overtime_pay) * 0.5; // simplificado
    const bonif = safePayrollNumber(p.bonuses);
    const otrosIng = safePayrollNumber(p.other_income);
    const totalIng = safePayrollNumber(p.total_income);

    const pension = safePayrollNumber(p.pension_deduction);
    const renta5 = safePayrollNumber(p.income_tax);
    const otrosDesc = safePayrollNumber(p.other_deductions);
    const totalDesc = safePayrollNumber(p.total_deductions);
    const neto = safePayrollNumber(p.net_pay);

    // Días
    const diasTrab = p.worked_days || 30;
    const diasNoTrab = Math.max(0, 30 - diasTrab);

    // Aportes empleador (referencial)
    const essaludBase = emp.contract_type === "Prácticas" ? 0 : sueldo + asigFam;
    const essalud = Math.round(essaludBase * 0.09 * 100) / 100;

    rows.push({
      // Identificación
      "Periodo": `${selectedYear}${String(selectedMonth).padStart(2,"0")}`,
      "Tipo Doc.": tipoDoc(emp.document_type),
      "Nro. Doc.": clean(emp.document_number),
      "Apellidos y Nombres": clean(`${emp.last_name} ${emp.first_name}`),
      // Condición laboral
      "Tipo Trabajador": tipoTrabajador(emp),
      "Tipo Contrato": emp.contract_type === "Indeterminado" ? "01" :
                       emp.contract_type === "Plazo Fijo" ? "02" :
                       emp.contract_type === "Part-Time" ? "03" :
                       emp.contract_type === "Prácticas" ? "13" : "01",
      "Días Trabajados": diasTrab,
      "Días No Laborados": diasNoTrab,
      // Ingresos
      "Rem. Básica": sueldo.toFixed(2),
      "Asig. Familiar": asigFam.toFixed(2),
      "HH.EE. 25%": heOrd25.toFixed(2),
      "Bonificaciones": bonif.toFixed(2),
      "Otros Ingresos": otrosIng.toFixed(2),
      "Total Ingresos": totalIng.toFixed(2),
      // Descuentos trabajador
      "AFP / ONP": pension.toFixed(2),
      "Imp. Renta 5ta": renta5.toFixed(2),
      "Otros Descuentos": otrosDesc.toFixed(2),
      "Total Descuentos": totalDesc.toFixed(2),
      "Neto a Pagar": neto.toFixed(2),
      // Aportes empleador
      "ESSALUD 9%": essalud.toFixed(2),
      // Previsional
      "Sistema Pensionario": regimenPensionario(emp),
      "CUSPP": emp.pension_system === "AFP" ? clean(emp.cuspp) : "",
      // Estado
      "Situación": emp.status === "Activo" ? "01" :
                   emp.status === "Suspendido" ? "05" : "02",
      // Referencia interna
      "Código Empleado": clean(emp.employee_code),
    });
  }

  return rows;
}

// ─── Exportadores ─────────────────────────────────────────────────────────────

const asArray = (value) => Array.isArray(value) ? value : [];

function exportToXLSX(rows, filename, sheetName = "Hoja1") {
  if (!rows || rows.length === 0) { toast.error("No hay datos para exportar"); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const colWidths = Object.keys(rows[0]).map(k => ({
    wch: Math.max(k.length, ...rows.map(r => String(r[k] ?? "").length)) + 2
  }));
  ws["!cols"] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
  toast.success("Archivo generado correctamente");
}

function exportToTXT(rows, filename, separator = "|") {
  if (!rows || rows.length === 0) { toast.error("No hay datos para exportar"); return; }
  const headers = Object.keys(rows[0]);
  const lines = rows.map(r => headers.map(h => String(r[h] ?? "")).join(separator));
  const content = lines.join("\r\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("Archivo TXT generado correctamente");
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function SunatExport() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [exportFormat, setExportFormat] = useState("xlsx");

  const { data: employeesData = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: () => entitiesAPI.Employee.filter({}),
  });

  const { data: payslipsData = [], isLoading: loadingPayslips } = useQuery({
    queryKey: ["payslips-sunat", selectedMonth, selectedYear],
    queryFn: () => entitiesAPI.Payslip.filter({ month: selectedMonth, year: selectedYear }),
  });

  const { data: afpsData = [] } = useQuery({
    queryKey: ["afps"],
    queryFn: () => entitiesAPI.AFP.list(),
  });

  const allEmployees = asArray(employeesData);
  const payslips = asArray(payslipsData);
  const afps = asArray(afpsData);
  const activeEmployees = allEmployees.filter(e => e.status === "Activo" || e.status === "Suspendido");
  const periodLabel = format(new Date(selectedYear, selectedMonth - 1), "MMMM yyyy", { locale: es });

  // Solo planillas Mensuales (o SNP) aprobadas/pagadas para PLAME
  const plamePayslips = payslips.filter(p =>
    (p.payroll_type === "Mensual" || p.payroll_type === "SNP") &&
    (p.status === "Aprobada" || p.status === "Pagada")
  );

  const tRegistroRows = buildTRegistroRows(activeEmployees, afps);
  const plameRows = buildPlameRows(plamePayslips, allEmployees, selectedMonth, selectedYear);

  const handleExportTRegistro = () => {
    const fname = `T-Registro_${selectedYear}${String(selectedMonth).padStart(2,"0")}`;
    if (exportFormat === "txt") exportToTXT(tRegistroRows, fname);
    else exportToXLSX(tRegistroRows, fname, "T-Registro");
  };

  const handleExportPlame = () => {
    if (plameRows.length === 0) {
      toast.error("No hay boletas Mensuales/SNP aprobadas o pagadas para este período");
      return;
    }
    const fname = `PLAME_${selectedYear}${String(selectedMonth).padStart(2,"0")}`;
    if (exportFormat === "txt") exportToTXT(plameRows, fname);
    else exportToXLSX(plameRows, fname, "PLAME");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-100 rounded-xl">
              <FileText className="w-6 h-6 text-red-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Exportar a SUNAT</h1>
          </div>
          <p className="text-slate-600 ml-14">Genera los archivos T-Registro y PLAME en el formato requerido por SUNAT / MTPE.</p>
        </div>

        {/* Controles de período */}
        <Card className="border-0 shadow-lg mb-6">
          <CardContent className="p-5">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="min-w-[130px]">
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Mes</Label>
                <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {format(new Date(2024, i), "MMMM", { locale: es })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[100px]">
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Año</Label>
                <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2023, 2024, 2025, 2026].map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[140px]">
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Formato de salida</Label>
                <Select value={exportFormat} onValueChange={setExportFormat}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                    <SelectItem value="txt">Texto plano (.txt)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumen del período */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{activeEmployees.length}</p>
            <p className="text-xs text-slate-500 mt-1">Trabajadores activos</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{payslips.length}</p>
            <p className="text-xs text-slate-500 mt-1">Boletas del período</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-indigo-600">{plameRows.length}</p>
            <p className="text-xs text-slate-500 mt-1">Filas PLAME listas</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{tRegistroRows.length}</p>
            <p className="text-xs text-slate-500 mt-1">Filas T-Registro</p>
          </div>
        </div>

        <Tabs defaultValue="tregistro">
          <TabsList className="mb-6">
            <TabsTrigger value="tregistro">T-Registro</TabsTrigger>
            <TabsTrigger value="plame">PLAME</TabsTrigger>
          </TabsList>

          {/* ── T-REGISTRO ── */}
          <TabsContent value="tregistro">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg font-bold">T-Registro — {periodLabel}</CardTitle>
                    <p className="text-sm text-slate-500 mt-1">
                      Registro de trabajadores activos (alta/baja) exigido por el Ministerio de Trabajo.
                    </p>
                  </div>
                  <Button onClick={handleExportTRegistro} className="bg-red-600 hover:bg-red-700 shrink-0">
                    <Download className="w-4 h-4 mr-2" />
                    Exportar T-Registro
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {/* Aviso informativo */}
                <div className="flex gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-6">
                  <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">¿Qué incluye el T-Registro?</p>
                    <ul className="list-disc ml-4 space-y-0.5 text-blue-700">
                      <li>Datos de identificación del trabajador (doc., nombres, nacimiento)</li>
                      <li>Tipo de trabajador y modalidad de contrato</li>
                      <li>Fechas de ingreso y cese</li>
                      <li>Sistema pensionario (AFP/ONP) y CUSPP</li>
                      <li>Situación laboral actual</li>
                    </ul>
                  </div>
                </div>

                {/* Validaciones */}
                <ValidationPanel employees={activeEmployees} type="tregistro" />

                {/* Preview tabla */}
                <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        {["Tipo Doc.", "Nro. Doc.", "Apellidos y Nombres", "Fecha Ingreso", "Sistema Pensionario", "Tipo Trabajador", "Situación"].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeEmployees.slice(0, 10).map(emp => (
                        <tr key={emp.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2">{tipoDoc(emp.document_type)}</td>
                          <td className="px-3 py-2 font-mono">{emp.document_number}</td>
                          <td className="px-3 py-2">{emp.last_name} {emp.first_name}</td>
                          <td className="px-3 py-2">{fmtDate(emp.hire_date)}</td>
                          <td className="px-3 py-2">
                            <Badge className={emp.pension_system === "AFP" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}>
                              {emp.pension_system || "—"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">{tipoTrabajador(emp)}</td>
                          <td className="px-3 py-2">
                            <Badge className={emp.status === "Activo" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>
                              {emp.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {activeEmployees.length > 10 && (
                    <p className="px-3 py-2 text-xs text-slate-500 bg-slate-50 border-t">
                      Mostrando 10 de {activeEmployees.length} trabajadores. El archivo exportado incluye todos.
                    </p>
                  )}
                  {activeEmployees.length === 0 && (
                    <div className="py-12 text-center text-slate-400 text-sm">No hay trabajadores activos registrados.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── PLAME ── */}
          <TabsContent value="plame">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg font-bold">PLAME — {periodLabel}</CardTitle>
                    <p className="text-sm text-slate-500 mt-1">
                      Planilla Mensual de Pagos. Requiere planillas Mensuales o SNP en estado Aprobada o Pagada.
                    </p>
                  </div>
                  <Button onClick={handleExportPlame} className="bg-red-600 hover:bg-red-700 shrink-0" disabled={plameRows.length === 0}>
                    <Download className="w-4 h-4 mr-2" />
                    Exportar PLAME
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {/* Aviso informativo */}
                <div className="flex gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-6">
                  <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">¿Qué incluye la PLAME?</p>
                    <ul className="list-disc ml-4 space-y-0.5 text-blue-700">
                      <li>Remuneraciones del período (básico, asignación familiar, H.E., bonificaciones)</li>
                      <li>Descuentos del trabajador (AFP/ONP, Renta 5ta categoría, otros)</li>
                      <li>Aporte ESSALUD 9% (empleador) — calculado automáticamente</li>
                      <li>Días trabajados y no laborados</li>
                      <li>Neto a pagar por trabajador</li>
                    </ul>
                  </div>
                </div>

                {/* Estado de planillas */}
                {loadingPayslips ? (
                  <div className="py-6 text-center text-slate-400">Cargando boletas...</div>
                ) : plameRows.length === 0 ? (
                  <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <p className="font-semibold">No hay planillas listas para exportar</p>
                      <p className="mt-1">Para exportar la PLAME debes tener planillas de tipo <strong>Mensual</strong> o <strong>SNP</strong> en estado <strong>Aprobada</strong> o <strong>Pagada</strong> para {periodLabel}.</p>
                      <p className="mt-1">Ve a <strong>Gestión de Planillas</strong>, genera la planilla mensual y apruébala.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 p-4 bg-green-50 border border-green-200 rounded-xl mb-6">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-green-800">
                      <p className="font-semibold">{plameRows.length} trabajador(es) listos para exportar</p>
                      <p className="mt-0.5">Planillas de {periodLabel} en estado Aprobada/Pagada.</p>
                    </div>
                  </div>
                )}

                {/* Preview tabla PLAME */}
                {plameRows.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          {["Tipo Doc.", "Nro. Doc.", "Apellidos y Nombres", "Días Trab.", "Total Ingresos", "AFP/ONP", "ESSALUD", "Neto a Pagar"].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {plameRows.slice(0, 10).map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2">{row["Tipo Doc."]}</td>
                            <td className="px-3 py-2 font-mono">{row["Nro. Doc."]}</td>
                            <td className="px-3 py-2">{row["Apellidos y Nombres"]}</td>
                            <td className="px-3 py-2 text-center">{row["Días Trabajados"]}</td>
                            <td className="px-3 py-2 text-right font-medium text-green-700">S/ {row["Total Ingresos"]}</td>
                            <td className="px-3 py-2 text-right text-red-600">S/ {row["AFP / ONP"]}</td>
                            <td className="px-3 py-2 text-right text-purple-600">S/ {row["ESSALUD 9%"]}</td>
                            <td className="px-3 py-2 text-right font-bold text-indigo-700">S/ {row["Neto a Pagar"]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {plameRows.length > 10 && (
                      <p className="px-3 py-2 text-xs text-slate-500 bg-slate-50 border-t">
                        Mostrando 10 de {plameRows.length} registros. El archivo exportado incluye todos.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Nota legal */}
        <div className="mt-6 p-4 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-500 flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p>Los archivos generados son una ayuda preparatoria. Verifique los datos en el PDT Planilla Electrónica / SUNAT Virtual antes de la declaración oficial. Los campos AFP, CUSPP y tipos de contrato deben estar correctamente configurados en cada ficha de empleado.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Panel de Validaciones ────────────────────────────────────────────────────

function ValidationPanel({ employees, type }) {
  const warnings = [];

  if (type === "tregistro") {
    const sinDoc = employees.filter(e => !e.document_number);
    const sinIngreso = employees.filter(e => !e.hire_date);
    const sinPension = employees.filter(e => !e.pension_system || e.pension_system === "Ninguno");
    const afpSinCuspp = employees.filter(e => e.pension_system === "AFP" && !e.cuspp);

    if (sinDoc.length) warnings.push({ level: "error", msg: `${sinDoc.length} trabajador(es) sin número de documento.` });
    if (sinIngreso.length) warnings.push({ level: "warn", msg: `${sinIngreso.length} trabajador(es) sin fecha de ingreso.` });
    if (sinPension.length) warnings.push({ level: "warn", msg: `${sinPension.length} trabajador(es) sin sistema pensionario definido.` });
    if (afpSinCuspp.length) warnings.push({ level: "warn", msg: `${afpSinCuspp.length} trabajador(es) con AFP pero sin CUSPP registrado.` });
  }

  if (!warnings.length) {
    return (
      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
        <CheckCircle className="w-4 h-4 shrink-0" />
        Validación correcta. Los datos de trabajadores están completos.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <div key={i} className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${
          w.level === "error"
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-amber-50 border-amber-200 text-amber-700"
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {w.msg}
        </div>
      ))}
    </div>
  );
}
