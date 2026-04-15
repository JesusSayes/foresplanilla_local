import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Building2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function PlanillaCompletaView({ grupo, payslips, companyInfo, firmantes, onBack }) {
  const company = companyInfo || { company_name: "Empresa", ruc: "00000000000", address: "Lima, Perú" };

  const sorted = [...payslips].sort((a, b) => {
    const lastA = (a.employee.last_name || "").toUpperCase();
    const lastB = (b.employee.last_name || "").toUpperCase();
    if (lastA !== lastB) return lastA.localeCompare(lastB, "es");
    return (a.employee.first_name || "").toUpperCase().localeCompare((b.employee.first_name || "").toUpperCase(), "es");
  });

  const totalIncome = sorted.reduce((s, { payslip: p }) => s + (p.total_income || 0), 0);
  const totalDesc   = sorted.reduce((s, { payslip: p }) => s + (p.total_deductions || 0), 0);
  const totalNeto   = sorted.reduce((s, { payslip: p }) => s + (p.net_pay || 0), 0);
  const totalDias   = sorted.reduce((s, { payslip: p }) => s + (p.worked_days || 0), 0);

  const firmante1 = firmantes?.firmante_gg       || { nombre: "Gerente General",      cargo: "Gerente General" };
  const firmante2 = firmantes?.firmante_delegado || { nombre: "Responsable de RRHH", cargo: "Jefe de Recursos Humanos" };

  const handlePrint = () => {
    const logoHtml = company.logo_url
      ? `<img src="${company.logo_url}" alt="Logo" style="width:50px;height:50px;object-fit:contain;border-radius:4px;border:1px solid #e2e8f0;" />`
      : `<div style="width:50px;height:50px;background:#eef2ff;border-radius:4px;border:2px solid #c7d2fe;display:flex;align-items:center;justify-content:center;font-size:18px;color:#818cf8;">🏢</div>`;

    const firma1Html = firmante1.firma_url
      ? `<img src="${firmante1.firma_url}" alt="firma" style="max-height:40px;display:block;margin:0 auto 4px;" />`
      : `<div style="height:40px;border-bottom:2px solid #64748b;margin:0 24px 4px;"></div>`;

    const firma2Html = firmante2.firma_url
      ? `<img src="${firmante2.firma_url}" alt="firma" style="max-height:40px;display:block;margin:0 auto 4px;" />`
      : `<div style="height:40px;border-bottom:2px solid #64748b;margin:0 24px 4px;"></div>`;

    const rowsHtml = sorted.map(({ payslip: p, employee: emp }, idx) => `
      <tr style="background:${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};border-bottom:1px solid #e2e8f0;">
        <td style="padding:3px 5px;text-align:right;color:#94a3b8;">${idx + 1}</td>
        <td style="padding:3px 5px;font-family:monospace;color:#475569;">${emp.employee_code || ""}</td>
        <td style="padding:3px 5px;font-weight:600;color:#0f172a;white-space:nowrap;">${emp.last_name || ""}, ${emp.first_name || ""}</td>
        <td style="padding:3px 5px;color:#475569;white-space:nowrap;">${emp.document_type || ""} ${emp.document_number || ""}</td>
        <td style="padding:3px 5px;color:#475569;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${emp.position || "—"}</td>
        <td style="padding:3px 5px;text-align:center;">${p.worked_days || 0}</td>
        <td style="padding:3px 5px;text-align:right;">${Number(p.base_salary || 0).toFixed(2)}</td>
        <td style="padding:3px 5px;text-align:right;">${Number((p.total_income || 0) - (p.base_salary || 0)).toFixed(2)}</td>
        <td style="padding:3px 5px;text-align:right;font-weight:600;color:#15803d;">${Number(p.total_income || 0).toFixed(2)}</td>
        <td style="padding:3px 5px;text-align:right;">${Number(p.pension_deduction || 0).toFixed(2)}</td>
        <td style="padding:3px 5px;text-align:right;">${Number((p.total_deductions || 0) - (p.pension_deduction || 0)).toFixed(2)}</td>
        <td style="padding:3px 5px;text-align:right;font-weight:600;color:#dc2626;">${Number(p.total_deductions || 0).toFixed(2)}</td>
        <td style="padding:3px 5px;text-align:right;font-weight:700;color:#4338ca;">${Number(p.net_pay || 0).toFixed(2)}</td>
        <td style="padding:3px 5px;"><div style="height:18px;border:1px dashed #cbd5e1;border-radius:3px;min-width:45px;"></div></td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Planilla ${grupo.period}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, sans-serif; font-size: 7.5pt; margin: 0; padding: 0; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tbody tr { page-break-inside: avoid; }

    /* Cabecera empresa + KPIs + columnas — todo dentro del thead */
    .th-header-company { background: #ffffff; padding: 0 0 6px 0; }
    .th-header-kpis    { background: #ffffff; padding: 0 0 4px 0; }

    /* KPI boxes */
    .kpi-grid { display: table; width: 100%; border-spacing: 4px 0; }
    .kpi-cell { display: table-cell; width: 25%; text-align: center; border: 1.5px solid #e2e8f0; border-radius: 4px; padding: 4px 6px; background: #f8fafc; }
    .kpi-cell.highlight { background: #eef2ff; border-color: #a5b4fc; }
    .kpi-label { font-size: 6.5pt; color: #64748b; }
    .kpi-value { font-size: 9pt; font-weight: 700; color: #0f172a; }
    .kpi-cell.highlight .kpi-value { color: #4338ca; }

    /* Encabezado empresa */
    .company-header { display: table; width: 100%; border-bottom: 2px solid #4338ca; padding-bottom: 5px; margin-bottom: 5px; }
    .company-left  { display: table-cell; vertical-align: middle; }
    .company-right { display: table-cell; vertical-align: middle; text-align: right; }
    .badge-planilla { background: #4338ca; color: white; padding: 3px 10px; border-radius: 4px; font-size: 8pt; font-weight: 700; display: inline-block; margin-bottom: 2px; }

    /* Fila de totales en tfoot */
    .totales-row td { background: #eef2ff; border-top: 2px solid #a5b4fc; font-weight: 700; padding: 4px 5px; }

    /* Firmas */
    .firmas { display: table; width: 100%; margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    .firma-cell { display: table-cell; width: 50%; text-align: center; padding: 0 20px; }
    .footer-note { text-align: center; color: #94a3b8; font-size: 6pt; margin-top: 8px; }
  </style>
</head>
<body>
<table>
  <thead>
    <tr>
      <th colspan="14" class="th-header-company" style="font-weight:normal;">
        <!-- ENCABEZADO EMPRESA -->
        <div class="company-header">
          <div class="company-left">
            <table style="border:none;width:auto;"><tr>
              <td style="padding:0 10px 0 0;vertical-align:middle;">${logoHtml}</td>
              <td style="vertical-align:middle;">
                <div style="font-size:10pt;font-weight:700;color:#0f172a;">${company.company_name}</div>
                <div style="font-size:7.5pt;color:#475569;">RUC: ${company.ruc}</div>
                <div style="font-size:7pt;color:#64748b;">${company.address || ""}</div>
              </td>
            </tr></table>
          </div>
          <div class="company-right">
            <span class="badge-planilla">PLANILLA DE REMUNERACIONES</span><br/>
            <span style="font-size:9pt;font-weight:600;color:#334155;text-transform:capitalize;">${grupo.period}</span><br/>
            <span style="font-size:7pt;color:#64748b;">Tipo: ${grupo.payroll_type} &nbsp;|&nbsp; N° ${grupo.payroll_number}</span>
          </div>
        </div>
        <!-- KPIs -->
        <div class="kpi-grid">
          <div class="kpi-cell" style="display:inline-block;width:24%;margin-right:1%;">
            <div class="kpi-label">N° de Trabajadores</div>
            <div class="kpi-value">${sorted.length}</div>
          </div>
          <div class="kpi-cell" style="display:inline-block;width:24%;margin-right:1%;">
            <div class="kpi-label">Total Ingresos</div>
            <div class="kpi-value">S/ ${Number(totalIncome || 0).toFixed(2)}</div>
          </div>
          <div class="kpi-cell" style="display:inline-block;width:24%;margin-right:1%;">
            <div class="kpi-label">Total Descuentos</div>
            <div class="kpi-value">S/ ${Number(totalDesc || 0).toFixed(2)}</div>
          </div>
          <div class="kpi-cell highlight" style="display:inline-block;width:24%;">
            <div class="kpi-label">TOTAL NETO A PAGAR</div>
            <div class="kpi-value">S/ ${Number(totalNeto || 0).toFixed(2)}</div>
          </div>
        </div>
      </th>
    </tr>
    <!-- CABECERA DE COLUMNAS -->
    <tr style="background:#4338ca;color:white;">
      ${["#","Código","Apellidos y Nombres","Documento","Cargo","Días","Rem. Básica","Otros Ing.","Total Ing.","AFP/ONP","Otros Desc.","Total Desc.","NETO","Firma"]
        .map(h => `<th style="padding:4px 5px;text-align:left;font-weight:600;white-space:nowrap;font-size:6.5pt;background:#4338ca;color:white;">${h}</th>`)
        .join("")}
    </tr>
  </thead>
  <tfoot></tfoot>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>
<!-- TOTALES Y FIRMAS — solo al final, fuera de la tabla -->
<table style="width:100%;border-collapse:collapse;margin-top:0;">
  <tbody>
    <tr style="background:#eef2ff;border-top:2px solid #a5b4fc;font-weight:700;">
      <td colspan="5" style="padding:4px 5px;font-size:7.5pt;">TOTALES GENERALES</td>
      <td style="padding:4px 5px;text-align:center;font-size:7.5pt;">${totalDias}</td>
      <td style="padding:4px 5px;text-align:right;font-size:7.5pt;">${sorted.reduce((s,{payslip:p})=>s+(p.base_salary||0),0).toFixed(2)}</td>
      <td style="padding:4px 5px;text-align:right;font-size:7.5pt;">${sorted.reduce((s,{payslip:p})=>s+((p.total_income||0)-(p.base_salary||0)),0).toFixed(2)}</td>
      <td style="padding:4px 5px;text-align:right;color:#15803d;font-size:7.5pt;">${totalIncome.toFixed(2)}</td>
      <td style="padding:4px 5px;text-align:right;font-size:7.5pt;">${sorted.reduce((s,{payslip:p})=>s+(p.pension_deduction||0),0).toFixed(2)}</td>
      <td style="padding:4px 5px;text-align:right;font-size:7.5pt;">${sorted.reduce((s,{payslip:p})=>s+((p.total_deductions||0)-(p.pension_deduction||0)),0).toFixed(2)}</td>
      <td style="padding:4px 5px;text-align:right;color:#dc2626;font-size:7.5pt;">${totalDesc.toFixed(2)}</td>
      <td style="padding:4px 5px;text-align:right;color:#4338ca;font-size:8.5pt;">${totalNeto.toFixed(2)}</td>
      <td></td>
    </tr>
  </tbody>
</table>
<!-- FIRMAS -->
<div class="firmas">
  <div class="firma-cell">
    ${firma1Html}
    <div style="font-size:7.5pt;font-weight:700;color:#0f172a;">${firmante1.nombre}</div>
    <div style="font-size:7pt;color:#475569;">${firmante1.cargo}</div>
    ${firmante1.dni ? `<div style="font-size:6.5pt;color:#94a3b8;">DNI: ${firmante1.dni}</div>` : ""}
  </div>
  <div class="firma-cell">
    ${firma2Html}
    <div style="font-size:7.5pt;font-weight:700;color:#0f172a;">${firmante2.nombre}</div>
    <div style="font-size:7pt;color:#475569;">${firmante2.cargo}</div>
    ${firmante2.dni ? `<div style="font-size:6.5pt;color:#94a3b8;">DNI: ${firmante2.dni}</div>` : ""}
  </div>
</div>
<div class="footer-note">
  Documento generado el ${format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: es })} — Sistema de Recursos Humanos
</div>
<script>window.onload = function(){ window.print(); window.onafterprint = function(){ window.close(); }; }</script>
</body>
</html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
  };

  // ── VISTA PREVIA en pantalla (sin cambios de lógica) ──
  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Barra de acciones */}
      <div className="no-print sticky top-0 z-40 bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />Volver
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">Vista previa de impresión</span>
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />Imprimir Planilla Completa
          </Button>
        </div>
      </div>

      {/* Área de vista previa */}
      <div className="bg-slate-200 min-h-screen p-6">
        <div className="bg-white mx-auto shadow-xl" style={{ width: "277mm", padding: "8mm", boxSizing: "border-box" }}>

          {/* ENCABEZADO */}
          <div className="flex items-start justify-between border-b-2 border-indigo-600 pb-3 mb-3">
            <div className="flex items-center gap-3">
              {company.logo_url ? (
                <img src={company.logo_url} alt="Logo" className="w-14 h-14 object-contain rounded border" />
              ) : (
                <div className="w-14 h-14 bg-indigo-50 rounded flex items-center justify-center border-2 border-indigo-200">
                  <Building2 className="w-7 h-7 text-indigo-400" />
                </div>
              )}
              <div>
                <h2 className="text-base font-bold text-slate-900 leading-tight">{company.company_name}</h2>
                <p className="text-xs text-slate-600">RUC: {company.ruc}</p>
                <p className="text-xs text-slate-500">{company.address}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="bg-indigo-600 text-white px-4 py-1.5 rounded mb-1 inline-block">
                <h3 className="font-bold text-sm">PLANILLA DE REMUNERACIONES</h3>
              </div>
              <p className="text-sm font-semibold text-slate-700 capitalize">{grupo.period}</p>
              <p className="text-xs text-slate-500">Tipo: {grupo.payroll_type} &nbsp;|&nbsp; N° {grupo.payroll_number}</p>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3 mb-3">
            {[
              { label: "N° de Trabajadores", value: sorted.length, prefix: "" },
              { label: "Total Ingresos",     value: Number(totalIncome || 0).toFixed(2), prefix: "S/" },
              { label: "Total Descuentos",   value: Number(totalDesc || 0).toFixed(2),   prefix: "S/" },
              { label: "TOTAL NETO A PAGAR", value: Number(totalNeto || 0).toFixed(2),   prefix: "S/", highlight: true },
            ].map(({ label, value, prefix, highlight }) => (
              <div key={label} className={`rounded border-2 p-2 text-center ${highlight ? "bg-indigo-50 border-indigo-300" : "bg-slate-50 border-slate-200"}`}>
                <p className="text-[9px] text-slate-500 leading-tight">{label}</p>
                <p className={`font-bold text-sm leading-tight ${highlight ? "text-indigo-700" : "text-slate-900"}`}>{prefix} {value}</p>
              </div>
            ))}
          </div>

          {/* TABLA */}
          <div className="overflow-hidden rounded border border-slate-200 mb-3">
            <table className="w-full" style={{ fontSize: "7.5pt", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#4338ca", color: "white" }}>
                  {["#","Código","Apellidos y Nombres","Documento","Cargo","Días","Rem. Básica","Otros Ing.","Total Ing.","AFP/ONP","Otros Desc.","Total Desc.","NETO","Firma"].map(h => (
                    <th key={h} style={{ padding: "4px 6px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap", fontSize: "7pt" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ payslip: p, employee: emp }, idx) => (
                  <tr key={p.id} style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <td className="px-1.5 py-1 text-slate-400 text-right">{idx + 1}</td>
                    <td className="px-1.5 py-1 font-mono text-slate-700">{emp.employee_code}</td>
                    <td className="px-1.5 py-1 font-medium text-slate-900 whitespace-nowrap">{emp.last_name}, {emp.first_name}</td>
                    <td className="px-1.5 py-1 text-slate-600 whitespace-nowrap">{emp.document_type} {emp.document_number}</td>
                    <td className="px-1.5 py-1 text-slate-600" style={{ maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.position || "—"}</td>
                    <td className="px-1.5 py-1 text-center">{p.worked_days}</td>
                    <td className="px-1.5 py-1 text-right">{Number(p.base_salary || 0).toFixed(2)}</td>
                    <td className="px-1.5 py-1 text-right">{Number((p.total_income || 0) - (p.base_salary || 0)).toFixed(2)}</td>
                    <td className="px-1.5 py-1 text-right font-semibold" style={{ color: "#15803d" }}>{Number(p.total_income || 0).toFixed(2)}</td>
                    <td className="px-1.5 py-1 text-right">{Number(p.pension_deduction || 0).toFixed(2)}</td>
                    <td className="px-1.5 py-1 text-right">{Number((p.total_deductions || 0) - (p.pension_deduction || 0)).toFixed(2)}</td>
                    <td className="px-1.5 py-1 text-right font-semibold" style={{ color: "#dc2626" }}>{Number(p.total_deductions || 0).toFixed(2)}</td>
                    <td className="px-1.5 py-1 text-right font-bold" style={{ color: "#4338ca" }}>{Number(p.net_pay || 0).toFixed(2)}</td>
                    <td className="px-1.5 py-1"><div style={{ height: "20px", border: "1px dashed #cbd5e1", borderRadius: "3px", minWidth: "50px" }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* TOTALES */}
          <div className="p-2 mb-3" style={{ backgroundColor: "#eef2ff", borderTop: "2px solid #a5b4fc", fontWeight: "bold", fontSize: "7.5pt" }}>
            <span>TOTALES GENERALES &nbsp;|&nbsp; Neto Total: </span>
            <span style={{ color: "#4338ca", fontSize: "9pt" }}>S/ {Number(totalNeto || 0).toFixed(2)}</span>
          </div>

          {/* FIRMAS */}
          <div className="grid grid-cols-2 gap-12 pt-3 border-t border-slate-200">
            {[firmante1, firmante2].map((f, i) => (
              <div key={i} className="text-center">
                {f.firma_url ? (
                  <img src={f.firma_url} alt="firma" className="mx-auto mb-1 object-contain" style={{ maxHeight: "40px" }} />
                ) : (
                  <div style={{ height: "40px", borderBottom: "2px solid #64748b", margin: "0 24px 4px" }} />
                )}
                <p className="font-bold text-slate-900" style={{ fontSize: "8pt" }}>{f.nombre}</p>
                <p className="text-slate-600" style={{ fontSize: "7.5pt" }}>{f.cargo}</p>
                {f.dni && <p className="text-slate-400" style={{ fontSize: "7pt" }}>DNI: {f.dni}</p>}
              </div>
            ))}
          </div>

          <p className="text-center text-slate-400 mt-2" style={{ fontSize: "6.5pt" }}>
            Documento generado el {format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: es })} — Sistema de Recursos Humanos
          </p>
        </div>
      </div>
    </>
  );
}
