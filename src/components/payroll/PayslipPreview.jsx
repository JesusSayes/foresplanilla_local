import React, { useState } from "react";
import { safePayrollNumber } from "@/lib/payrollUtils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Printer, Copy } from "lucide-react";

const fmt = (val) => safePayrollNumber(val).toFixed(2);

function safeDate(dateStr, pattern = "dd/MM/yyyy") {
  if (!dateStr) return "—";
  try { return format(new Date(dateStr), pattern, { locale: es }); } catch { return "—"; }
}

// Genera el HTML estrictamente fiel al formato R08 PLAME
export function buildR08HTML({ payslip, employee, company, copies = 1 }) {
  const ci = company || { company_name: "Empresa", ruc: "00000000000", address: "" };

  // Datos del trabajador
  const docTipo    = employee?.document_type || "DNI";
  const docNum     = employee?.document_number || "";
  const fullName   = `${(employee?.first_name || "").toUpperCase()} ${(employee?.last_name || "").toUpperCase()}`;
  const situacion  = payslip.subsidized_days > 0 ? "SUBSIDIADO" : "ACTIVO O SUBSIDIADO";
  const hireDate   = safeDate(employee?.hire_date);
  const tipoTrab   = (employee?.worker_type || "EMPLEADO").toUpperCase();
  const regPension = employee?.pension_system || "—";
  const afpNombre  = employee?.afp_id || "";
  const regLabel   = regPension === "AFP" ? `SPP ${afpNombre}`.trim() : regPension === "ONP" ? "SNP - ONP" : regPension;
  const cuspp      = employee?.cuspp || "—";

  // Días
  const diasLab    = payslip.worked_days || 0;
  const diasNoLab  = payslip.non_worked_days || 0;
  const diasSubs   = payslip.subsidized_days || 0;
  const condicion  = employee?.tax_residence || "Domiciliado";
  const jornadaH   = Math.floor(safePayrollNumber(payslip.regular_hours));
  const jornadaM   = Math.round((safePayrollNumber(payslip.regular_hours) % 1) * 60);
  const sobreH     = Math.floor(safePayrollNumber(payslip.overtime_hours));
  const sobreM     = Math.round((safePayrollNumber(payslip.overtime_hours) % 1) * 60);

  // Conceptos — solo los que tienen valor > 0
  const ingresos = [
    { code: "0121", label: "REMUNERACIÓN O JORNAL BÁSICO",               val: payslip.base_salary },
    { code: "0114", label: "ASIGNACIÓN FAMILIAR",                        val: payslip.family_allowance },
    { code: "0201", label: "HORAS EXTRAS",                               val: payslip.overtime_pay },
    { code: "0313", label: "BONIF. EXTRAORD. PROPORC. LEY 29351 y 30334",val: payslip.bonuses },
    { code: "0406", label: "GRATIF. F.PATRIAS/NAVIDAD LEY 29351 Y 30334",val: payslip.commissions },
    { code: "1004", label: "COSTO POR MOVILIDAD / OTROS INGRESOS",       val: payslip.other_income },
  ].filter(r => safePayrollNumber(r.val) > 0);

  const descuentos = [
    { code: "0701", label: "ADELANTO / PLANILLA QUINCENAL", val: payslip.advance_deduction },
    { code: "0702", label: "PRÉSTAMOS",                     val: payslip.loan_deduction },
    { code: "0706", label: "DESC. POR TARDANZAS",           val: payslip.tardiness_discount },
    { code: "0707", label: "DESC. POR INASISTENCIAS",       val: payslip.absence_discount },
    { code: "0799", label: "OTROS DESCUENTOS",              val: payslip.other_deductions },
  ].filter(r => safePayrollNumber(r.val) > 0);

  const aportesWorker = [
    { code: "0601", label: "COMISIÓN AFP PORCENTUAL",              val: payslip.afp_commission || 0 },
    { code: "0605", label: "RENTA QUINTA CATEGORÍA RETENCIONES",   val: payslip.income_tax },
    { code: "0606", label: "PRIMA DE SEGURO AFP",                  val: payslip.health_insurance },
    { code: "0608", label: `${regPension === "AFP" ? "SPP" : "SNP"} - APORTACIÓN OBLIGATORIA`, val: payslip.pension_deduction },
  ].filter(r => safePayrollNumber(r.val) >= 0 && (safePayrollNumber(r.val) > 0 || r.code === "0601" || r.code === "0605"));

  const aportesEmployer = [
    { code: "0803", label: "PÓLIZA DE SEGURO - D. LEG. 688",           val: payslip.seg_vida_ley },
    { code: "0804", label: "ESSALUD(REGULAR CBSSP AGRAR/AC)TRAB",      val: payslip.essalud_employer },
    { code: "0805", label: "SCTR PENSIONES",                           val: payslip.sctr_pension },
    { code: "0814", label: "COMPAÑÍA SEGURO - SCTR",                   val: payslip.sctr_salud },
  ].filter(r => safePayrollNumber(r.val) > 0);

  const conceptRows = (rows, colIdx) => rows.map(r =>
    `<tr>
      <td class="td-code">${r.code}</td>
      <td class="td-label">${r.label}</td>
      <td class="td-num">${colIdx === 0 ? `${fmt(r.val)}` : ""}</td>
      <td class="td-num">${colIdx === 1 ? `${fmt(r.val)}` : ""}</td>
      <td class="td-num"></td>
    </tr>`
  ).join("");

  const singleBoleta = `
<div class="boleta">
  <!-- ENCABEZADO EMPRESA -->
  <div class="emp-header">
    <div><span class="emp-label">RUC: </span>${ci.ruc}</div>
    <div><span class="emp-label">Empleador: </span>${ci.company_name}</div>
    <div><span class="emp-label">Periodo: </span>${payslip.period || ""} &nbsp;&nbsp;&nbsp; <span class="emp-label">Tipo Planilla: </span>${payslip.payroll_type}</div>
    <div><span class="emp-label">PDT Planilla Electrónica - PLAME</span> &nbsp;&nbsp;&nbsp; <span class="emp-label">Número de Orden: </span>${payslip.payroll_number || ""}</div>
  </div>

  <!-- TABLA DATOS TRABAJADOR -->
  <table class="main-table">
    <thead>
      <tr>
        <th colspan="2">Documento de Identidad</th>
        <th colspan="3">Nombres y Apellidos</th>
        <th colspan="2">Situación</th>
      </tr>
      <tr>
        <th>Tipo</th><th>Número</th>
        <th colspan="3">&nbsp;</th>
        <th colspan="2">&nbsp;</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-c">${docTipo}</td>
        <td class="td-c">${docNum}</td>
        <td colspan="3" class="td-name">${fullName}</td>
        <td colspan="2" class="td-c">${situacion}</td>
      </tr>
      <tr>
        <th colspan="2">Fecha de Ingreso</th>
        <th colspan="2">Tipo de Trabajador</th>
        <th colspan="2">Régimen Pensionario</th>
        <th>CUSPP</th>
      </tr>
      <tr>
        <td colspan="2" class="td-c">${hireDate}</td>
        <td colspan="2" class="td-c">${tipoTrab}</td>
        <td colspan="2" class="td-c">${regLabel}</td>
        <td class="td-c">${cuspp}</td>
      </tr>
      <tr>
        <th>Días<br/>Laborados</th>
        <th>Días No<br/>Laborados</th>
        <th>Días<br/>Subsidiados</th>
        <th>Condición</th>
        <th colspan="2">Jornada Ordinaria</th>
        <th>Sobretiempo</th>
      </tr>
      <tr>
        <td class="td-c" rowspan="2">${diasLab}</td>
        <td class="td-c" rowspan="2">${diasNoLab || ""}</td>
        <td class="td-c" rowspan="2">${diasSubs || ""}</td>
        <td class="td-c" rowspan="2">${condicion}</td>
        <th>Total Horas</th><th>Minutos</th>
        <th>Total Horas &nbsp; Minutos</th>
      </tr>
      <tr>
        <td class="td-c">${jornadaH}</td><td class="td-c">${jornadaM}</td>
        <td class="td-c">${sobreH} &nbsp;&nbsp; ${sobreM}</td>
      </tr>
      <tr>
        <th colspan="4">Motivo de Suspensión de Labores</th>
        <th colspan="3">Otros empleadores por Rentas de 5ta categoría</th>
      </tr>
      <tr>
        <th>Tipo</th><th colspan="3">Motivo &nbsp;&nbsp;&nbsp; N.º Días</th>
        <th colspan="3" class="td-c">No tiene</th>
      </tr>
      <tr>
        <td class="td-c"></td><td colspan="3" class="td-c"></td>
        <td colspan="3"></td>
      </tr>
    </tbody>
  </table>

  <!-- TABLA CONCEPTOS -->
  <table class="concepts-table">
    <thead>
      <tr>
        <th class="th-code">Código</th>
        <th class="th-label">Conceptos</th>
        <th class="th-num">Ingresos S/.</th>
        <th class="th-num">Descuentos S/.</th>
        <th class="th-num">Neto S/.</th>
      </tr>
    </thead>
    <tbody>
      ${ingresos.length > 0 ? `<tr class="group-hdr"><td colspan="5">Ingresos</td></tr>${conceptRows(ingresos, 0)}` : ""}
      ${descuentos.length > 0 ? `<tr class="group-hdr"><td colspan="5">Descuentos</td></tr>${conceptRows(descuentos, 1)}` : ""}
      ${aportesWorker.length > 0 ? `<tr class="group-hdr"><td colspan="5">Aportes del Trabajador</td></tr>${aportesWorker.map(r =>
        `<tr><td class="td-code">${r.code}</td><td class="td-label">${r.label}</td><td class="td-num"></td><td class="td-num">${fmt(r.val)}</td><td class="td-num"></td></tr>`
      ).join("")}` : ""}
      <tr class="neto-row">
        <td colspan="2">Neto a Pagar</td>
        <td></td><td></td>
        <td class="td-neto">${fmt(payslip.net_pay)}</td>
      </tr>
    </tbody>
  </table>

  ${aportesEmployer.length > 0 ? `
  <table class="concepts-table" style="margin-top:6pt;">
    <thead>
      <tr><th colspan="4" class="th-label">Aportes de Empleador</th><th class="th-num"></th></tr>
    </thead>
    <tbody>
      ${aportesEmployer.map(r =>
        `<tr><td class="td-code">${r.code}</td><td class="td-label" colspan="3">${r.label}</td><td class="td-neto">${fmt(r.val)}</td></tr>`
      ).join("")}
    </tbody>
  </table>` : ""}

  <div class="gen-footer">Generado por el sistema de planillas &mdash; ${ci.company_name} &mdash; ${safeDate(new Date().toISOString())}</div>
</div>`;

  const pageStyle = copies === 2
    ? `@page { size: A4 landscape; margin: 8mm; } .wrapper { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }`
    : `@page { size: A4 portrait; margin: 12mm; } .wrapper {}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>R08 - ${fullName} - ${payslip.period || ""}</title>
<style>
  ${pageStyle}
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, sans-serif; font-size: 8pt; color: #000; margin: 0; }

  .boleta { border: 1px solid #aaa; padding: 6pt 8pt; }
  ${copies === 2 ? ".boleta { font-size: 7pt; }" : ""}

  /* Encabezado empresa */
  .emp-header { border: 1px solid #aaa; padding: 5pt 7pt; margin-bottom: 5pt; background: #f5f5f5; font-size: 8pt; line-height: 1.5; }
  .emp-label { font-weight: bold; }

  /* Tabla datos trabajador */
  .main-table { width: 100%; border-collapse: collapse; margin-bottom: 6pt; font-size: ${copies === 2 ? "6.5pt" : "7.5pt"}; }
  .main-table th, .main-table td { border: 1px solid #aaa; padding: 2pt 4pt; }
  .main-table th { background: #e8e8e8; font-weight: bold; text-align: center; }
  .td-c { text-align: center; }
  .td-name { font-weight: bold; text-align: center; }

  /* Tabla conceptos */
  .concepts-table { width: 100%; border-collapse: collapse; font-size: ${copies === 2 ? "6.5pt" : "7.5pt"}; }
  .concepts-table th, .concepts-table td { border: 1px solid #aaa; padding: 2pt 4pt; }
  .th-code { width: 8%; text-align: center; background: #e8e8e8; font-weight: bold; }
  .th-label { background: #e8e8e8; font-weight: bold; }
  .th-num { width: 13%; text-align: right; background: #e8e8e8; font-weight: bold; }
  .td-code { text-align: center; font-family: monospace; color: #333; }
  .td-label { }
  .td-num { text-align: right; }
  .td-neto { text-align: right; font-weight: bold; }
  .group-hdr td { font-weight: bold; background: #f0f0f0; padding: 2pt 4pt; font-style: italic; border: 1px solid #ccc; }
  .neto-row td { font-weight: bold; background: #f5f5f5; border-top: 2px solid #666; }
  .neto-row .td-neto { font-size: ${copies === 2 ? "8pt" : "9pt"}; }

  /* Footer */
  .gen-footer { text-align: center; font-size: 6.5pt; color: #666; margin-top: 5pt; border-top: 1px solid #ccc; padding-top: 3pt; font-style: italic; }
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

export default function PayslipPreview({ payslip, employee, companyInfo, showPrintButton = true }) {
  const [copies, setCopies] = useState(1);
  const company = companyInfo || { company_name: "Empresa", ruc: "00000000000", address: "" };

  const handlePrint = () => {
    const html = buildR08HTML({ payslip, employee, company, copies });
    const win = window.open("", "_blank");
    if (!win) { alert("Permite las ventanas emergentes para imprimir."); return; }
    win.document.write(html);
    win.document.close();
  };

  // Datos para la vista previa en pantalla
  const docTipo   = employee?.document_type || "DNI";
  const docNum    = employee?.document_number || "";
  const fullName  = `${employee?.first_name || ""} ${employee?.last_name || ""}`;
  const hireDate  = safeDate(employee?.hire_date);
  const tipoTrab  = employee?.worker_type || "Empleado";
  const regPension = employee?.pension_system || "—";
  const afpNombre  = employee?.afp_id || "";
  const regLabel   = regPension === "AFP" ? `SPP ${afpNombre}`.trim() : regPension === "ONP" ? "SNP - ONP" : regPension;
  const cuspp      = employee?.cuspp || "—";
  const condicion  = employee?.tax_residence || "Domiciliado";
  const situacion  = payslip.subsidized_days > 0 ? "SUBSIDIADO" : "ACTIVO O SUBSIDIADO";

  const ingresos = [
    { code: "0121", label: "REMUNERACIÓN O JORNAL BÁSICO",                val: payslip.base_salary },
    { code: "0114", label: "ASIGNACIÓN FAMILIAR",                         val: payslip.family_allowance },
    { code: "0201", label: "HORAS EXTRAS",                                val: payslip.overtime_pay },
    { code: "0313", label: "BONIF. EXTRAORD. PROPORC. LEY 29351 y 30334", val: payslip.bonuses },
    { code: "0406", label: "GRATIF. F.PATRIAS/NAVIDAD LEY 29351 Y 30334", val: payslip.commissions },
    { code: "1004", label: "COSTO POR MOVILIDAD / OTROS INGRESOS",        val: payslip.other_income },
  ].filter(r => safePayrollNumber(r.val) > 0);

  const descuentos = [
    { code: "0701", label: "ADELANTO / PLANILLA QUINCENAL", val: payslip.advance_deduction },
    { code: "0702", label: "PRÉSTAMOS",                     val: payslip.loan_deduction },
    { code: "0706", label: "DESC. POR TARDANZAS",           val: payslip.tardiness_discount },
    { code: "0707", label: "DESC. POR INASISTENCIAS",       val: payslip.absence_discount },
    { code: "0799", label: "OTROS DESCUENTOS",              val: payslip.other_deductions },
  ].filter(r => safePayrollNumber(r.val) > 0);

  const aportesWorker = [
    { code: "0601", label: "COMISIÓN AFP PORCENTUAL",            val: payslip.afp_commission || 0 },
    { code: "0605", label: "RENTA QUINTA CATEGORÍA RETENCIONES", val: payslip.income_tax },
    { code: "0606", label: "PRIMA DE SEGURO AFP",                val: payslip.health_insurance },
    { code: "0608", label: `${regPension === "AFP" ? "SPP" : "SNP"} - APORTACIÓN OBLIGATORIA`, val: payslip.pension_deduction },
  ].filter(r => safePayrollNumber(r.val) >= 0 && (safePayrollNumber(r.val) > 0 || r.code === "0601" || r.code === "0605"));

  const aportesEmployer = [
    { code: "0803", label: "PÓLIZA DE SEGURO - D. LEG. 688",      val: payslip.seg_vida_ley },
    { code: "0804", label: "ESSALUD(REGULAR CBSSP AGRAR/AC)TRAB", val: payslip.essalud_employer },
    { code: "0805", label: "SCTR PENSIONES",                      val: payslip.sctr_pension },
    { code: "0814", label: "COMPAÑÍA SEGURO - SCTR",              val: payslip.sctr_salud },
  ].filter(r => safePayrollNumber(r.val) > 0);

  const jornadaH = Math.floor(safePayrollNumber(payslip.regular_hours));
  const sobreH   = Math.floor(safePayrollNumber(payslip.overtime_hours));

  return (
    <div>
      {/* Controles de impresión */}
      {showPrintButton && (
        <div className="flex items-center justify-between mb-4 p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700">Copias por página:</span>
            <div className="flex gap-2">
              <button onClick={() => setCopies(1)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${copies === 1 ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"}`}>
                <Printer className="w-3.5 h-3.5" /> 1 por página (A4 vertical)
              </button>
              <button onClick={() => setCopies(2)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${copies === 2 ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"}`}>
                <Copy className="w-3.5 h-3.5" /> 2 por página (A4 horizontal)
              </button>
            </div>
          </div>
          <Button onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-700">
            <Printer className="w-4 h-4 mr-2" />Imprimir Boleta
          </Button>
        </div>
      )}

      {/* ── Vista previa en pantalla — fiel al R08 ── */}
      <div className="bg-white border border-gray-400 p-5 font-mono text-xs text-black" style={{ fontFamily: "Arial, sans-serif" }}>

        {/* Encabezado empresa */}
        <div className="border border-gray-400 bg-gray-100 p-3 mb-3 text-xs leading-relaxed">
          <div><strong>RUC:</strong> {company.ruc} &nbsp;&nbsp; <strong>Empleador:</strong> {company.company_name}</div>
          <div><strong>Periodo:</strong> {payslip.period} &nbsp;&nbsp; <strong>Tipo Planilla:</strong> {payslip.payroll_type}</div>
          <div><strong>PDT Planilla Electrónica - PLAME</strong> &nbsp;&nbsp; <strong>Número de Orden:</strong> {payslip.payroll_number || "—"}</div>
        </div>

        {/* Tabla datos trabajador */}
        <table className="w-full border-collapse text-xs mb-3">
          <tbody>
            <tr className="bg-gray-200">
              <th colSpan={2} className="border border-gray-400 px-2 py-1 text-center font-bold">Documento de Identidad</th>
              <th colSpan={3} className="border border-gray-400 px-2 py-1 text-center font-bold">Nombres y Apellidos</th>
              <th colSpan={2} className="border border-gray-400 px-2 py-1 text-center font-bold">Situación</th>
            </tr>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-2 py-1 text-center font-bold">Tipo</th>
              <th className="border border-gray-400 px-2 py-1 text-center font-bold">Número</th>
              <td colSpan={3}></td>
              <td colSpan={2}></td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1 text-center">{docTipo}</td>
              <td className="border border-gray-400 px-2 py-1 text-center">{docNum}</td>
              <td colSpan={3} className="border border-gray-400 px-2 py-1 text-center font-bold uppercase">{fullName}</td>
              <td colSpan={2} className="border border-gray-400 px-2 py-1 text-center">{situacion}</td>
            </tr>
            <tr className="bg-gray-200">
              <th colSpan={2} className="border border-gray-400 px-2 py-1 text-center font-bold">Fecha de Ingreso</th>
              <th colSpan={2} className="border border-gray-400 px-2 py-1 text-center font-bold">Tipo de Trabajador</th>
              <th colSpan={2} className="border border-gray-400 px-2 py-1 text-center font-bold">Régimen Pensionario</th>
              <th className="border border-gray-400 px-2 py-1 text-center font-bold">CUSPP</th>
            </tr>
            <tr>
              <td colSpan={2} className="border border-gray-400 px-2 py-1 text-center">{hireDate}</td>
              <td colSpan={2} className="border border-gray-400 px-2 py-1 text-center">{tipoTrab}</td>
              <td colSpan={2} className="border border-gray-400 px-2 py-1 text-center">{regLabel}</td>
              <td className="border border-gray-400 px-2 py-1 text-center">{cuspp}</td>
            </tr>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-2 py-1 text-center font-bold">Días<br/>Laborados</th>
              <th className="border border-gray-400 px-2 py-1 text-center font-bold">Días No<br/>Laborados</th>
              <th className="border border-gray-400 px-2 py-1 text-center font-bold">Días<br/>Subsidiados</th>
              <th className="border border-gray-400 px-2 py-1 text-center font-bold">Condición</th>
              <th colSpan={2} className="border border-gray-400 px-2 py-1 text-center font-bold">Jornada Ordinaria</th>
              <th className="border border-gray-400 px-2 py-1 text-center font-bold">Sobretiempo</th>
            </tr>
            <tr className="bg-gray-200">
              <td rowSpan={2} className="border border-gray-400 px-2 py-1 text-center text-sm font-bold">{payslip.worked_days || 0}</td>
              <td rowSpan={2} className="border border-gray-400 px-2 py-1 text-center">{payslip.non_worked_days || ""}</td>
              <td rowSpan={2} className="border border-gray-400 px-2 py-1 text-center">{payslip.subsidized_days || ""}</td>
              <td rowSpan={2} className="border border-gray-400 px-2 py-1 text-center">{condicion}</td>
              <th className="border border-gray-400 px-2 py-0.5 text-center font-bold">Total Horas</th>
              <th className="border border-gray-400 px-2 py-0.5 text-center font-bold">Minutos</th>
              <th className="border border-gray-400 px-2 py-0.5 text-center font-bold">Total Horas &nbsp; Minutos</th>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1 text-center">{jornadaH}</td>
              <td className="border border-gray-400 px-2 py-1 text-center">0</td>
              <td className="border border-gray-400 px-2 py-1 text-center">{sobreH} &nbsp;&nbsp; 0</td>
            </tr>
            <tr className="bg-gray-200">
              <th colSpan={4} className="border border-gray-400 px-2 py-1 text-center font-bold">Motivo de Suspensión de Labores</th>
              <th colSpan={3} className="border border-gray-400 px-2 py-1 text-center font-bold">Otros empleadores por Rentas de 5ta categoría</th>
            </tr>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-2 py-1 text-center font-bold">Tipo</th>
              <th colSpan={3} className="border border-gray-400 px-2 py-1 text-center font-bold">Motivo &nbsp; N.º Días</th>
              <td colSpan={3} className="border border-gray-400 px-2 py-1 text-center">No tiene</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1 text-center"></td>
              <td colSpan={3} className="border border-gray-400 px-2 py-1"></td>
              <td colSpan={3} className="border border-gray-400 px-2 py-1"></td>
            </tr>
          </tbody>
        </table>

        {/* Tabla conceptos */}
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-2 py-1 text-center font-bold w-12">Código</th>
              <th className="border border-gray-400 px-2 py-1 text-left font-bold">Conceptos</th>
              <th className="border border-gray-400 px-2 py-1 text-right font-bold w-24">Ingresos S/.</th>
              <th className="border border-gray-400 px-2 py-1 text-right font-bold w-24">Descuentos S/.</th>
              <th className="border border-gray-400 px-2 py-1 text-right font-bold w-20">Neto S/.</th>
            </tr>
          </thead>
          <tbody>
            {ingresos.length > 0 && (
              <>
                <tr className="bg-gray-100 italic">
                  <td colSpan={5} className="border border-gray-300 px-2 py-0.5 font-semibold">Ingresos</td>
                </tr>
                {ingresos.map(r => (
                  <tr key={r.code}>
                    <td className="border border-gray-300 px-2 py-0.5 text-center text-gray-500">{r.code}</td>
                    <td className="border border-gray-300 px-2 py-0.5">{r.label}</td>
                    <td className="border border-gray-300 px-2 py-0.5 text-right">{fmt(r.val)}</td>
                    <td className="border border-gray-300 px-2 py-0.5"></td>
                    <td className="border border-gray-300 px-2 py-0.5"></td>
                  </tr>
                ))}
              </>
            )}
            {descuentos.length > 0 && (
              <>
                <tr className="bg-gray-100 italic">
                  <td colSpan={5} className="border border-gray-300 px-2 py-0.5 font-semibold">Descuentos</td>
                </tr>
                {descuentos.map(r => (
                  <tr key={r.code}>
                    <td className="border border-gray-300 px-2 py-0.5 text-center text-gray-500">{r.code}</td>
                    <td className="border border-gray-300 px-2 py-0.5">{r.label}</td>
                    <td className="border border-gray-300 px-2 py-0.5"></td>
                    <td className="border border-gray-300 px-2 py-0.5 text-right">{fmt(r.val)}</td>
                    <td className="border border-gray-300 px-2 py-0.5"></td>
                  </tr>
                ))}
              </>
            )}
            {aportesWorker.length > 0 && (
              <>
                <tr className="bg-gray-100 italic">
                  <td colSpan={5} className="border border-gray-300 px-2 py-0.5 font-semibold">Aportes del Trabajador</td>
                </tr>
                {aportesWorker.map(r => (
                  <tr key={r.code}>
                    <td className="border border-gray-300 px-2 py-0.5 text-center text-gray-500">{r.code}</td>
                    <td className="border border-gray-300 px-2 py-0.5">{r.label}</td>
                    <td className="border border-gray-300 px-2 py-0.5"></td>
                    <td className="border border-gray-300 px-2 py-0.5 text-right">{fmt(r.val)}</td>
                    <td className="border border-gray-300 px-2 py-0.5"></td>
                  </tr>
                ))}
              </>
            )}
            <tr className="bg-gray-100 font-bold">
              <td colSpan={2} className="border border-gray-400 px-2 py-1">Neto a Pagar</td>
              <td className="border border-gray-400 px-2 py-1"></td>
              <td className="border border-gray-400 px-2 py-1"></td>
              <td className="border border-gray-400 px-2 py-1 text-right font-bold text-base">{fmt(payslip.net_pay)}</td>
            </tr>
          </tbody>
        </table>

        {/* Aportes de Empleador */}
        {aportesEmployer.length > 0 && (
          <table className="w-full border-collapse text-xs mb-3">
            <thead>
              <tr className="bg-gray-200">
                <th colSpan={4} className="border border-gray-400 px-2 py-1 text-left font-bold">Aportes de Empleador</th>
                <th className="border border-gray-400 px-2 py-1 text-right font-bold w-20"></th>
              </tr>
            </thead>
            <tbody>
              {aportesEmployer.map(r => (
                <tr key={r.code}>
                  <td className="border border-gray-300 px-2 py-0.5 text-center text-gray-500 w-12">{r.code}</td>
                  <td colSpan={3} className="border border-gray-300 px-2 py-0.5">{r.label}</td>
                  <td className="border border-gray-300 px-2 py-0.5 text-right font-semibold">{fmt(r.val)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="text-center text-xs text-gray-400 border-t border-dashed border-gray-300 pt-2 mt-1 italic">
          Generado por el sistema de planillas — {company.company_name} — {safeDate(new Date().toISOString())}
        </div>
      </div>
    </div>
  );
}