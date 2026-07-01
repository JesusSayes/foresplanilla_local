import React, { useState, useEffect } from "react";
import { safePayrollNumber } from "@/lib/payrollUtils";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Printer, Copy } from "lucide-react";
import { base44 } from "@/api/base44Client";

const fmt = (val) => safePayrollNumber(val).toFixed(2);

// ── Helpers ─────────────────────────────────────────────────────────────────

function safeDateFmt(dateStr, fmt_str) {
  if (!dateStr) return "—";
  try { return format(new Date(dateStr), fmt_str, { locale: es }); } catch { return "—"; }
}

function toHorasMinutos(decimalHours) {
  const total = Math.round(safePayrollNumber(decimalHours) * 60);
  return { horas: Math.floor(total / 60), minutos: total % 60 };
}

/**
 * Construye la lista dinámica de conceptos a mostrar en la boleta.
 * Prioridad: calculation_summary (breakdown) → campos fijos del payslip.
 */
function buildConceptRows(payslip) {
  const ingresos      = [];
  const descuentos    = [];
  const aportTrab     = [];
  const aportEmpl     = [];

  const summary = payslip?.calculation_summary;

  if (summary?.breakdown) {
    // ── Ingresos desde el motor de cálculo ──────────────────────────────
    (summary.breakdown.incomes?.items || []).forEach(item => {
      const amt = safePayrollNumber(item.amount);
      if (amt === 0 && !item.always_show) return;
      ingresos.push({ code: item.plame_code || "", label: item.name, amount: amt });
    });

    // ── Descuentos desde el motor ────────────────────────────────────────
    (summary.breakdown.deductions?.items || []).forEach(item => {
      const amt = safePayrollNumber(item.amount);
      const isAportTrab = item.category === "Aportes del Trabajador" || item.is_worker_contribution;
      if (isAportTrab) {
        aportTrab.push({ code: item.plame_code || "", label: item.name, amount: amt });
      } else {
        descuentos.push({ code: item.plame_code || "", label: item.name, amount: amt });
      }
    });

    // ── Adelanto quincenal (siempre desde el campo del payslip) ──────────
    const advanceAmt = safePayrollNumber(payslip.advance_deduction);
    if (advanceAmt > 0) {
      const alreadyIncluded = descuentos.some(d => d.label.toLowerCase().includes("quincenal") || d.label.toLowerCase().includes("adelanto"));
      if (!alreadyIncluded) {
        descuentos.unshift({ code: "0701", label: "ADELANTO / PLANILLA QUINCENAL", amount: advanceAmt });
      }
    }

    // ── Aportes empleador ────────────────────────────────────────────────
    (summary.breakdown.contributions?.items || []).forEach(item => {
      const amt = safePayrollNumber(item.amount);
      if (amt === 0) return;
      aportEmpl.push({ code: item.plame_code || "", label: item.name, amount: amt });
    });
  }

  // ── Fallback a campos fijos si el motor no proporcionó datos ─────────
  if (ingresos.length === 0) {
    const fixed = [
      { code: "0121", field: "base_salary",      label: "REMUNERACIÓN O JORNAL BÁSICO" },
      { code: "0114", field: "family_allowance",  label: "ASIGNACIÓN FAMILIAR" },
      { code: "0201", field: "overtime_pay",      label: "HORAS EXTRAS" },
      { code: "0313", field: "bonuses",           label: "BONIFICACIONES" },
      { code: "0401", field: "commissions",       label: "COMISIONES" },
      { code: "1004", field: "other_income",      label: "OTROS INGRESOS" },
    ];
    fixed.forEach(({ code, field, label }) => {
      const amt = safePayrollNumber(payslip[field]);
      if (field === "base_salary" || amt > 0)
        ingresos.push({ code, label, amount: amt });
    });
  }

  if (descuentos.length === 0 && aportTrab.length === 0) {
    const fixedDesc = [
      { code: "0701", field: "advance_deduction",  label: "ADELANTO / PLANILLA QUINCENAL",        worker: false },
      { code: "0702", field: "loan_deduction",     label: "PRÉSTAMOS",                             worker: false },
      { code: "0706", field: "tardiness_discount", label: "DESC. POR TARDANZAS",                   worker: false },
      { code: "0707", field: "absence_discount",   label: "DESC. POR INASISTENCIAS",               worker: false },
      { code: "0799", field: "other_deductions",   label: "OTROS DESCUENTOS",                      worker: false },
      { code: "0608", field: "pension_deduction",  label: "AFP/ONP - APORTACIÓN OBLIGATORIA",      worker: true  },
      { code: "0605", field: "income_tax",         label: "RENTA QUINTA CATEGORÍA RETENCIONES",    worker: true  },
      { code: "0606", field: "health_insurance",   label: "PRIMA DE SEGURO / SEGURO DE SALUD",     worker: true  },
    ];
    fixedDesc.forEach(({ code, field, label, worker }) => {
      const amt = safePayrollNumber(payslip[field]);
      if (amt === 0) return;
      (worker ? aportTrab : descuentos).push({ code, label, amount: amt });
    });
  }

  if (aportEmpl.length === 0) {
    const fixedEmpl = [
      { code: "0803", field: "seg_vida_ley",      label: "PÓLIZA DE SEGURO - D. LEG. 688" },
      { code: "0804", field: "essalud_employer",  label: "ESSALUD (REGULAR CBSSP AGRAR/AC)TRAB" },
      { code: "0805", field: "sctr_pension",      label: "SCTR PENSIONES" },
      { code: "0814", field: "sctr_salud",        label: "COMPAÑÍA SEGURO - SCTR" },
    ];
    fixedEmpl.forEach(({ code, field, label }) => {
      const amt = safePayrollNumber(payslip[field]);
      if (amt > 0) aportEmpl.push({ code, label, amount: amt });
    });
  }

  return { ingresos, descuentos, aportTrab, aportEmpl };
}

// ── Generador de HTML para impresión (R08 fiel) ──────────────────────────────

function buildBoletaHTML({ payslip, employee, company, copies = 1, afpName = "" }) {
  const ci = company || { company_name: "Empresa", ruc: "00000000000", address: "" };
  const emp = employee || {};

  const logoHtml = ci.logo_url
    ? `<img src="${ci.logo_url}" alt="Logo" style="height:40px;object-fit:contain;" />`
    : "";

  const { ingresos, descuentos, aportTrab, aportEmpl } = buildConceptRows(payslip);

  const netoPay = safePayrollNumber(payslip.net_pay);
  const jornada = toHorasMinutos(payslip.regular_hours || 0);
  const sobret  = toHorasMinutos(payslip.overtime_hours || 0);

  const conceptRow = (code, label, ing, desc) =>
    `<tr><td class="c-code">${code}</td><td class="c-lbl">${label}</td><td class="c-ing">${ing !== "" ? `S/ ${ing}` : ""}</td><td class="c-des">${desc !== "" ? `S/ ${desc}` : ""}</td><td class="c-net"></td></tr>`;

  const totalIngresos = ingresos.reduce((s, r) => s + r.amount, 0);
  const totalDescuentos = [...descuentos, ...aportTrab].reduce((s, r) => s + r.amount, 0);
  const totalAportEmpl = aportEmpl.reduce((s, r) => s + r.amount, 0);

  const conceptRowsHTML = [
    ingresos.length  > 0 ? `<tr class="g-row"><td colspan="5">Ingresos</td></tr>` : "",
    ...ingresos.map(r => conceptRow(r.code, r.label, fmt(r.amount), "")),
    ingresos.length  > 0 ? `<tr class="subtotal-row"><td colspan="2" style="text-align:right;font-weight:700;color:#166534;">Total Ingresos</td><td class="c-ing" style="color:#166534;">S/ ${fmt(totalIngresos)}</td><td></td><td></td></tr>` : "",
    descuentos.length > 0 ? `<tr class="g-row"><td colspan="5">Descuentos</td></tr>` : "",
    ...descuentos.map(r => conceptRow(r.code, r.label, "", fmt(r.amount))),
    aportTrab.length > 0 ? `<tr class="g-row"><td colspan="5">Aportes del Trabajador</td></tr>` : "",
    ...aportTrab.map(r => conceptRow(r.code, r.label, "", fmt(r.amount))),
    (descuentos.length > 0 || aportTrab.length > 0) ? `<tr class="subtotal-row"><td colspan="2" style="text-align:right;font-weight:700;color:#991b1b;">Total Descuentos</td><td></td><td class="c-des" style="color:#991b1b;">S/ ${fmt(totalDescuentos)}</td><td></td></tr>` : "",
    `<tr class="neto-row"><td></td><td><b>Neto a Pagar</b></td><td></td><td></td><td class="c-net"><b>S/ ${fmt(netoPay)}</b></td></tr>`,
  ].join("");

  const aportEmplHTML = aportEmpl.length > 0
    ? `<table class="tbl">
        <thead><tr><th class="c-code">Código</th><th class="c-lbl">Conceptos</th><th colspan="2" class="c-ing" style="text-align:left;">Concepto</th><th class="c-net">Aporte S/.</th></tr></thead>
        <thead><tr><td colspan="5" style="padding:1px 0 3px; font-weight:700; font-size:7.5pt;">Aportes de Empleador</td></tr></thead>
        <tbody>${aportEmpl.map(r => `<tr><td class="c-code">${r.code}</td><td colspan="3" class="c-lbl">${r.label}</td><td class="c-net">S/ ${fmt(r.amount)}</td></tr>`).join("")}
          <tr class="subtotal-row"><td colspan="4" style="text-align:right;font-weight:700;color:#92400e;">Total Aportes Empleador</td><td class="c-net" style="color:#92400e;">S/ ${fmt(totalAportEmpl)}</td></tr>
        </tbody>
      </table>`
    : "";

  const oneBoleta = `
  <div class="boleta">
    <!-- Cabecera empresa -->
    <table class="hdr-tbl"><tr>
      <td class="hdr-logo">${logoHtml}</td>
      <td class="hdr-co">
        <div class="ruc">RUC: ${ci.ruc}</div>
        <div class="co-name">${ci.company_name}</div>
        <div class="co-sub">${ci.address || ""}</div>
      </td>
      <td class="hdr-bp">
        <div class="bp-title">BOLETA DE PAGO</div>
        <div class="bp-period">Periodo: ${payslip.period || ""}</div>
        <div class="bp-type">${payslip.payroll_type || ""}</div>
      </td>
    </tr></table>

    <!-- Sección 1: Datos del trabajador (cuadro rojo) -->
    <table class="tbl sec1">
      <thead>
        <tr>
          <th colspan="2">Documento de Identidad</th>
          <th colspan="3">Nombres y Apellidos</th>
          <th>Situación</th>
        </tr>
        <tr class="data-row">
          <td><b>${emp.document_type || "DNI"}</b></td>
          <td><b>${emp.document_number || "—"}</b></td>
          <td colspan="3"><b>${emp.first_name || ""} ${emp.last_name || ""}</b></td>
          <td>${emp.status || "ACTIVO O SUBSIDIADO"}</td>
        </tr>
        <tr>
          <th colspan="2">Fecha de Ingreso</th>
          <th colspan="2">Tipo de Trabajador</th>
          <th>Régimen Pensionario</th>
          <th>CUSPP</th>
        </tr>
        <tr class="data-row">
          <td colspan="2">${safeDateFmt(emp.hire_date, "dd/MM/yyyy")}</td>
          <td colspan="2">${(emp.worker_type || "EMPLEADO").toUpperCase()}</td>
          <td>${emp.pension_system ? `${emp.pension_system}${afpName ? " — " + afpName : ""}` : "—"}</td>
          <td>${emp.cuspp || "—"}</td>
        </tr>
        <tr>
          <th>Días<br/>Laborados</th>
          <th>Días No<br/>Laborados</th>
          <th>Días<br/>Subsidiados</th>
          <th>Condición</th>
          <th colspan="2">Jornada Ordinaria</th>
        </tr>
        <tr>
          <th></th><th></th><th></th><th></th>
          <th>Total Horas</th><th>Minutos</th>
        </tr>
        <tr class="data-row">
          <td>${payslip.worked_days || 0}</td>
          <td>${payslip.non_worked_days || 0}</td>
          <td>${payslip.subsidized_days || 0}</td>
          <td>${emp.tax_residence || "Domiciliado"}</td>
          <td>${jornada.horas}</td>
          <td>${jornada.minutos}</td>
        </tr>
      </thead>
    </table>

    <!-- Sección 2: Conceptos dinámicos (cuadro verde) -->
    <table class="tbl">
      <thead>
        <tr>
          <th class="c-code">Código</th>
          <th class="c-lbl">Conceptos</th>
          <th class="c-ing">Ingresos S/.</th>
          <th class="c-des">Descuentos S/.</th>
          <th class="c-net">Neto S/.</th>
        </tr>
      </thead>
      <tbody>${conceptRowsHTML}</tbody>
    </table>

    <!-- Sección 3: Aportes empleador (cuadro amarillo) -->
    ${aportEmplHTML}

    <div class="print-footer">Generado por el Sistema de Planillas RRHH — Para consultas, contacte al área de Recursos Humanos</div>
  </div>`;

  const pageStyle = copies === 2
    ? `@page { size: A4 landscape; margin: 6mm; } .wrapper { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }`
    : `@page { size: A4 portrait; margin: 10mm; } .wrapper {}`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<title>Boleta ${emp.first_name || ""} ${emp.last_name || ""} — ${payslip.period || ""}</title>
<style>
  ${pageStyle}
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, sans-serif; font-size: 8pt; color: #1e293b; margin: 0; }
  .boleta { border: 1px solid #94a3b8; padding: 6px; margin-bottom: 6mm; page-break-inside: avoid; }
  /* Header */
  .hdr-tbl { width:100%; border-collapse:collapse; margin-bottom:6px; border-bottom:1px solid #94a3b8; padding-bottom:4px; }
  .hdr-logo { width:50px; vertical-align:middle; padding-right:8px; }
  .hdr-co { vertical-align:top; }
  .ruc { font-size:7pt; color:#475569; }
  .co-name { font-size:10pt; font-weight:700; }
  .co-sub { font-size:7pt; color:#475569; }
  .hdr-bp { text-align:right; vertical-align:top; }
  .bp-title { font-size:11pt; font-weight:700; }
  .bp-period { font-size:7.5pt; color:#475569; }
  .bp-type { display:inline-block; background:#4f46e5; color:white; padding:1px 7px; border-radius:8px; font-size:7pt; font-weight:700; margin-top:2px; }
  /* Tables */
  .tbl { width:100%; border-collapse:collapse; margin-bottom:5px; font-size:7.5pt; }
  .tbl th, .tbl td { border:1px solid #94a3b8; padding:2px 4px; }
  .tbl th { background:#f1f5f9; font-size:7pt; text-align:center; }
  .data-row td { font-weight:600; }
  /* Concepts cols */
  .c-code { width:9%; text-align:center; font-family:monospace; }
  .c-lbl  { width:52%; }
  .c-ing  { width:14%; text-align:right; color:#15803d; font-weight:600; }
  .c-des  { width:14%; text-align:right; color:#dc2626; font-weight:600; }
  .c-net  { width:11%; text-align:right; color:#4338ca; font-weight:600; }
  .g-row td { background:#f8fafc; font-weight:700; font-size:7pt; color:#475569; padding:2px 4px; }
  .subtotal-row td { background:#f8fafc; border-top:1px solid #94a3b8; font-size:7.5pt; }
  .neto-row td { border-top:2px solid #94a3b8; font-size:8.5pt; }
  /* Footer */
  .print-footer { text-align:center; font-size:6.5pt; color:#94a3b8; border-top:1px dashed #e2e8f0; padding-top:4px; margin-top:4px; }
</style>
</head>
<body>
<div class="wrapper">
  ${oneBoleta}
  ${copies === 2 ? oneBoleta : ""}
</div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};</script>
</body></html>`;
}

// ── Componente React ──────────────────────────────────────────────────────────

export default function PayslipPreview({ payslip, employee, companyInfo, showPrintButton = true }) {
  const [copies, setCopies] = useState(1);
  const [afpMap, setAfpMap] = useState({});

  useEffect(() => {
    base44.entities.AFP.list().then(afps => {
      const map = {};
      afps.forEach(a => { map[a.id] = a.name; });
      setAfpMap(map);
    }).catch(() => {});
  }, []);

  const ci = companyInfo || { company_name: "Empresa", ruc: "00000000000", address: "" };
  const emp = employee || {};
  const afpName = emp.afp_id ? (afpMap[emp.afp_id] || emp.afp_id) : "";

  const handlePrint = () => {
    const html = buildBoletaHTML({ payslip, employee: emp, company: ci, copies, afpName });
    const win = window.open("", "_blank");
    if (!win) { alert("Permite las ventanas emergentes para imprimir."); return; }
    win.document.write(html);
    win.document.close();
  };

  const { ingresos, descuentos, aportTrab, aportEmpl } = buildConceptRows(payslip);
  const jornada = toHorasMinutos(payslip.regular_hours || 0);
  const sobret  = toHorasMinutos(payslip.overtime_hours || 0);

  return (
    <div className="bg-white rounded-xl border-2 border-slate-200 shadow-xl overflow-hidden">
      {/* Controles impresión */}
      {showPrintButton && (
        <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600">Copias por página:</span>
            {[
              { val: 1, label: "1 copia (A4 vertical)", Icon: Printer },
              { val: 2, label: "2 copias (A4 horizontal)", Icon: Copy },
            ].map(({ val, label, Icon }) => (
              <button key={val} onClick={() => setCopies(val)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors
                  ${copies === val ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>
          <Button onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-700">
            <Printer className="w-4 h-4 mr-2" />Imprimir / Descargar
          </Button>
        </div>
      )}

      {/* ── Cabecera empresa ── */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          {ci.logo_url && <img src={ci.logo_url} alt="Logo" className="h-12 object-contain" />}
          <div>
            <div className="text-xs text-slate-400">RUC: {ci.ruc}</div>
            <div className="text-lg font-bold text-slate-900">{ci.company_name}</div>
            <div className="text-xs text-slate-500">{ci.address}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-slate-900">BOLETA DE PAGO</div>
          <div className="text-sm text-slate-500">Periodo: {payslip.period}</div>
          <span className="inline-block mt-1 bg-indigo-600 text-white text-xs font-bold px-3 py-0.5 rounded-full">{payslip.payroll_type}</span>
        </div>
      </div>

      {/* ── Sección 1: Datos del trabajador ── */}
      <div className="px-5 py-3 border-b border-slate-200">
        <div className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Información del Trabajador</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-2 py-1 text-left" colSpan={2}>Documento de Identidad</th>
                <th className="border border-slate-300 px-2 py-1 text-left" colSpan={3}>Nombres y Apellidos</th>
                <th className="border border-slate-300 px-2 py-1 text-left">Situación</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-2 py-1 font-bold">{emp.document_type || "DNI"}</td>
                <td className="border border-slate-300 px-2 py-1 font-bold">{emp.document_number}</td>
                <td className="border border-slate-300 px-2 py-1 font-bold" colSpan={3}>{emp.first_name} {emp.last_name}</td>
                <td className="border border-slate-300 px-2 py-1">{emp.status || "ACTIVO O SUBSIDIADO"}</td>
              </tr>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-2 py-1" colSpan={2}>Fecha de Ingreso</th>
                <th className="border border-slate-300 px-2 py-1" colSpan={2}>Tipo de Trabajador</th>
                <th className="border border-slate-300 px-2 py-1">Régimen Pensionario</th>
                <th className="border border-slate-300 px-2 py-1">CUSPP</th>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1 font-semibold" colSpan={2}>{safeDateFmt(emp.hire_date, "dd/MM/yyyy")}</td>
                <td className="border border-slate-300 px-2 py-1 font-semibold" colSpan={2}>{(emp.worker_type || "EMPLEADO").toUpperCase()}</td>
                <td className="border border-slate-300 px-2 py-1 font-semibold">{emp.pension_system}{afpName ? ` — ${afpName}` : ""}</td>
                <td className="border border-slate-300 px-2 py-1 font-semibold">{emp.cuspp || "—"}</td>
              </tr>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-2 py-1">Días Laborados</th>
                <th className="border border-slate-300 px-2 py-1">Días No Lab.</th>
                <th className="border border-slate-300 px-2 py-1">Días Subsidiados</th>
                <th className="border border-slate-300 px-2 py-1">Condición</th>
                <th className="border border-slate-300 px-2 py-1">Jornada (H:M)</th>
                <th className="border border-slate-300 px-2 py-1">Sobretiempo (H:M)</th>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1 font-bold text-blue-700 text-base text-center">{payslip.worked_days || 0}</td>
                <td className="border border-slate-300 px-2 py-1 font-semibold text-center">{payslip.non_worked_days || 0}</td>
                <td className="border border-slate-300 px-2 py-1 font-semibold text-center">{payslip.subsidized_days || 0}</td>
                <td className="border border-slate-300 px-2 py-1">{emp.tax_residence || "Domiciliado"}</td>
                <td className="border border-slate-300 px-2 py-1 text-center">{jornada.horas}h {jornada.minutos}m</td>
                <td className="border border-slate-300 px-2 py-1 text-center">{sobret.horas}h {sobret.minutos}m</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Sección 2: Conceptos dinámicos ── */}
      <div className="px-5 py-3 border-b border-slate-200">
        <div className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Conceptos</div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-2 py-1 w-12 text-center">Código</th>
              <th className="border border-slate-300 px-2 py-1 text-left">Conceptos</th>
              <th className="border border-slate-300 px-2 py-1 w-24 text-right">Ingresos S/.</th>
              <th className="border border-slate-300 px-2 py-1 w-24 text-right">Descuentos S/.</th>
              <th className="border border-slate-300 px-2 py-1 w-20 text-right">Neto S/.</th>
            </tr>
          </thead>
          <tbody>
            {/* Ingresos */}
            {ingresos.length > 0 && (
              <tr className="bg-slate-50"><td colSpan={5} className="border border-slate-200 px-2 py-1 font-bold text-slate-500">Ingresos</td></tr>
            )}
            {ingresos.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="border border-slate-200 px-2 py-1 text-slate-400 font-mono text-center">{r.code}</td>
                <td className="border border-slate-200 px-2 py-1">{r.label}</td>
                <td className="border border-slate-200 px-2 py-1 text-right text-green-700 font-semibold">S/ {fmt(r.amount)}</td>
                <td className="border border-slate-200 px-2 py-1"></td>
                <td className="border border-slate-200 px-2 py-1"></td>
              </tr>
            ))}
            {/* Subtotal Ingresos */}
            {ingresos.length > 0 && (
              <tr className="bg-green-50">
                <td colSpan={2} className="border border-slate-300 px-2 py-1 font-bold text-green-800 text-right">Total Ingresos</td>
                <td className="border border-slate-300 px-2 py-1 text-right font-bold text-green-800">S/ {fmt(ingresos.reduce((s, r) => s + r.amount, 0))}</td>
                <td className="border border-slate-300 px-2 py-1"></td>
                <td className="border border-slate-300 px-2 py-1"></td>
              </tr>
            )}
            {/* Descuentos */}
            {descuentos.length > 0 && (
              <tr className="bg-slate-50"><td colSpan={5} className="border border-slate-200 px-2 py-1 font-bold text-slate-500">Descuentos</td></tr>
            )}
            {descuentos.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="border border-slate-200 px-2 py-1 text-slate-400 font-mono text-center">{r.code}</td>
                <td className="border border-slate-200 px-2 py-1">{r.label}</td>
                <td className="border border-slate-200 px-2 py-1"></td>
                <td className="border border-slate-200 px-2 py-1 text-right text-red-600 font-semibold">S/ {fmt(r.amount)}</td>
                <td className="border border-slate-200 px-2 py-1"></td>
              </tr>
            ))}
            {/* Aportes del Trabajador */}
            {aportTrab.length > 0 && (
              <tr className="bg-slate-50"><td colSpan={5} className="border border-slate-200 px-2 py-1 font-bold text-slate-500">Aportes del Trabajador</td></tr>
            )}
            {aportTrab.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="border border-slate-200 px-2 py-1 text-slate-400 font-mono text-center">{r.code}</td>
                <td className="border border-slate-200 px-2 py-1">{r.label}</td>
                <td className="border border-slate-200 px-2 py-1"></td>
                <td className="border border-slate-200 px-2 py-1 text-right text-red-600 font-semibold">S/ {fmt(r.amount)}</td>
                <td className="border border-slate-200 px-2 py-1"></td>
              </tr>
            ))}
            {/* Subtotal Descuentos (descuentos + aportes trabajador) */}
            {(descuentos.length > 0 || aportTrab.length > 0) && (
              <tr className="bg-red-50">
                <td colSpan={2} className="border border-slate-300 px-2 py-1 font-bold text-red-800 text-right">Total Descuentos</td>
                <td className="border border-slate-300 px-2 py-1"></td>
                <td className="border border-slate-300 px-2 py-1 text-right font-bold text-red-800">S/ {fmt([...descuentos, ...aportTrab].reduce((s, r) => s + r.amount, 0))}</td>
                <td className="border border-slate-300 px-2 py-1"></td>
              </tr>
            )}
            {/* Neto */}
            <tr className="bg-indigo-50 border-t-2 border-indigo-300">
              <td colSpan={2} className="border border-slate-300 px-2 py-2 font-bold text-slate-900">Neto a Pagar</td>
              <td className="border border-slate-300 px-2 py-2"></td>
              <td className="border border-slate-300 px-2 py-2"></td>
              <td className="border border-slate-300 px-2 py-2 text-right font-bold text-indigo-700 text-base">S/ {fmt(payslip.net_pay)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Sección 3: Aportes del Empleador ── */}
      {aportEmpl.length > 0 && (
        <div className="px-5 py-3 border-b border-slate-200">
          <div className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Aportes de Empleador</div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-2 py-1 w-12 text-center">Código</th>
                <th className="border border-slate-300 px-2 py-1 text-left">Conceptos</th>
                <th className="border border-slate-300 px-2 py-1 w-24 text-right">Aporte S/.</th>
              </tr>
            </thead>
            <tbody>
              {aportEmpl.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="border border-slate-200 px-2 py-1 text-slate-400 font-mono text-center">{r.code}</td>
                  <td className="border border-slate-200 px-2 py-1">{r.label}</td>
                  <td className="border border-slate-200 px-2 py-1 text-right font-semibold text-slate-700">S/ {fmt(r.amount)}</td>
                </tr>
              ))}
              <tr className="bg-amber-50">
                <td colSpan={2} className="border border-slate-300 px-2 py-1 font-bold text-amber-800 text-right">Total Aportes Empleador</td>
                <td className="border border-slate-300 px-2 py-1 text-right font-bold text-amber-800">S/ {fmt(aportEmpl.reduce((s, r) => s + r.amount, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="px-5 py-3 text-center text-xs text-slate-400 border-t border-dashed border-slate-200">
        Generado por el Sistema de Planillas RRHH — Para consultas, contacte al área de Recursos Humanos
      </div>
    </div>
  );
}