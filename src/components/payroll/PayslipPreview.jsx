import React, { useState } from "react";
import { safePayrollNumber } from "@/lib/payrollUtils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Printer, Copy } from "lucide-react";

const fmt = (val) => safePayrollNumber(val).toFixed(2);

// Mapa de conceptos PLAME con códigos
const CONCEPT_MAP = {
  base_salary:        { code: "0121", label: "REMUNERACIÓN O JORNAL BÁSICO",            type: "income" },
  family_allowance:   { code: "0114", label: "ASIGNACIÓN FAMILIAR",                     type: "income" },
  overtime_pay:       { code: "0201", label: "HORAS EXTRAS",                            type: "income" },
  bonuses:            { code: "0313", label: "BONIFICACIONES",                          type: "income" },
  commissions:        { code: "0401", label: "COMISIONES",                              type: "income" },
  other_income:       { code: "1004", label: "OTROS INGRESOS",                          type: "income" },
  advance_deduction:  { code: "0701", label: "ADELANTO / PLANILLA QUINCENAL",           type: "deduction" },
  loan_deduction:     { code: "0702", label: "PRÉSTAMOS",                               type: "deduction" },
  tardiness_discount: { code: "0706", label: "DESC. POR TARDANZAS",                     type: "deduction" },
  absence_discount:   { code: "0707", label: "DESC. POR INASISTENCIAS",                 type: "deduction" },
  other_deductions:   { code: "0799", label: "OTROS DESCUENTOS",                        type: "deduction" },
  pension_deduction:  { code: "0608", label: "AFP/ONP - APORTACIÓN OBLIGATORIA",        type: "worker_contrib" },
  income_tax:         { code: "0605", label: "RENTA QUINTA CATEGORÍA RETENCIONES",      type: "worker_contrib" },
  health_insurance:   { code: "0606", label: "PRIMA DE SEGURO / SEGURO DE SALUD",       type: "worker_contrib" },
};

function buildBoletaHTML({ payslip, employee, company, copies = 1, firmantes = null }) {
  const logoHtml = company.logo_url
    ? `<img src="${company.logo_url}" alt="Logo" style="width:52px;height:52px;object-fit:contain;border-radius:6px;padding:3px;background:white;" />`
    : `<div style="width:52px;height:52px;background:white;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:22px;">🏢</div>`;

  const hireDate = employee?.hire_date
    ? (() => { try { return format(new Date(employee.hire_date), "dd/MM/yyyy"); } catch { return "—"; } })()
    : "—";
  const payDate = payslip.payment_date
    ? (() => { try { return format(new Date(payslip.payment_date), "dd/MM/yyyy"); } catch { return "—"; } })()
    : "—";

  // Build concept rows
  const incomeRows = [];
  const deductionRows = [];
  const workerContribRows = [];

  Object.entries(CONCEPT_MAP).forEach(([field, meta]) => {
    const val = safePayrollNumber(payslip[field]);
    if (val === 0) return;
    const row = `<tr><td class="c-code">${meta.code}</td><td class="c-label">${meta.label}</td><td class="c-ing">${meta.type === "income" ? `S/ ${fmt(val)}` : ""}</td><td class="c-desc">${meta.type !== "income" ? `S/ ${fmt(val)}` : ""}</td><td class="c-neto"></td></tr>`;
    if (meta.type === "income") incomeRows.push(row);
    else if (meta.type === "deduction") deductionRows.push(row);
    else workerContribRows.push(row);
  });

  // Aportes empleador (informativos)
  const essaludAmt = safePayrollNumber(payslip.essalud_employer || 0);
  const sctrPensAmt = safePayrollNumber(payslip.sctr_pension || 0);
  const sctrSaludAmt = safePayrollNumber(payslip.sctr_salud || 0);
  const segVidaAmt = safePayrollNumber(payslip.seg_vida_ley || 0);

  const employerRows = [];
  if (segVidaAmt > 0) employerRows.push(`<tr><td class="c-code">0803</td><td class="c-label">PÓLIZA DE SEGURO - D. LEG. 688</td><td class="c-ing"></td><td class="c-desc"></td><td class="c-neto">${fmt(segVidaAmt)}</td></tr>`);
  if (essaludAmt > 0) employerRows.push(`<tr><td class="c-code">0804</td><td class="c-label">ESSALUD (REGULAR/CBSSP/AGRAR)</td><td class="c-ing"></td><td class="c-desc"></td><td class="c-neto">${fmt(essaludAmt)}</td></tr>`);
  if (sctrPensAmt > 0) employerRows.push(`<tr><td class="c-code">0805</td><td class="c-label">SCTR PENSIONES</td><td class="c-ing"></td><td class="c-desc"></td><td class="c-neto">${fmt(sctrPensAmt)}</td></tr>`);
  if (sctrSaludAmt > 0) employerRows.push(`<tr><td class="c-code">0814</td><td class="c-label">COMPAÑÍA SEGURO - SCTR</td><td class="c-ing"></td><td class="c-desc"></td><td class="c-neto">${fmt(sctrSaludAmt)}</td></tr>`);

  const firmanteGG = firmantes?.firmante_gg;
  const firmanteD  = firmantes?.firmante_delegado;
  const firmanteBlock = (firmanteGG || firmanteD) ? `
    <div class="firmantes">
      ${firmanteGG ? `<div class="firmante">${firmanteGG.signature_url ? `<img src="${firmanteGG.signature_url}" style="height:32px;object-fit:contain;"/>` : '<div style="height:32px;"></div>'}<div class="firma-line"></div><div class="firma-name">${firmanteGG.full_name || ""}</div><div class="firma-role">${firmanteGG.position || "Gerente General"}</div></div>` : ""}
      ${firmanteD ? `<div class="firmante">${firmanteD.signature_url ? `<img src="${firmanteD.signature_url}" style="height:32px;object-fit:contain;"/>` : '<div style="height:32px;"></div>'}<div class="firma-line"></div><div class="firma-name">${firmanteD.full_name || ""}</div><div class="firma-role">${firmanteD.position || "Delegado"}</div></div>` : ""}
    </div>` : "";

  const singleBoleta = `
  <div class="boleta">
    <!-- HEADER -->
    <div class="header">
      <div class="header-left">
        ${logoHtml}
        <div>
          <div class="co-name">${company.company_name}</div>
          <div class="co-sub">RUC: ${company.ruc}</div>
          <div class="co-sub">${company.address || ""}</div>
        </div>
      </div>
      <div class="header-right">
        <div class="bp-title">BOLETA DE PAGO</div>
        <div class="bp-period">${payslip.period || ""}</div>
        <span class="bp-badge">${payslip.payroll_type}</span>
      </div>
    </div>

    <!-- DATOS TRABAJADOR -->
    <div class="section">
      <div class="sec-title">Información del Trabajador</div>
      <table class="info-table">
        <tr>
          <td class="lbl">Nombres y Apellidos:</td><td class="val">${employee?.first_name || ""} ${employee?.last_name || ""}</td>
          <td class="lbl">DNI:</td><td class="val">${employee?.document_type || "DNI"} ${employee?.document_number || ""}</td>
        </tr>
        <tr>
          <td class="lbl">Cargo:</td><td class="val">${employee?.position || "—"}</td>
          <td class="lbl">Área/Depto:</td><td class="val">${employee?.department_name || "—"}</td>
        </tr>
        <tr>
          <td class="lbl">Tipo Trabajador:</td><td class="val">${employee?.worker_type || "Empleado"}</td>
          <td class="lbl">Fecha de Ingreso:</td><td class="val">${hireDate}</td>
        </tr>
        <tr>
          <td class="lbl">Régimen Pensionario:</td><td class="val">${employee?.pension_system || "—"} ${employee?.afp_id ? `(${employee.afp_id})` : ""}</td>
          <td class="lbl">CUSPP:</td><td class="val">${employee?.cuspp || "—"}</td>
        </tr>
        <tr>
          <td class="lbl">Condición:</td><td class="val">${employee?.tax_residence || "Domiciliado"}</td>
          <td class="lbl">Contrato:</td><td class="val">${employee?.contract_type || "—"}</td>
        </tr>
      </table>
    </div>

    <!-- MÉTRICAS -->
    <div class="metrics-row">
      <div class="metric-box"><div class="m-lbl">Días Laborados</div><div class="m-val">${payslip.worked_days || 0}</div></div>
      <div class="metric-box"><div class="m-lbl">Días No Lab.</div><div class="m-val">${payslip.non_worked_days || 0}</div></div>
      <div class="metric-box"><div class="m-lbl">Días Subsidiados</div><div class="m-val">${payslip.subsidized_days || 0}</div></div>
      <div class="metric-box"><div class="m-lbl">Horas Extras</div><div class="m-val">${payslip.overtime_hours || 0}</div></div>
      <div class="metric-box"><div class="m-lbl">H. Extras (25%)</div><div class="m-val">${safePayrollNumber(payslip.regular_hours || 0).toFixed(0)}</div></div>
      <div class="metric-box"><div class="m-lbl">Sistema Pensiones</div><div class="m-val-sm">${employee?.pension_system || "N/A"}</div></div>
    </div>

    <!-- TABLA CONCEPTOS -->
    <div class="section">
      <table class="concepts-table">
        <thead>
          <tr><th>Código</th><th>Conceptos</th><th>Ingresos S/.</th><th>Descuentos S/.</th><th>Neto S/.</th></tr>
        </thead>
        <tbody>
          ${incomeRows.length > 0 ? `<tr class="group-row"><td colspan="5">Ingresos</td></tr>${incomeRows.join("")}` : ""}
          ${deductionRows.length > 0 ? `<tr class="group-row"><td colspan="5">Descuentos</td></tr>${deductionRows.join("")}` : ""}
          ${workerContribRows.length > 0 ? `<tr class="group-row"><td colspan="5">Aportes del Trabajador</td></tr>${workerContribRows.join("")}` : ""}
          <tr class="neto-row">
            <td colspan="2"><strong>Neto a Pagar</strong></td>
            <td></td><td></td>
            <td><strong>S/ ${fmt(payslip.net_pay)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    ${employerRows.length > 0 ? `
    <div class="section">
      <table class="concepts-table">
        <thead><tr><th colspan="4">Aportes de Empleador</th><th></th></tr></thead>
        <tbody>${employerRows.join("")}</tbody>
      </table>
    </div>` : ""}

    <!-- NETO BOX -->
    <div class="neto-box">
      <div><div class="neto-lbl">NETO A PAGAR</div><div class="neto-val">S/ ${fmt(payslip.net_pay)}</div></div>
      <div style="text-align:right;"><div style="font-size:7pt;color:#64748b;">Fecha de pago:</div><div style="font-size:9pt;font-weight:700;">${payDate}</div></div>
    </div>

    ${firmanteBlock}
    <div class="boleta-footer">Documento generado automáticamente — Para consultas, contacte a Recursos Humanos</div>
  </div>`;

  const pageStyle = copies === 2
    ? `@page { size: A4 landscape; margin: 8mm; } .wrapper { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }`
    : `@page { size: A4 portrait; margin: 10mm; } .wrapper { display: block; }`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Boleta ${employee?.first_name || ""} ${employee?.last_name || ""} — ${payslip.period || ""}</title>
<style>
  ${pageStyle}
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, sans-serif; font-size: 8.5pt; color: #1e293b; margin: 0; }
  .boleta { border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; ${copies === 2 ? "" : "margin-bottom: 10mm;"} }
  /* HEADER */
  .header { background: linear-gradient(135deg,#4f46e5,#2563eb); color:white; padding: 10px 14px; display:flex; justify-content:space-between; align-items:center; }
  .header-left { display:flex; align-items:center; gap:10px; }
  .co-name { font-size: 11pt; font-weight:700; }
  .co-sub { font-size: 7pt; color: #c7d2fe; }
  .header-right { text-align:right; }
  .bp-title { font-size: 12pt; font-weight:700; }
  .bp-period { font-size: 8pt; color: #c7d2fe; }
  .bp-badge { display:inline-block; background:white; color:#4f46e5; padding:1px 8px; border-radius:10px; font-size:7pt; font-weight:700; margin-top:3px; }
  /* SECTIONS */
  .section { padding: 8px 12px; }
  .sec-title { font-size:8.5pt; font-weight:700; color:#0f172a; border-bottom:1.5px solid #e2e8f0; padding-bottom:3px; margin-bottom:5px; }
  /* INFO TABLE */
  .info-table { width:100%; font-size:7.5pt; border-collapse:collapse; }
  .info-table .lbl { color:#64748b; width:18%; padding: 2px 4px; }
  .info-table .val { font-weight:600; width:32%; padding: 2px 4px; }
  /* METRICS */
  .metrics-row { display:flex; gap:4px; padding: 4px 12px; background:#f8fafc; border-top:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0; }
  .metric-box { flex:1; text-align:center; padding:4px 2px; }
  .m-lbl { font-size:6.5pt; color:#64748b; }
  .m-val { font-size:11pt; font-weight:700; color:#1d4ed8; }
  .m-val-sm { font-size:8pt; font-weight:700; color:#1d4ed8; margin-top:2px; }
  /* CONCEPTS TABLE */
  .concepts-table { width:100%; border-collapse:collapse; font-size:7.5pt; }
  .concepts-table th { background:#f1f5f9; padding:4px 6px; text-align:left; font-size:7pt; font-weight:700; border-bottom:1px solid #e2e8f0; }
  .concepts-table th:nth-child(3), .concepts-table th:nth-child(4), .concepts-table th:nth-child(5) { text-align:right; }
  .concepts-table td { padding:2.5px 6px; border-bottom:1px solid #f1f5f9; }
  .c-code { width:10%; color:#64748b; font-family:monospace; }
  .c-label { width:50%; }
  .c-ing { width:15%; text-align:right; color:#15803d; font-weight:600; }
  .c-desc { width:15%; text-align:right; color:#dc2626; font-weight:600; }
  .c-neto { width:10%; text-align:right; color:#1d4ed8; font-weight:600; }
  .group-row td { background:#f8fafc; font-weight:700; font-size:7pt; color:#475569; padding:3px 6px; }
  .neto-row td { border-top:2px solid #e2e8f0; padding-top:5px; font-size:8pt; }
  .neto-row td:last-child { color:#4338ca; font-size:9pt; }
  /* NETO BOX */
  .neto-box { margin: 6px 12px; background:linear-gradient(135deg,#eef2ff,#dbeafe); border:1.5px solid #c7d2fe; border-radius:6px; padding:8px 14px; display:flex; justify-content:space-between; align-items:center; }
  .neto-lbl { font-size:7.5pt; color:#64748b; }
  .neto-val { font-size:16pt; font-weight:700; color:#4338ca; }
  /* FIRMANTES */
  .firmantes { display:flex; gap:20px; justify-content:center; padding:6px 12px; }
  .firmante { text-align:center; flex:1; max-width:140px; }
  .firma-line { border-top:1px solid #94a3b8; margin:4px 0 2px; }
  .firma-name { font-size:7pt; font-weight:700; }
  .firma-role { font-size:6.5pt; color:#64748b; }
  /* FOOTER */
  .boleta-footer { text-align:center; font-size:6.5pt; color:#94a3b8; border-top:1px dashed #e2e8f0; padding:5px 12px; margin-top:4px; }
</style>
</head>
<body>
<div class="wrapper">
  ${singleBoleta}
  ${copies === 2 ? singleBoleta : ""}
</div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};</script>
</body>
</html>`;
}

export default function PayslipPreview({ payslip, employee, companyInfo, firmantes, showPrintButton = true }) {
  const [copies, setCopies] = useState(1);

  const company = companyInfo || { company_name: "Empresa", ruc: "00000000000", address: "" };

  const handlePrint = () => {
    const html = buildBoletaHTML({ payslip, employee, company, copies, firmantes });
    const win = window.open("", "_blank");
    if (!win) { alert("Permite las ventanas emergentes para imprimir."); return; }
    win.document.write(html);
    win.document.close();
  };

  return (
    <div>
      {/* Controles de impresión */}
      {showPrintButton && (
        <div className="flex items-center justify-between mb-4 p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700">Copias por página:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setCopies(1)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${copies === 1 ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"}`}
              >
                <Printer className="w-3.5 h-3.5" /> 1 copia (vertical)
              </button>
              <button
                onClick={() => setCopies(2)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${copies === 2 ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"}`}
              >
                <Copy className="w-3.5 h-3.5" /> 2 copias (horizontal)
              </button>
            </div>
          </div>
          <Button onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-700">
            <Printer className="w-4 h-4 mr-2" />Imprimir
          </Button>
        </div>
      )}

      {/* Vista previa en pantalla */}
      <div className="border-2 border-slate-200 rounded-xl overflow-hidden shadow-xl bg-white">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            {company.logo_url
              ? <img src={company.logo_url} alt="Logo" className="w-14 h-14 bg-white rounded-lg p-1.5 object-contain" />
              : <div className="w-14 h-14 bg-white rounded-lg flex items-center justify-center text-2xl">🏢</div>}
            <div>
              <div className="text-lg font-bold">{company.company_name}</div>
              <div className="text-xs text-indigo-200">RUC: {company.ruc}</div>
              <div className="text-xs text-indigo-200">{company.address}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold">BOLETA DE PAGO</div>
            <div className="text-sm text-indigo-200">{payslip.period}</div>
            <Badge className="bg-white text-indigo-600 mt-1">{payslip.payroll_type}</Badge>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Datos trabajador */}
          <div className="bg-slate-50 rounded-lg p-4">
            <h5 className="font-bold text-slate-900 mb-3 text-sm border-b border-slate-200 pb-2">Información del Trabajador</h5>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {[
                ["Nombres y Apellidos", `${employee?.first_name || ""} ${employee?.last_name || ""}`],
                ["DNI", `${employee?.document_type || "DNI"} ${employee?.document_number || ""}`],
                ["Cargo", employee?.position || "—"],
                ["Área/Depto", employee?.department_name || "—"],
                ["Tipo Trabajador", employee?.worker_type || "Empleado"],
                ["Fecha de Ingreso", employee?.hire_date ? (() => { try { return format(new Date(employee.hire_date), "dd/MM/yyyy"); } catch { return "—"; } })() : "—"],
                ["Régimen Pensionario", `${employee?.pension_system || "—"}${employee?.afp_id ? ` (${employee.afp_id})` : ""}`],
                ["CUSPP", employee?.cuspp || "—"],
                ["Condición", employee?.tax_residence || "Domiciliado"],
                ["Contrato", employee?.contract_type || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <span className="text-slate-500 text-xs">{label}:</span>
                  <span className="font-semibold text-slate-900 text-xs">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-6 gap-2">
            {[
              ["Días Lab.", payslip.worked_days || 0, "blue"],
              ["Días No Lab.", payslip.non_worked_days || 0, "amber"],
              ["Días Subs.", payslip.subsidized_days || 0, "teal"],
              ["Horas Extras", payslip.overtime_hours || 0, "purple"],
              ["H. Reg.", (payslip.regular_hours || 0).toFixed ? safePayrollNumber(payslip.regular_hours).toFixed(0) : 0, "green"],
              ["Pensiones", employee?.pension_system || "N/A", "indigo"],
            ].map(([label, value, color]) => (
              <div key={label} className={`bg-${color}-50 rounded-lg p-2 text-center`}>
                <div className="text-xs text-slate-500">{label}</div>
                <div className={`font-bold text-${color}-700 text-sm`}>{value}</div>
              </div>
            ))}
          </div>

          {/* Tabla conceptos */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-2 text-left text-slate-600 w-12">Código</th>
                  <th className="px-3 py-2 text-left text-slate-600">Conceptos</th>
                  <th className="px-3 py-2 text-right text-slate-600 w-24">Ingresos S/.</th>
                  <th className="px-3 py-2 text-right text-slate-600 w-24">Descuentos S/.</th>
                  <th className="px-3 py-2 text-right text-slate-600 w-20">Neto S/.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Ingresos */}
                {Object.entries(CONCEPT_MAP).filter(([,m]) => m.type === "income").some(([f]) => safePayrollNumber(payslip[f]) > 0) && (
                  <tr className="bg-slate-50"><td colSpan={5} className="px-3 py-1 text-xs font-bold text-slate-500">Ingresos</td></tr>
                )}
                {Object.entries(CONCEPT_MAP).filter(([,m]) => m.type === "income").map(([field, meta]) => {
                  const val = safePayrollNumber(payslip[field]);
                  if (val === 0) return null;
                  return (
                    <tr key={field}>
                      <td className="px-3 py-1.5 text-slate-400 font-mono">{meta.code}</td>
                      <td className="px-3 py-1.5">{meta.label}</td>
                      <td className="px-3 py-1.5 text-right text-green-700 font-semibold">S/ {fmt(val)}</td>
                      <td className="px-3 py-1.5"></td>
                      <td className="px-3 py-1.5"></td>
                    </tr>
                  );
                })}
                {/* Descuentos */}
                {Object.entries(CONCEPT_MAP).filter(([,m]) => m.type === "deduction").some(([f]) => safePayrollNumber(payslip[f]) > 0) && (
                  <tr className="bg-slate-50"><td colSpan={5} className="px-3 py-1 text-xs font-bold text-slate-500">Descuentos</td></tr>
                )}
                {Object.entries(CONCEPT_MAP).filter(([,m]) => m.type === "deduction").map(([field, meta]) => {
                  const val = safePayrollNumber(payslip[field]);
                  if (val === 0) return null;
                  return (
                    <tr key={field}>
                      <td className="px-3 py-1.5 text-slate-400 font-mono">{meta.code}</td>
                      <td className="px-3 py-1.5">{meta.label}</td>
                      <td className="px-3 py-1.5"></td>
                      <td className="px-3 py-1.5 text-right text-red-600 font-semibold">S/ {fmt(val)}</td>
                      <td className="px-3 py-1.5"></td>
                    </tr>
                  );
                })}
                {/* Aportes trabajador */}
                {Object.entries(CONCEPT_MAP).filter(([,m]) => m.type === "worker_contrib").some(([f]) => safePayrollNumber(payslip[f]) > 0) && (
                  <tr className="bg-slate-50"><td colSpan={5} className="px-3 py-1 text-xs font-bold text-slate-500">Aportes del Trabajador</td></tr>
                )}
                {Object.entries(CONCEPT_MAP).filter(([,m]) => m.type === "worker_contrib").map(([field, meta]) => {
                  const val = safePayrollNumber(payslip[field]);
                  if (val === 0) return null;
                  return (
                    <tr key={field}>
                      <td className="px-3 py-1.5 text-slate-400 font-mono">{meta.code}</td>
                      <td className="px-3 py-1.5">{meta.label}</td>
                      <td className="px-3 py-1.5"></td>
                      <td className="px-3 py-1.5 text-right text-red-600 font-semibold">S/ {fmt(val)}</td>
                      <td className="px-3 py-1.5"></td>
                    </tr>
                  );
                })}
                {/* Neto */}
                <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                  <td colSpan={2} className="px-3 py-2 font-bold text-slate-900">Neto a Pagar</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right font-bold text-indigo-700 text-sm">S/ {fmt(payslip.net_pay)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Aportes empleador */}
          {(safePayrollNumber(payslip.essalud_employer) > 0 || safePayrollNumber(payslip.sctr_pension) > 0 || safePayrollNumber(payslip.sctr_salud) > 0 || safePayrollNumber(payslip.seg_vida_ley) > 0) && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-100">
                  <tr><th colSpan={4} className="px-3 py-2 text-left text-slate-600">Aportes de Empleador</th><th className="px-3 py-2 text-right text-slate-600">S/.</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {safePayrollNumber(payslip.seg_vida_ley) > 0 && <tr><td className="px-3 py-1.5 text-slate-400 font-mono w-12">0803</td><td colSpan={3} className="px-3 py-1.5">PÓLIZA DE SEGURO - D. LEG. 688</td><td className="px-3 py-1.5 text-right font-semibold">{fmt(payslip.seg_vida_ley)}</td></tr>}
                  {safePayrollNumber(payslip.essalud_employer) > 0 && <tr><td className="px-3 py-1.5 text-slate-400 font-mono">0804</td><td colSpan={3} className="px-3 py-1.5">ESSALUD (REGULAR/CBSSP/AGRAR)</td><td className="px-3 py-1.5 text-right font-semibold">{fmt(payslip.essalud_employer)}</td></tr>}
                  {safePayrollNumber(payslip.sctr_pension) > 0 && <tr><td className="px-3 py-1.5 text-slate-400 font-mono">0805</td><td colSpan={3} className="px-3 py-1.5">SCTR PENSIONES</td><td className="px-3 py-1.5 text-right font-semibold">{fmt(payslip.sctr_pension)}</td></tr>}
                  {safePayrollNumber(payslip.sctr_salud) > 0 && <tr><td className="px-3 py-1.5 text-slate-400 font-mono">0814</td><td colSpan={3} className="px-3 py-1.5">COMPAÑÍA SEGURO - SCTR</td><td className="px-3 py-1.5 text-right font-semibold">{fmt(payslip.sctr_salud)}</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Neto box */}
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg p-4 border-2 border-indigo-200 flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-xs">NETO A PAGAR</p>
              <p className="text-4xl font-bold text-indigo-600">S/ {fmt(payslip.net_pay)}</p>
            </div>
            <div className="text-right text-sm text-slate-600">
              <p className="text-xs">Fecha de pago:</p>
              <p className="font-bold text-slate-900">
                {payslip.payment_date
                  ? (() => { try { return format(new Date(payslip.payment_date), "dd/MM/yyyy"); } catch { return "—"; } })()
                  : "—"}
              </p>
            </div>
          </div>

          <div className="text-center text-xs text-slate-400 border-t border-dashed border-slate-200 pt-3">
            Documento generado automáticamente — Para consultas, contacte a Recursos Humanos
          </div>
        </div>
      </div>
    </div>
  );
}