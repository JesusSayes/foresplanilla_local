// Exportación a Excel de la planilla (una fila por boleta).

import * as XLSX from "xlsx";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { safePayrollNumber, roundMoney } from "@/lib/payrollUtils";
import {
  getCostFromSummary,
  computeDedupedTotalIncome,
  getAfpBreakdown,
  getOvertimePaySplit,
} from "@/lib/payrollExcelHelpers";

export const exportPayslipsToExcel = (payslipsData, allEmployees = [], filename, filterType) => {
  // Si se pasa filterType, filtrar solo las boletas de ese tipo
  const data = filterType ? payslipsData.filter(p => p.payroll_type === filterType) : payslipsData;
  if (data.length === 0) { toast.error("No hay datos para exportar"); return; }

  const safeNum = (v) => safePayrollNumber(v);

  const rows = data.map((p, idx) => {
    const emp = allEmployees.find(e => e.id === p.employee_id);
    // Periodo legible: usar los campos month/year de la boleta (no del estado global)
    const periodoLabel = p.period && p.period.trim()
      ? p.period
      : (p.month && p.year ? format(new Date(p.year, p.month - 1), 'MMMM yyyy', { locale: es }) : "");
    // Total de ingresos deduplicado (consistente con la boleta) y neto recalculado
    const dedupedTotalIncome = computeDedupedTotalIncome(p);
    const totalIngresos = dedupedTotalIncome != null ? dedupedTotalIncome : safeNum(p.total_income);
    const netoPagar = dedupedTotalIncome != null
      ? dedupedTotalIncome - safeNum(p.total_deductions)
      : safeNum(p.net_pay);
    // Desglose AFP/ONP desde el breakdown (coincide con el PDF de la boleta)
    const afp = getAfpBreakdown(p);
    // Desglose de pago de horas extras al 25% y 35% (si está disponible en el breakdown)
    const hePay = getOvertimePaySplit(p);
    return {
      "N°": idx + 1,
      "Tipo Doc": emp?.document_type || "",
      "DNI": emp?.document_number || "",
      "Apellidos y Nombres": p.employee_name || (emp ? `${emp.first_name} ${emp.last_name}` : ""),
      "Sede": emp?.site || "",
      "Área / Departamento": p.department || emp?.department_name || "",
      "Cargo": emp?.position || "",
      "Tipo Contrato": emp?.contract_type || "",
      "Periodo": periodoLabel,
      "Tipo Planilla": p.payroll_type || "",
      "Días Trabajados": safeNum(p.worked_days),
      "Días No Laborados": safeNum(p.non_worked_days),
      "Días Subsidiados": safeNum(p.subsidized_days),
      "Salario Base": safeNum(p.base_salary),
      "Costo Actividad": safeNum(p.activity_cost_amount ?? getCostFromSummary(p, "activity_cost", ["actividad", "costo actividad"])),
      "Costo Alimento": safeNum(p.food_cost_amount ?? getCostFromSummary(p, "food_cost", ["alimentación", "costo alimentación", "costo alimento"])),
      "Costo Movilidad": safeNum(p.transport_cost_amount ?? getCostFromSummary(p, "transport_cost", ["movilidad", "costo movilidad"])),
      "Bonificaciones": safeNum(p.bonuses),
      "Asignación familiar": safeNum(p.family_allowance),
      "HE 25%": safeNum(p.overtime_hours_25),
      "HE 35%": safeNum(p.overtime_hours_35),
      "Horas Extra": safeNum(p.overtime_hours),
      "Pago HE 25%": hePay ? hePay.pay25 : 0,
      "Pago HE 35%": hePay ? hePay.pay35 : 0,
      "Pago Horas Extra": hePay && (safeNum(hePay.pay25) + safeNum(hePay.pay35)) > 0
        ? roundMoney(safeNum(hePay.pay25) + safeNum(hePay.pay35))
        : safeNum(p.overtime_pay),
      "Total Ingresos": totalIngresos,
      "AFP Aporte Obligatorio": afp ? afp.aporte : 0,
      "AFP Prima de Seguro": afp ? afp.prima : 0,
      "AFP Comisión": afp ? afp.comision : 0,
      "ONP": afp ? afp.onp : 0,
      "AFP/ONP Total": safeNum(p.pension_deduction),
      "Impuesto Renta": safeNum(p.income_tax),
      "Desc. Tardanzas": safeNum(p.tardiness_discount),
      "Desc. Salida Anticipada": safeNum(p.early_departure_discount),
      "Desc. Faltas": safeNum(p.absence_discount),
      "Desc. Licencia sin Goce": safeNum(
        (p.calculation_summary?.breakdown?.deductions?.items || [])
          .filter(i => String(i.name || "").toLowerCase().includes("sin goce"))
          .reduce((sum, i) => sum + Math.abs(safeNum(i.amount)), 0)
      ),
      "Desc. Adelanto": safeNum(p.advance_deduction),
      "Desc. Préstamo": safeNum(p.loan_deduction),
      "Otros Descuentos": safeNum(p.other_deductions),
      "Total Descuentos": safeNum(p.total_deductions),
      "Neto a Pagar": netoPagar,
      "Estado": p.status || "Calculada",
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  // Ajustar anchos de columna automáticamente
  const colWidths = Object.keys(rows[0] || {}).map(key => ({
    wch: Math.max(key.length, ...rows.map(r => String(r[key] ?? "").length)) + 2
  }));
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Planilla");
  XLSX.writeFile(wb, `${filename}.xlsx`);
  toast.success("Excel exportado correctamente");
};