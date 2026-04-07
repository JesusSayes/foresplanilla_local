import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Building2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function PlanillaCompletaView({ grupo, payslips, companyInfo, firmantes, onBack }) {
  const company = companyInfo || { company_name: "Empresa", ruc: "00000000000", address: "Lima, Perú" };

  // Ordenar alfabéticamente por apellido luego por nombre
  const sorted = [...payslips].sort((a, b) => {
    const lastA = (a.employee.last_name || "").toUpperCase();
    const lastB = (b.employee.last_name || "").toUpperCase();
    if (lastA !== lastB) return lastA.localeCompare(lastB, "es");
    const firstA = (a.employee.first_name || "").toUpperCase();
    const firstB = (b.employee.first_name || "").toUpperCase();
    return firstA.localeCompare(firstB, "es");
  });

  const totalIncome = sorted.reduce((s, { payslip: p }) => s + (p.total_income || 0), 0);
  const totalDesc   = sorted.reduce((s, { payslip: p }) => s + (p.total_deductions || 0), 0);
  const totalNeto   = sorted.reduce((s, { payslip: p }) => s + (p.net_pay || 0), 0);
  const totalDias   = sorted.reduce((s, { payslip: p }) => s + (p.worked_days || 0), 0);

  const firmante1 = firmantes?.firmante_gg       || { nombre: "Gerente General",      cargo: "Gerente General" };
  const firmante2 = firmantes?.firmante_delegado || { nombre: "Responsable de RRHH", cargo: "Jefe de Recursos Humanos" };

  return (
    <>
      {/* Forzar orientación horizontal al imprimir */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-page {
            width: 277mm;
            box-sizing: border-box;
          }
          .print-table {
            font-size: 7pt;
            width: 100%;
            border-collapse: collapse;
          }
          .print-table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          .print-table thead {
            display: table-header-group !important;
          }
          .print-table thead tr th {
            background-color: #4338ca !important;
            color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-table tbody tr {
            page-break-inside: avoid;
          }
          .totales-row {
            page-break-inside: avoid;
          }
          .print-header { font-size: 8pt; }
          .firma-section { page-break-inside: avoid; }
        }
      `}</style>

      {/* Barra de acciones */}
      <div className="no-print sticky top-0 z-40 bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />Volver
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">Vista previa de impresión</span>
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />Imprimir Planilla Completa
          </Button>
        </div>
      </div>

      {/* Área imprimible — simulación A4 horizontal */}
      <div className="bg-slate-200 min-h-screen p-6 print:bg-white print:p-0">
        <div
          className="print-page bg-white mx-auto shadow-xl print:shadow-none"
          style={{ width: "277mm", padding: "8mm", boxSizing: "border-box" }}
        >

          {/* ENCABEZADO */}
          <div className="flex items-start justify-between border-b-2 border-indigo-600 pb-3 mb-3 print-header">
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

          {/* RESUMEN KPIs */}
          <div className="grid grid-cols-4 gap-3 mb-3">
            {[
              { label: "N° de Trabajadores", value: sorted.length, prefix: "" },
              { label: "Total Ingresos",     value: totalIncome.toFixed(2), prefix: "S/" },
              { label: "Total Descuentos",   value: totalDesc.toFixed(2),   prefix: "S/" },
              { label: "TOTAL NETO A PAGAR", value: totalNeto.toFixed(2),   prefix: "S/", highlight: true },
            ].map(({ label, value, prefix, highlight }) => (
              <div
                key={label}
                className={`rounded border-2 p-2 text-center ${highlight ? "bg-indigo-50 border-indigo-300" : "bg-slate-50 border-slate-200"}`}
              >
                <p className="text-[9px] text-slate-500 leading-tight">{label}</p>
                <p className={`font-bold text-sm leading-tight ${highlight ? "text-indigo-700" : "text-slate-900"}`}>
                  {prefix} {value}
                </p>
              </div>
            ))}
          </div>

          {/* TABLA DE DETALLE */}
          <div className="overflow-hidden rounded border border-slate-200 mb-3">
            <table className="w-full print-table" style={{ fontSize: "7.5pt", borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  {["#","Código","Apellidos y Nombres","Documento","Cargo","Días","Rem. Básica","Otros Ing.","Total Ing.","AFP/ONP","Otros Desc.","Total Desc.","NETO","Firma"].map(h => (
                    <th key={h} style={{ padding: "4px 6px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap", fontSize: "7pt", backgroundColor: "#4338ca", color: "white" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ payslip: p, employee: emp }, idx) => (
                  <tr key={p.id} style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <td className="px-1.5 py-1 text-slate-400 text-right">{idx + 1}</td>
                    <td className="px-1.5 py-1 font-mono text-slate-700">{emp.employee_code}</td>
                    <td className="px-1.5 py-1 font-medium text-slate-900 whitespace-nowrap">
                      {emp.last_name}, {emp.first_name}
                    </td>
                    <td className="px-1.5 py-1 text-slate-600 whitespace-nowrap">{emp.document_type} {emp.document_number}</td>
                    <td className="px-1.5 py-1 text-slate-600" style={{ maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.position || "—"}</td>
                    <td className="px-1.5 py-1 text-center">{p.worked_days}</td>
                    <td className="px-1.5 py-1 text-right">{(p.base_salary || 0).toFixed(2)}</td>
                    <td className="px-1.5 py-1 text-right">{((p.total_income || 0) - (p.base_salary || 0)).toFixed(2)}</td>
                    <td className="px-1.5 py-1 text-right font-semibold" style={{ color: "#15803d" }}>{(p.total_income || 0).toFixed(2)}</td>
                    <td className="px-1.5 py-1 text-right">{(p.pension_deduction || 0).toFixed(2)}</td>
                    <td className="px-1.5 py-1 text-right">{((p.total_deductions || 0) - (p.pension_deduction || 0)).toFixed(2)}</td>
                    <td className="px-1.5 py-1 text-right font-semibold" style={{ color: "#dc2626" }}>{(p.total_deductions || 0).toFixed(2)}</td>
                    <td className="px-1.5 py-1 text-right font-bold" style={{ color: "#4338ca" }}>{(p.net_pay || 0).toFixed(2)}</td>
                    <td className="px-1.5 py-1">
                      <div style={{ height: "20px", border: "1px dashed #cbd5e1", borderRadius: "3px", minWidth: "50px" }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* TOTALES — fuera del tfoot para que aparezcan SOLO en la última página */}
            <table className="w-full print-table totales-row" style={{ fontSize: "7.5pt", borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                <tr style={{ backgroundColor: "#eef2ff", borderTop: "2px solid #a5b4fc", fontWeight: "bold" }}>
                  <td colSpan={5} className="px-1.5 py-1.5 text-slate-800" style={{ padding: "4px 6px" }}>TOTALES GENERALES</td>
                  <td style={{ padding: "4px 6px", textAlign: "center" }}>{totalDias}</td>
                  <td style={{ padding: "4px 6px", textAlign: "right" }}>{sorted.reduce((s,{payslip:p}) => s+(p.base_salary||0),0).toFixed(2)}</td>
                  <td style={{ padding: "4px 6px", textAlign: "right" }}>{sorted.reduce((s,{payslip:p}) => s+((p.total_income||0)-(p.base_salary||0)),0).toFixed(2)}</td>
                  <td style={{ padding: "4px 6px", textAlign: "right", color: "#15803d" }}>{totalIncome.toFixed(2)}</td>
                  <td style={{ padding: "4px 6px", textAlign: "right" }}>{sorted.reduce((s,{payslip:p}) => s+(p.pension_deduction||0),0).toFixed(2)}</td>
                  <td style={{ padding: "4px 6px", textAlign: "right" }}>{sorted.reduce((s,{payslip:p}) => s+((p.total_deductions||0)-(p.pension_deduction||0)),0).toFixed(2)}</td>
                  <td style={{ padding: "4px 6px", textAlign: "right", color: "#dc2626" }}>{totalDesc.toFixed(2)}</td>
                  <td style={{ padding: "4px 6px", textAlign: "right", color: "#4338ca", fontSize: "9pt" }}>{totalNeto.toFixed(2)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          {/* FIRMAS */}
          <div className="firma-section grid grid-cols-2 gap-12 pt-3 border-t border-slate-200">
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