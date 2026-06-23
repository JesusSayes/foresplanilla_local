import React from "react";
import { safePayrollNumber } from "@/lib/payrollUtils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FileText, Building2, User, Calendar, Printer } from "lucide-react";

export default function PayslipPreview({ payslip, employee, companyInfo, showPrintButton = false }) {
  const company = companyInfo || {
    company_name: "Empresa",
    ruc: "00000000000",
    address: "Lima, Perú"
  };

  const handlePrint = () => {
    const logoHtml = company.logo_url
      ? `<img src="${company.logo_url}" alt="Logo" style="width:56px;height:56px;object-fit:contain;border-radius:8px;padding:4px;background:white;" />`
      : `<div style="width:56px;height:56px;background:white;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;">🏢</div>`;

    const fmt = (val) => safePayrollNumber(val).toFixed(2);

    const incomeRows = [
      `<div class="row"><span>Remuneración Básica</span><span>S/ ${fmt(payslip.base_salary)}</span></div>`,
      payslip.family_allowance > 0 ? `<div class="row"><span>Asignación Familiar</span><span>S/ ${fmt(payslip.family_allowance)}</span></div>` : "",
      payslip.overtime_pay > 0 ? `<div class="row"><span>Horas Extras</span><span>S/ ${fmt(payslip.overtime_pay)}</span></div>` : "",
      payslip.bonuses > 0 ? `<div class="row"><span>Bonificaciones</span><span>S/ ${fmt(payslip.bonuses)}</span></div>` : "",
      payslip.commissions > 0 ? `<div class="row"><span>Comisiones</span><span>S/ ${fmt(payslip.commissions)}</span></div>` : "",
    ].filter(Boolean).join("");

    const deductionRows = [
      payslip.pension_deduction > 0 ? `<div class="row"><span>AFP/ONP</span><span>S/ ${fmt(payslip.pension_deduction)}</span></div>` : "",
      payslip.health_insurance > 0 ? `<div class="row"><span>Seguro de Salud</span><span>S/ ${fmt(payslip.health_insurance)}</span></div>` : "",
      payslip.income_tax > 0 ? `<div class="row"><span>Impuesto 5ta Categoría</span><span>S/ ${fmt(payslip.income_tax)}</span></div>` : "",
      payslip.tardiness_discount > 0 ? `<div class="row"><span>Descuento por Tardanzas</span><span>S/ ${fmt(payslip.tardiness_discount)}</span></div>` : "",
      payslip.absence_discount > 0 ? `<div class="row"><span>Descuento por Inasistencias</span><span>S/ ${fmt(payslip.absence_discount)}</span></div>` : "",
      payslip.advance_deduction > 0 ? `<div class="row"><span>Adelanto Quincenal</span><span>S/ ${fmt(payslip.advance_deduction)}</span></div>` : "",
      payslip.loan_deduction > 0 ? `<div class="row"><span>Préstamos</span><span>S/ ${fmt(payslip.loan_deduction)}</span></div>` : "",
      payslip.other_deductions > 0 ? `<div class="row"><span>Otros Descuentos</span><span>S/ ${fmt(payslip.other_deductions)}</span></div>` : "",
    ].filter(Boolean).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Boleta de Pago - ${employee?.first_name} ${employee?.last_name}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #1e293b; margin: 0; }
    .header { background: linear-gradient(135deg, #4f46e5, #2563eb); color: white; padding: 16px 20px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .company-name { font-size: 14pt; font-weight: 700; }
    .company-sub { font-size: 8pt; color: #c7d2fe; }
    .header-right { text-align: right; }
    .boleta-title { font-size: 13pt; font-weight: 700; }
    .badge { display: inline-block; background: white; color: #4f46e5; padding: 2px 10px; border-radius: 12px; font-size: 8pt; font-weight: 600; margin-top: 4px; }
    .body { border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; padding: 16px 20px; }
    .section { margin-bottom: 14px; }
    .section-title { font-size: 11pt; font-weight: 700; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
    .section-title.green { border-color: #bbf7d0; }
    .section-title.red { border-color: #fecaca; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; font-size: 9pt; background: #f8fafc; padding: 10px; border-radius: 6px; }
    .label { color: #64748b; font-size: 8pt; }
    .value { font-weight: 600; color: #0f172a; }
    .metrics { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 14px; }
    .metric-box { text-align: center; padding: 8px; border-radius: 6px; }
    .metric-box.blue { background: #eff6ff; }
    .metric-box.amber { background: #fffbeb; }
    .metric-box.purple { background: #faf5ff; }
    .metric-label { font-size: 7.5pt; color: #64748b; }
    .metric-value { font-size: 13pt; font-weight: 700; }
    .metric-value.blue { color: #1d4ed8; }
    .metric-value.amber { color: #d97706; }
    .metric-value.purple { color: #7c3aed; }
    .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 9pt; }
    .row span:last-child { font-weight: 600; }
    .total-row { display: flex; justify-content: space-between; padding: 6px 0; border-top: 1px solid #e2e8f0; margin-top: 4px; font-weight: 700; font-size: 10pt; }
    .total-row.green { color: #15803d; border-color: #bbf7d0; }
    .total-row.red { color: #dc2626; border-color: #fecaca; }
    .neto { background: linear-gradient(135deg, #eef2ff, #dbeafe); border: 2px solid #c7d2fe; border-radius: 8px; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; }
    .neto-label { font-size: 10pt; color: #64748b; }
    .neto-amount { font-size: 22pt; font-weight: 700; color: #4338ca; }
    .neto-date { font-size: 8.5pt; color: #64748b; text-align: right; }
    .footer { text-align: center; font-size: 7.5pt; color: #94a3b8; margin-top: 14px; border-top: 2px dashed #e2e8f0; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      ${logoHtml}
      <div>
        <div class="company-name">${company.company_name}</div>
        <div class="company-sub">RUC: ${company.ruc}</div>
        <div class="company-sub">${company.address || ""}</div>
      </div>
    </div>
    <div class="header-right">
      <div class="boleta-title">BOLETA DE PAGO</div>
      <div style="font-size:9pt;color:#c7d2fe;">${payslip.period}</div>
      <span class="badge">${payslip.payroll_type}</span>
    </div>
  </div>
  <div class="body">
    <div class="section">
      <div class="section-title">👤 Información del Trabajador</div>
      <div class="grid2">
        <div><div class="label">Nombres y Apellidos:</div><div class="value">${employee?.first_name} ${employee?.last_name}</div></div>
        <div><div class="label">Código:</div><div class="value">${employee?.employee_code}</div></div>
        <div><div class="label">Documento:</div><div class="value">${employee?.document_type} ${employee?.document_number}</div></div>
        <div><div class="label">Cargo:</div><div class="value">${employee?.position || "—"}</div></div>
        <div><div class="label">Departamento:</div><div class="value">${employee?.department_name || "—"}</div></div>
        <div><div class="label">Fecha Ingreso:</div><div class="value">${employee?.hire_date ? format(new Date(employee.hire_date), 'dd/MM/yyyy') : "—"}</div></div>
        <div><div class="label">Sistema Pensiones:</div><div class="value">${employee?.pension_system || "N/A"}</div></div>
        <div><div class="label">Tipo Trabajador:</div><div class="value">${employee?.worker_type || "Empleado"}</div></div>
      </div>
    </div>
    <div class="metrics">
      <div class="metric-box blue"><div class="metric-label">Días Trabajados</div><div class="metric-value blue">${payslip.worked_days}</div></div>
      <div class="metric-box amber"><div class="metric-label">Días No Laborados</div><div class="metric-value amber">${payslip.non_worked_days || 0}</div></div>
      <div class="metric-box purple"><div class="metric-label">Horas Extras</div><div class="metric-value purple">${payslip.overtime_hours || 0}</div></div>
    </div>
    <div class="section">
      <div class="section-title green">INGRESOS</div>
      ${incomeRows}
      <div class="total-row green"><span>TOTAL INGRESOS</span><span>S/ ${fmt(payslip.total_income)}</span></div>
    </div>
    <div class="section">
      <div class="section-title red">DESCUENTOS</div>
      ${deductionRows || '<div class="row"><span style="color:#94a3b8;">Sin descuentos</span><span>S/ 0.00</span></div>'}
      <div class="total-row red"><span>TOTAL DESCUENTOS</span><span>S/ ${fmt(payslip.total_deductions)}</span></div>
    </div>
    <div class="neto">
      <div>
        <div class="neto-label">NETO A PAGAR</div>
        <div class="neto-amount">S/ ${fmt(payslip.net_pay)}</div>
      </div>
      <div class="neto-date">
        Fecha de Pago:<br/>
        <strong>${payslip.payment_date ? format(new Date(payslip.payment_date), "dd 'de' MMMM, yyyy", { locale: es }) : "—"}</strong>
      </div>
    </div>
    <div class="footer">
      <p>Este documento es generado automáticamente por el sistema de planillas</p>
      <p>Para cualquier consulta, contacte con el departamento de Recursos Humanos</p>
    </div>
  </div>
  <script>window.onload = function(){ window.print(); window.onafterprint = function(){ window.close(); }; }</script>
</body>
</html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
  };

  return (
    <div>
    {showPrintButton && (
      <div className="flex justify-end mb-3">
        <Button onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-700">
          <Printer className="w-4 h-4 mr-2" />Imprimir Boleta
        </Button>
      </div>
    )}
    <Card className="border-2 border-slate-300 shadow-xl">
      <CardHeader className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white pb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {company.logo_url ? (
              <img src={company.logo_url} alt="Logo" className="w-16 h-16 bg-white rounded-lg p-2" />
            ) : (
              <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center">
                <Building2 className="w-8 h-8 text-indigo-600" />
              </div>
            )}
            <div>
              <h3 className="text-xl font-bold">{company.company_name}</h3>
              <p className="text-sm text-indigo-100">RUC: {company.ruc}</p>
              <p className="text-xs text-indigo-100">{company.address}</p>
            </div>
          </div>
          <div className="text-right">
            <h4 className="text-lg font-bold">BOLETA DE PAGO</h4>
            <p className="text-sm text-indigo-100">{payslip.period}</p>
            <Badge className="bg-white text-indigo-600 mt-1">
              {payslip.payroll_type}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Datos del Trabajador */}
        <div className="bg-slate-50 rounded-lg p-4">
          <h5 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />
            Información del Trabajador
          </h5>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-600">Nombres y Apellidos:</p>
              <p className="font-semibold text-slate-900">{employee?.first_name} {employee?.last_name}</p>
            </div>
            <div>
              <p className="text-slate-600">Código:</p>
              <p className="font-semibold text-slate-900">{employee?.employee_code}</p>
            </div>
            <div>
              <p className="text-slate-600">Documento:</p>
              <p className="font-semibold text-slate-900">{employee?.document_type} {employee?.document_number}</p>
            </div>
            <div>
              <p className="text-slate-600">Cargo:</p>
              <p className="font-semibold text-slate-900">{employee?.position}</p>
            </div>
            <div>
              <p className="text-slate-600">Departamento:</p>
              <p className="font-semibold text-slate-900">{employee?.department_name}</p>
            </div>
            <div>
              <p className="text-slate-600">Fecha Ingreso:</p>
              <p className="font-semibold text-slate-900">
                {employee?.hire_date && format(new Date(employee.hire_date), 'dd/MM/yyyy')}
              </p>
            </div>
            <div>
              <p className="text-slate-600">Sistema Pensiones:</p>
              <p className="font-semibold text-slate-900">{employee?.pension_system || "N/A"}</p>
            </div>
            <div>
              <p className="text-slate-600">Tipo Trabajador:</p>
              <p className="font-semibold text-slate-900">{employee?.worker_type || "Empleado"}</p>
            </div>
          </div>
        </div>

        {/* Período Laboral */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-slate-600 text-xs mb-1">Días Trabajados</p>
            <p className="font-bold text-blue-700 text-lg">{payslip.worked_days}</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3">
            <p className="text-slate-600 text-xs mb-1">Días No Laborados</p>
            <p className="font-bold text-amber-700 text-lg">{payslip.non_worked_days || 0}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3">
            <p className="text-slate-600 text-xs mb-1">Horas Extras</p>
            <p className="font-bold text-purple-700 text-lg">{payslip.overtime_hours || 0}</p>
          </div>
        </div>

        {/* Ingresos */}
        <div>
          <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-green-200">
            <div className="w-1 h-6 bg-green-600 rounded"></div>
            <h5 className="font-bold text-slate-900 text-lg">INGRESOS</h5>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Remuneración Básica</span>
              <span className="font-semibold text-slate-900">S/ {safePayrollNumber(payslip.base_salary).toFixed(2)}</span>
            </div>
            {payslip.family_allowance > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Asignación Familiar</span>
                <span className="font-semibold text-slate-900">S/ {payslip.family_allowance?.toFixed(2)}</span>
              </div>
            )}
            {payslip.overtime_pay > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Horas Extras</span>
                <span className="font-semibold text-slate-900">S/ {payslip.overtime_pay?.toFixed(2)}</span>
              </div>
            )}
            {payslip.bonuses > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Bonificaciones</span>
                <span className="font-semibold text-slate-900">S/ {payslip.bonuses?.toFixed(2)}</span>
              </div>
            )}
            {payslip.commissions > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Comisiones</span>
                <span className="font-semibold text-slate-900">S/ {payslip.commissions?.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-green-200">
              <span className="font-bold text-green-700">TOTAL INGRESOS</span>
              <span className="font-bold text-green-700 text-lg">S/ {safePayrollNumber(payslip.total_income).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Descuentos */}
        <div>
          <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-red-200">
            <div className="w-1 h-6 bg-red-600 rounded"></div>
            <h5 className="font-bold text-slate-900 text-lg">DESCUENTOS</h5>
          </div>
          <div className="space-y-2">
            {payslip.pension_deduction > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">AFP/ONP</span>
                <span className="font-semibold text-slate-900">S/ {payslip.pension_deduction?.toFixed(2)}</span>
              </div>
            )}
            {payslip.health_insurance > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Seguro de Salud</span>
                <span className="font-semibold text-slate-900">S/ {payslip.health_insurance?.toFixed(2)}</span>
              </div>
            )}
            {payslip.income_tax > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Impuesto 5ta Categoría</span>
                <span className="font-semibold text-slate-900">S/ {payslip.income_tax?.toFixed(2)}</span>
              </div>
            )}
            {payslip.tardiness_discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Descuento por Tardanzas</span>
                <span className="font-semibold text-slate-900">S/ {payslip.tardiness_discount?.toFixed(2)}</span>
              </div>
            )}
            {payslip.absence_discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Descuento por Inasistencias</span>
                <span className="font-semibold text-slate-900">S/ {payslip.absence_discount?.toFixed(2)}</span>
              </div>
            )}
            {payslip.advance_deduction > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Adelanto Quincenal</span>
                <span className="font-semibold text-slate-900">S/ {payslip.advance_deduction?.toFixed(2)}</span>
              </div>
            )}
            {payslip.loan_deduction > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Préstamos</span>
                <span className="font-semibold text-slate-900">S/ {payslip.loan_deduction?.toFixed(2)}</span>
              </div>
            )}
            {payslip.other_deductions > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Otros Descuentos</span>
                <span className="font-semibold text-slate-900">S/ {payslip.other_deductions?.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-red-200">
              <span className="font-bold text-red-700">TOTAL DESCUENTOS</span>
              <span className="font-bold text-red-700 text-lg">S/ {safePayrollNumber(payslip.total_deductions).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Neto a Pagar */}
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg p-6 border-2 border-indigo-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm mb-1">NETO A PAGAR</p>
              <p className="text-4xl font-bold text-indigo-600">
                S/ {safePayrollNumber(payslip.net_pay).toFixed(2)}
              </p>
            </div>
            <div className="text-right text-sm text-slate-600">
              <p className="flex items-center gap-1 justify-end">
                <Calendar className="w-3 h-3" />
                Fecha de Pago:
              </p>
              <p className="font-semibold text-slate-900">
                {payslip.payment_date && format(new Date(payslip.payment_date), "dd 'de' MMMM, yyyy", { locale: es })}
              </p>
            </div>
          </div>
        </div>

        {/* Resumen de Cálculos */}
        {payslip.calculation_summary && (
          <details className="bg-slate-50 rounded-lg p-4">
            <summary className="text-sm font-semibold text-slate-900 cursor-pointer flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Ver Detalle de Cálculos Automáticos
            </summary>
            <div className="mt-3 space-y-3 text-xs">
              {payslip.calculation_summary.breakdown.incomes.items.length > 0 && (
                <div>
                  <p className="font-semibold text-green-700 mb-1">Ingresos Calculados:</p>
                  {payslip.calculation_summary.breakdown.incomes.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between ml-2 text-slate-700">
                      <span>
                        {item.name}
                        {item.formula && <span className="text-slate-500 ml-1">({item.formula})</span>}
                      </span>
                      <span className="font-semibold">S/ {safePayrollNumber(item.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              {payslip.calculation_summary.breakdown.deductions.items.length > 0 && (
                <div>
                  <p className="font-semibold text-red-700 mb-1">Descuentos Calculados:</p>
                  {payslip.calculation_summary.breakdown.deductions.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between ml-2 text-slate-700">
                      <span>
                        {item.name}
                        {item.formula && <span className="text-slate-500 ml-1">({item.formula})</span>}
                      </span>
                      <span className="font-semibold">S/ {safePayrollNumber(item.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        )}

        {/* Notas */}
        {payslip.notes && (
          <div className="text-xs text-slate-600 italic bg-amber-50 p-3 rounded border border-amber-200">
            <p className="font-semibold text-amber-900 mb-1">Notas:</p>
            {payslip.notes}
          </div>
        )}

        {/* Firma */}
        <div className="pt-4 border-t-2 border-dashed border-slate-300 text-center text-xs text-slate-500">
          <p>Este documento es generado automáticamente por el sistema de planillas</p>
          <p className="mt-1">Para cualquier consulta, contacte con el departamento de Recursos Humanos</p>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}