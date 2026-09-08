import React, { useMemo } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, PieChart as PieIcon, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const CHART_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981",
  "#06b6d4", "#3b82f6", "#ef4444", "#84cc16", "#f97316",
  "#a855f7", "#14b8a6", "#64748b",
];

const formatMoney = (v) =>
  "S/ " + Number(v || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const monthLabel = (yyyymm) => {
  const [y, m] = yyyymm.split("-");
  return format(new Date(Number(y), Number(m) - 1, 1), "MMM yy", { locale: es });
};

export default function PayrollCharts({ payslips = [], employees = [], costCenters = [], costCenterAssignments = [] }) {
  // --- Evolución del gasto en nómina mensual (últimos 12 meses) ---
  const evolutionData = useMemo(() => {
    const map = {};
    (payslips || []).forEach(p => {
      if (!p.year || !p.month) return;
      const key = `${p.year}-${String(p.month).padStart(2, "0")}`;
      if (!map[key]) map[key] = { period: key, neto: 0, ingresos: 0, descuentos: 0 };
      map[key].neto += Number(p.net_pay) || 0;
      map[key].ingresos += Number(p.total_income) || 0;
      map[key].descuentos += Number(p.total_deductions) || 0;
    });
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([key, v]) => ({
        ...v,
        label: monthLabel(key),
        neto: Math.round(v.neto),
        ingresos: Math.round(v.ingresos),
        descuentos: Math.round(v.descuentos),
      }));
  }, [payslips]);

  // --- Distribución por centros de costo (mes actual) ---
  const costCenterData = useMemo(() => {
    const now = new Date();
    const cy = now.getFullYear();
    const cm = now.getMonth() + 1;
    const monthPayslips = (payslips || []).filter(p => p.year === cy && p.month === cm);

    // Índice empleado → centro de costo
    const empCC = {};
    (costCenterAssignments || []).forEach(a => {
      if (a.assignment_type === "Empleado" && a.is_active && a.employee_id) {
        (empCC[a.employee_id] ||= []).push(a);
      }
    });
    // Respaldo por departamento
    const deptCC = {};
    (costCenterAssignments || []).forEach(a => {
      if (a.assignment_type === "Departamento" && a.is_active && a.department_name) {
        (deptCC[a.department_name] ||= []).push(a);
      }
    });

    const ccMap = {};
    (costCenters || []).forEach(c => { ccMap[c.id] = c; });

    const totals = {};
    let sinCC = 0;
    monthPayslips.forEach(p => {
      const emp = employees.find(e => e.id === p.employee_id);
      const assignments = empCC[p.employee_id] || deptCC[emp?.department_name] || [];
      const netPay = Number(p.net_pay) || 0;
      let allocated = 0;
      assignments.forEach(a => {
        const cc = ccMap[a.cost_center_id];
        if (!cc) return;
        const portion = netPay * (Number(a.percentage) || 0) / 100;
        const name = `${cc.code || ""} - ${cc.name || ""}`.trim();
        totals[name] = (totals[name] || 0) + portion;
        allocated += portion;
      });
      sinCC += Math.max(0, netPay - allocated);
    });
    const arr = Object.entries(totals)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
    if (sinCC > 0) arr.push({ name: "Sin centro de costo", value: Math.round(sinCC) });
    return arr;
  }, [payslips, employees, costCenters, costCenterAssignments]);

  const totalNetoMes = costCenterData.reduce((s, d) => s + d.value, 0);
  const totalNetoEvolucion = evolutionData.reduce((s, d) => s + d.neto, 0);
  const hasEvolution = evolutionData.length > 0;
  const hasCostCenter = costCenterData.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
      {/* Evolución mensual */}
      <Card className="border-0 shadow-lg lg:col-span-3">
        <CardHeader className="border-b bg-slate-50/50">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              Evolución del Gasto en Nómina
            </CardTitle>
            <Badge className="bg-indigo-100 text-indigo-700">
              {formatMoney(totalNetoEvolucion)} acumulado
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {hasEvolution ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={evolutionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNeto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="colorIng" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis tickFormatter={(v) => formatMoney(v).replace("S/ ", "")} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                <Tooltip
                  formatter={(v, name) => [formatMoney(v), name]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="ingresos" name="Ingresos" stroke="#10b981" fill="url(#colorIng)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="neto" name="Neto a Pagar" stroke="#6366f1" fill="url(#colorNeto)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex flex-col items-center justify-center text-slate-400">
              <DollarSign className="w-12 h-12 mb-2 text-slate-200" />
              <p className="text-sm">No hay datos de planillas para mostrar</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Distribución por centros de costo */}
      <Card className="border-0 shadow-lg lg:col-span-2">
        <CardHeader className="border-b bg-slate-50/50">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <PieIcon className="w-5 h-5 text-purple-600" />
              Distribución por Centro de Costo
            </CardTitle>
            <Badge className="bg-purple-100 text-purple-700">
              {format(new Date(), "MMMM yyyy", { locale: es })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {hasCostCenter ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={costCenterData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {costCenterData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [formatMoney(v), "Neto"]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
                {costCenterData.slice(0, 6).map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-slate-600 truncate">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold text-slate-800">{formatMoney(d.value)}</span>
                      <span className="text-slate-400 w-10 text-right">
                        {totalNetoMes > 0 ? ((d.value / totalNetoMes) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
                {costCenterData.length > 6 && (
                  <p className="text-[11px] text-slate-400 text-center pt-1">
                    +{costCenterData.length - 6} centro(s) más
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="h-[280px] flex flex-col items-center justify-center text-slate-400">
              <PieIcon className="w-12 h-12 mb-2 text-slate-200" />
              <p className="text-sm">No hay datos de centros de costo este mes</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}