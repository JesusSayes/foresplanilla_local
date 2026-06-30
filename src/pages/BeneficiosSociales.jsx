import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign, Users, Calendar, Search, AlertCircle, ChevronRight,
  TrendingUp, Calculator, FileText, Info, Eye, ArrowLeft, Database
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { safePayrollNumber, formatMoney } from "@/lib/payrollUtils";
import { toast } from "sonner";

// ─── Lógica de cálculo de beneficios sociales (Ley peruana) ─────────────────

/**
 * Calcula el promedio de remuneración computable para CTS/Gratificación
 * usando los 6 meses del semestre correspondiente.
 * @param {number} month - mes actual (1-12)
 * @param {number} year - año actual
 * @param {Array} historial - registros de HistorialRemunerativo + boletas convertidas
 * @returns {object} { promedio, meses, registrosMes }
 */
function calcularPromedioSemestre(month, year, historial) {
  // CTS: semestres Nov-Abr (depósito mayo) y May-Oct (depósito nov)
  // Gratificación: ene-jun (julio) y jul-dic (diciembre)
  let semestre = [];
  if (month <= 4 || month === 5) {
    // Semestre nov año anterior - abr año actual
    semestre = [
      { year: year - 1, month: 11 }, { year: year - 1, month: 12 },
      { year, month: 1 }, { year, month: 2 }, { year, month: 3 }, { year, month: 4 },
    ];
  } else if (month <= 10 || month === 11) {
    // Semestre may - oct año actual
    semestre = [
      { year, month: 5 }, { year, month: 6 }, { year, month: 7 },
      { year, month: 8 }, { year, month: 9 }, { year, month: 10 },
    ];
  } else {
    // Diciembre: semestre jul-dic
    semestre = [
      { year, month: 7 }, { year, month: 8 }, { year, month: 9 },
      { year, month: 10 }, { year, month: 11 }, { year, month: 12 },
    ];
  }

  const registrosMes = semestre.map(s => {
    const reg = historial.find(h => h.year === s.year && h.month === s.month);
    return { ...s, remuneracion: reg?.total_remuneration || 0, encontrado: !!reg };
  });

  const mesesConData = registrosMes.filter(r => r.encontrado);
  const promedio = mesesConData.length > 0
    ? mesesConData.reduce((s, r) => s + r.remuneracion, 0) / mesesConData.length
    : 0;

  return { promedio, semestre, registrosMes, mesesConData: mesesConData.length };
}

/**
 * Calcula antigüedad en meses y años desde la fecha de ingreso.
 */
function calcularAntiguedad(hireDate) {
  if (!hireDate) return { years: 0, months: 0, totalMonths: 0 };
  const hire = new Date(hireDate.split("T")[0]);
  const today = new Date();
  let years = today.getFullYear() - hire.getFullYear();
  let months = today.getMonth() - hire.getMonth();
  if (months < 0) { years--; months += 12; }
  const totalMonths = years * 12 + months;
  return { years, months, totalMonths };
}

/**
 * Calcula CTS según ley peruana (D.S. 001-97-TR y modificatorias).
 * CTS = (Rem. computable / 12) * meses_semestre + (1/6 de gratificación / 12) * meses
 * Simplificado: CTS semestral = rem_computable / 2 * (días_semestre / 360)
 */
function calcularCTS(promedio, diasSemestre = 180) {
  // CTS mensual = 1/12 de la remuneración computable
  // Semestral = rem_computable * (días / 360)
  const ctsSemestral = promedio * (diasSemestre / 360);
  return Math.round(ctsSemestral * 100) / 100;
}

/**
 * Calcula Gratificación según ley peruana (Ley 27735).
 * Gratificación = rem_computable * (meses_semestre / 6)
 */
function calcularGratificacion(promedio, mesesSemestre = 6) {
  const gratif = promedio * (mesesSemestre / 6);
  return Math.round(gratif * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function BeneficiosSociales() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [calcYear, setCalcYear] = useState(new Date().getFullYear());
  const [calcMonth, setCalcMonth] = useState(new Date().getMonth() + 1);

  const queryClient = useQueryClient();

  const { data: employees = [] } = useQuery({
    queryKey: ["empBenef"],
    queryFn: () => base44.entities.Employee.filter({ status: "Activo" }),
  });

  const { data: allPayslips = [] } = useQuery({
    queryKey: ["payslipsBenef"],
    queryFn: () => base44.entities.Payslip.list("-created_date", 5000),
  });

  const { data: historialDB = [] } = useQuery({
    queryKey: ["historialRemunerativo"],
    queryFn: () => base44.entities.HistorialRemunerativo.list("-year", 5000),
  });

  const { data: rmvData } = useQuery({
    queryKey: ["rmvBenef"],
    queryFn: async () => {
      const r = await base44.entities.RMV.filter({ is_active: true }, "-effective_date");
      return r.length > 0 ? r[0] : { amount: 1025 };
    },
  });

  const departments = [...new Set(employees.map(e => e.department_name).filter(Boolean))];

  // Construir historial consolidado por empleado (boletas del sistema + HistorialRemunerativo manual)
  const buildHistorialEmpleado = (employeeId) => {
    // Del sistema: boletas mensuales
    const boletasMensuales = allPayslips.filter(p =>
      p.employee_id === employeeId && p.payroll_type === "Mensual"
    ).map(p => ({
      year: p.year,
      month: p.month,
      period_label: p.period,
      total_remuneration: safePayrollNumber(p.total_income),
      base_salary: safePayrollNumber(p.base_salary),
      worked_days: p.worked_days || 30,
      source: "Sistema",
    }));

    // Manuales / importados
    const manuales = historialDB.filter(h => h.employee_id === employeeId).map(h => ({
      ...h,
      source: h.source || "Manual",
    }));

    // Merge: prefiere registros manuales sobre boletas del sistema para mismo año/mes
    const merged = [...boletasMensuales];
    manuales.forEach(m => {
      const idx = merged.findIndex(b => b.year === m.year && b.month === m.month);
      if (idx >= 0) {
        merged[idx] = m; // manual sobreescribe boleta
      } else {
        merged.push(m);
      }
    });

    return merged.sort((a, b) => b.year - a.year || b.month - a.month);
  };

  // Calcular beneficios para un empleado
  const calcularBeneficios = (emp) => {
    const historial = buildHistorialEmpleado(emp.id);
    const { promedio, registrosMes, mesesConData, semestre } = calcularPromedioSemestre(calcMonth, calcYear, historial);
    const antiguedad = calcularAntiguedad(emp.hire_date);

    // Solo empleados con al menos 1 mes de servicio
    if (antiguedad.totalMonths < 1) {
      return { cts: 0, gratificacion: 0, promedio: 0, registrosMes, antiguedad, mesesConData, semestre };
    }

    // Ajustar meses del semestre según antigüedad
    const mesesEfectivos = Math.min(mesesConData || 6, 6);
    const cts = calcularCTS(promedio, mesesEfectivos * 30);
    const gratificacion = calcularGratificacion(promedio, mesesEfectivos);

    return { cts, gratificacion, promedio, registrosMes, antiguedad, mesesConData, semestre };
  };

  const filteredEmployees = employees.filter(e => {
    const matchSearch = !searchTerm ||
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.document_number?.includes(searchTerm);
    const matchDept = filterDept === "all" || e.department_name === filterDept;
    return matchSearch && matchDept;
  });

  // Totales
  const totales = useMemo(() => {
    let totalCTS = 0, totalGratif = 0;
    filteredEmployees.forEach(emp => {
      const b = calcularBeneficios(emp);
      totalCTS += b.cts;
      totalGratif += b.gratificacion;
    });
    return { totalCTS, totalGratif };
  }, [filteredEmployees, calcMonth, calcYear, allPayslips, historialDB]);

  // --- Vista detalle empleado ---
  if (selectedEmployee) {
    const emp = selectedEmployee;
    const historial = buildHistorialEmpleado(emp.id);
    const beneficios = calcularBeneficios(emp);
    const antiguedad = beneficios.antiguedad;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="outline" onClick={() => setSelectedEmployee(null)}>
              <ArrowLeft className="w-4 h-4 mr-2" />Volver
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{emp.first_name} {emp.last_name}</h1>
              <p className="text-slate-500 text-sm">{emp.position} · {emp.department_name} · Ingreso: {emp.hire_date ? new Date(emp.hire_date + "T00:00:00").toLocaleDateString("es-PE") : "—"}</p>
            </div>
          </div>

          {/* Resumen de beneficios */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Antigüedad", value: `${antiguedad.years}a ${antiguedad.months}m`, color: "indigo" },
              { label: "Prom. Computable", value: formatMoney(beneficios.promedio), color: "blue" },
              { label: `CTS Semestral`, value: formatMoney(beneficios.cts), color: "teal" },
              { label: `Gratificación`, value: formatMoney(beneficios.gratificacion), color: "pink" },
            ].map(({ label, value, color }) => (
              <Card key={label} className="border-0 shadow-lg">
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500 mb-1">{label}</p>
                  <p className={`text-xl font-bold text-${color}-700`}>{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Semestre de cálculo */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Calculator className="w-4 h-4 text-indigo-600" />
                Semestre de cálculo — {beneficios.registrosMes?.length || 0} meses
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {(beneficios.registrosMes || []).map(r => (
                  <div key={`${r.year}-${r.month}`}
                    className={`p-3 rounded-lg text-center text-xs ${r.encontrado ? "bg-green-50 border border-green-200" : "bg-slate-100 border border-slate-200"}`}>
                    <p className="font-semibold text-slate-700">{format(new Date(r.year, r.month - 1), "MMM yy", { locale: es })}</p>
                    {r.encontrado
                      ? <p className="text-green-700 font-bold mt-1">{formatMoney(r.remuneracion)}</p>
                      : <p className="text-slate-400 mt-1">Sin dato</p>
                    }
                  </div>
                ))}
              </div>
              {beneficios.mesesConData < 6 && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-800">
                    Solo se encontraron {beneficios.mesesConData} de 6 meses del semestre.
                    Registra el historial remunerativo para obtener un cálculo más preciso.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Historial de remuneraciones */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Database className="w-4 h-4 text-slate-500" />
                  Historial Remunerativo ({historial.length} períodos)
                </CardTitle>
                <Link to={createPageUrl("HistorialRemunerativo")}>
                  <Button size="sm" variant="outline">
                    <FileText className="w-4 h-4 mr-1" />Gestionar Historial
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      {["Período", "Sueldo Base", "Asig. Familiar", "Otros", "Rem. Computable", "Días", "Fuente"].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historial.slice(0, 24).map((h, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2 font-medium capitalize">{h.period_label || format(new Date(h.year, h.month - 1), "MMMM yyyy", { locale: es })}</td>
                        <td className="px-4 py-2">{formatMoney(h.base_salary || 0)}</td>
                        <td className="px-4 py-2">{formatMoney(h.family_allowance || 0)}</td>
                        <td className="px-4 py-2">{formatMoney(h.other_regular_income || 0)}</td>
                        <td className="px-4 py-2 font-bold text-indigo-700">{formatMoney(h.total_remuneration || 0)}</td>
                        <td className="px-4 py-2 text-center">{h.worked_days || 30}</td>
                        <td className="px-4 py-2">
                          <Badge className={h.source === "Sistema" ? "bg-blue-100 text-blue-700" : h.source === "Importado" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700"} >
                            {h.source || "Manual"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {historial.length === 0 && (
                  <div className="py-12 text-center text-slate-400">
                    <Database className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>Sin historial registrado. Agrega registros manuales para períodos anteriores al sistema.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // --- Vista principal ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2 flex items-center gap-3">
              <TrendingUp className="w-9 h-9 text-teal-600" />
              Beneficios Sociales
            </h1>
            <p className="text-slate-600 text-lg">Cálculo automático de CTS y Gratificaciones según ley peruana</p>
          </div>
          <div className="flex gap-2">
            <Link to={createPageUrl("HistorialRemunerativo")}>
              <Button variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                <Database className="w-4 h-4 mr-2" />Historial Remunerativo
              </Button>
            </Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Empleados activos", value: filteredEmployees.length, color: "blue", icon: Users },
            { label: "Semestre de cálculo", value: `${format(new Date(calcYear, calcMonth - 1), "MMM yyyy", { locale: es })}`, color: "indigo", icon: Calendar },
            { label: "CTS Total Estimada", value: formatMoney(totales.totalCTS), color: "teal", icon: DollarSign },
            { label: "Gratif. Total Estimada", value: formatMoney(totales.totalGratif), color: "pink", icon: DollarSign },
          ].map(({ label, value, color, icon: Icon }) => (
            <Card key={label} className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 text-${color}-600`} />
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
                <p className={`text-xl font-bold text-${color}-700`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Info ley */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl mb-6 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">Base legal del cálculo (Ley peruana)</p>
            <p><strong>CTS:</strong> D.S. 001-97-TR — 1/12 de rem. computable por mes. Depósitos semestrales: mayo (nov-abr) y noviembre (may-oct).</p>
            <p><strong>Gratificación:</strong> Ley 27735 — equivalente a 1 sueldo completo por semestre. Julio (ene-jun) y diciembre (jul-dic). Incluye bonificación extraordinaria del 9%.</p>
          </div>
        </div>

        {/* Filtros y selector de período */}
        <Card className="border-0 shadow-lg mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input placeholder="Buscar empleado..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterDept} onValueChange={setFilterDept}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Departamento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los depto.</SelectItem>
                  {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500 whitespace-nowrap">Período de cálculo:</span>
                <Select value={String(calcMonth)} onValueChange={v => setCalcMonth(parseInt(v))}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {format(new Date(2024, i), "MMMM", { locale: es })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(calcYear)} onValueChange={v => setCalcYear(parseInt(v))}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2022, 2023, 2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabla de empleados con beneficios */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b bg-slate-50/50">
            <CardTitle className="text-lg font-bold">{filteredEmployees.length} empleados</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    {["Empleado", "Área", "Ingreso", "Antigüedad", "Meses historial", "Prom. Computable", "CTS Semestral", "Gratificación", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployees.map(emp => {
                    const b = calcularBeneficios(emp);
                    const historialCount = buildHistorialEmpleado(emp.id).length;
                    return (
                      <tr key={emp.id} className="hover:bg-indigo-50/20">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {emp.first_name[0]}{emp.last_name[0]}
                            </div>
                            <span className="font-medium text-slate-900 whitespace-nowrap">{emp.first_name} {emp.last_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{emp.department_name || "—"}</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{emp.hire_date ? new Date(emp.hire_date + "T00:00:00").toLocaleDateString("es-PE") : "—"}</td>
                        <td className="px-4 py-3">
                          <Badge className="bg-indigo-100 text-indigo-700 text-xs">
                            {b.antiguedad.years}a {b.antiguedad.months}m
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold ${historialCount >= 6 ? "text-green-600" : historialCount > 0 ? "text-amber-600" : "text-red-500"}`}>
                            {historialCount}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{formatMoney(b.promedio)}</td>
                        <td className="px-4 py-3 font-bold text-teal-700">{formatMoney(b.cts)}</td>
                        <td className="px-4 py-3 font-bold text-pink-700">{formatMoney(b.gratificacion)}</td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="outline" onClick={() => setSelectedEmployee(emp)}>
                            <Eye className="w-3.5 h-3.5 mr-1" />Ver
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 font-bold text-slate-900">TOTALES</td>
                    <td className="px-4 py-3 font-bold text-teal-700 text-base">{formatMoney(totales.totalCTS)}</td>
                    <td className="px-4 py-3 font-bold text-pink-700 text-base">{formatMoney(totales.totalGratif)}</td>
                    <td></td>
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