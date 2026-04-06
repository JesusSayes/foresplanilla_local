import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Printer, Building2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function PlanillaCompletaView({ grupo, payslips, companyInfo, firmantes, onBack }) {
  const company = companyInfo || { company_name: "Empresa", ruc: "00000000000", address: "Lima, Perú" };
  const totalIncome    = payslips.reduce((s, {payslip: p}) => s + (p.total_income || 0), 0);
  const totalDesc      = payslips.reduce((s, {payslip: p}) => s + (p.total_deductions || 0), 0);
  const totalNeto      = payslips.reduce((s, {payslip: p}) => s + (p.net_pay || 0), 0);
  const totalDias      = payslips.reduce((s, {payslip: p}) => s + (p.worked_days || 0), 0);

  const firmante1 = firmantes?.gerente_general || { nombre: "Gerente General", cargo: "Gerente General" };
  const firmante2 = firmantes?.delegado       || { nombre: "Responsable RRHH", cargo: "Jefe de Recursos Humanos" };

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Barra de acciones — no se imprime */}
      <div className="print:hidden sticky top-0 z-40 bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between">
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

      {/* Contenido imprimible */}
      <div className="max-w-[900px] mx-auto p-6 print:p-0 print:max-w-none space-y-0">

        {/* ENCABEZADO PLANILLA */}
        <div className="bg-white rounded-xl shadow-lg print:shadow-none print:rounded-none p-8 mb-6 print:mb-4">
          {/* Logo y datos empresa */}
          <div className="flex items-start justify-between border-b-2 border-indigo-600 pb-6 mb-6">
            <div className="flex items-center gap-4">
              {company.logo_url ? (
                <img src={company.logo_url} alt="Logo" className="w-20 h-20 object-contain rounded-lg border" />
              ) : (
                <div className="w-20 h-20 bg-indigo-50 rounded-lg flex items-center justify-center border-2 border-indigo-200">
                  <Building2 className="w-10 h-10 text-indigo-400" />
                </div>
              )}
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{company.company_name}</h2>
                <p className="text-slate-600">RUC: {company.ruc}</p>
                <p className="text-slate-500 text-sm">{company.address}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="bg-indigo-600 text-white px-5 py-2 rounded-lg mb-2">
                <h3 className="font-bold text-lg">PLANILLA DE REMUNERACIONES</h3>
              </div>
              <p className="text-slate-700 font-semibold text-lg capitalize">{grupo.period}</p>
              <p className="text-slate-500 text-sm">Tipo: {grupo.payroll_type}</p>
              <p className="text-slate-500 text-sm">N° {grupo.payroll_number}</p>
            </div>
          </div>

          {/* Resumen cabecera */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "N° de Trabajadores", value: payslips.length, unit: "" },
              { label: "Total Ingresos", value: totalIncome.toFixed(2), unit: "S/" },
              { label: "Total Descuentos", value: totalDesc.toFixed(2), unit: "S/" },
              { label: "TOTAL NETO A PAGAR", value: totalNeto.toFixed(2), unit: "S/", highlight: true },
            ].map(({ label, value, unit, highlight }) => (
              <div
                key={label}
                className={`rounded-lg p-4 text-center border-2 ${highlight ? "bg-indigo-50 border-indigo-300" : "bg-slate-50 border-slate-200"}`}
              >
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className={`font-bold text-lg ${highlight ? "text-indigo-700" : "text-slate-900"}`}>
                  {unit} {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* TABLA DE DETALLE */}
        <div className="bg-white rounded-xl shadow-lg print:shadow-none print:rounded-none overflow-hidden mb-6 print:mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-indigo-600 text-white">
                <th className="px-3 py-3 text-left font-semibold">#</th>
                <th className="px-3 py-3 text-left font-semibold">Código</th>
                <th className="px-3 py-3 text-left font-semibold">Apellidos y Nombres</th>
                <th className="px-3 py-3 text-left font-semibold">Documento</th>
                <th className="px-3 py-3 text-left font-semibold">Cargo</th>
                <th className="px-2 py-3 text-center font-semibold">Días</th>
                <th className="px-2 py-3 text-right font-semibold">Rem. Básica</th>
                <th className="px-2 py-3 text-right font-semibold">Otros Ing.</th>
                <th className="px-2 py-3 text-right font-semibold">Total Ing.</th>
                <th className="px-2 py-3 text-right font-semibold">AFP/ONP</th>
                <th className="px-2 py-3 text-right font-semibold">Otros Desc.</th>
                <th className="px-2 py-3 text-right font-semibold">Total Desc.</th>
                <th className="px-3 py-3 text-right font-bold">NETO</th>
                <th className="px-3 py-3 text-center font-semibold">Firma</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map(({ payslip: p, employee: emp }, idx) => (
                <tr key={p.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                  <td className="px-3 py-3 text-slate-400">{idx + 1}</td>
                  <td className="px-3 py-3 font-mono text-slate-700">{emp.employee_code}</td>
                  <td className="px-3 py-3 font-medium text-slate-900 whitespace-nowrap">
                    {emp.last_name}, {emp.first_name}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{emp.document_type} {emp.document_number}</td>
                  <td className="px-3 py-3 text-slate-600 max-w-[100px] truncate">{emp.position || "—"}</td>
                  <td className="px-2 py-3 text-center">{p.worked_days}</td>
                  <td className="px-2 py-3 text-right">{(p.base_salary || 0).toFixed(2)}</td>
                  <td className="px-2 py-3 text-right">
                    {((p.total_income || 0) - (p.base_salary || 0)).toFixed(2)}
                  </td>
                  <td className="px-2 py-3 text-right text-green-700 font-semibold">
                    {(p.total_income || 0).toFixed(2)}
                  </td>
                  <td className="px-2 py-3 text-right">{(p.pension_deduction || 0).toFixed(2)}</td>
                  <td className="px-2 py-3 text-right">
                    {((p.total_deductions || 0) - (p.pension_deduction || 0)).toFixed(2)}
                  </td>
                  <td className="px-2 py-3 text-right text-red-600 font-semibold">
                    {(p.total_deductions || 0).toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-indigo-700 text-sm">
                    {(p.net_pay || 0).toFixed(2)}
                  </td>
                  {/* Celda de firma */}
                  <td className="px-3 py-3">
                    <div className="h-10 border border-dashed border-slate-300 rounded flex items-end justify-center pb-1 min-w-[70px]">
                      {p.firma_empleado_url ? (
                        <img src={p.firma_empleado_url} alt="firma" className="max-h-8 object-contain" />
                      ) : (
                        <span className="text-slate-300 text-[9px]">firma</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-indigo-50 border-t-2 border-indigo-300 font-bold">
                <td colSpan={5} className="px-3 py-3 text-sm text-slate-800">TOTALES GENERALES</td>
                <td className="px-2 py-3 text-center text-sm">{totalDias}</td>
                <td className="px-2 py-3 text-right text-sm">
                  {payslips.reduce((s,{payslip:p}) => s + (p.base_salary||0), 0).toFixed(2)}
                </td>
                <td className="px-2 py-3 text-right text-sm">
                  {payslips.reduce((s,{payslip:p}) => s + ((p.total_income||0)-(p.base_salary||0)), 0).toFixed(2)}
                </td>
                <td className="px-2 py-3 text-right text-green-700 text-sm">{totalIncome.toFixed(2)}</td>
                <td className="px-2 py-3 text-right text-sm">
                  {payslips.reduce((s,{payslip:p}) => s + (p.pension_deduction||0), 0).toFixed(2)}
                </td>
                <td className="px-2 py-3 text-right text-sm">
                  {payslips.reduce((s,{payslip:p}) => s + ((p.total_deductions||0)-(p.pension_deduction||0)), 0).toFixed(2)}
                </td>
                <td className="px-2 py-3 text-right text-red-600 text-sm">{totalDesc.toFixed(2)}</td>
                <td className="px-3 py-3 text-right text-indigo-700 text-base">{totalNeto.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* SECCIÓN DE FIRMAS */}
        <div className="bg-white rounded-xl shadow-lg print:shadow-none print:rounded-none p-8">
          <p className="text-sm text-slate-500 mb-8 text-center italic">
            Los firmantes abajo indicados dan conformidad al presente documento
          </p>
          <div className="grid grid-cols-2 gap-16">
            {/* Firmante 1: Gerente General */}
            <div className="text-center">
              {firmante1.firma_url ? (
                <img
                  src={firmante1.firma_url}
                  alt="Firma GG"
                  className="mx-auto mb-2 max-h-20 object-contain"
                />
              ) : (
                <div className="h-20 border-b-2 border-slate-400 mx-4 mb-2" />
              )}
              <p className="font-bold text-slate-900">{firmante1.nombre || "Gerente General"}</p>
              <p className="text-sm text-slate-600">{firmante1.cargo || "Gerente General"}</p>
              {firmante1.dni && <p className="text-xs text-slate-400 mt-1">DNI: {firmante1.dni}</p>}
            </div>
            {/* Firmante 2: Delegado */}
            <div className="text-center">
              {firmante2.firma_url ? (
                <img
                  src={firmante2.firma_url}
                  alt="Firma Delegado"
                  className="mx-auto mb-2 max-h-20 object-contain"
                />
              ) : (
                <div className="h-20 border-b-2 border-slate-400 mx-4 mb-2" />
              )}
              <p className="font-bold text-slate-900">{firmante2.nombre || "Responsable de RRHH"}</p>
              <p className="text-sm text-slate-600">{firmante2.cargo || "Jefe de Recursos Humanos"}</p>
              {firmante2.dni && <p className="text-xs text-slate-400 mt-1">DNI: {firmante2.dni}</p>}
            </div>
          </div>
          <p className="text-xs text-slate-400 text-center mt-8">
            Documento generado el {format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: es })} — Sistema de Recursos Humanos
          </p>
        </div>
      </div>
    </div>
  );
}