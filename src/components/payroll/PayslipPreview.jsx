import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FileText, Building2, User, Calendar, Briefcase } from "lucide-react";

export default function PayslipPreview({ payslip, employee, companyInfo }) {
  const company = companyInfo || {
    company_name: "Empresa",
    ruc: "00000000000",
    address: "Lima, Perú"
  };

  return (
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
              <span className="font-semibold text-slate-900">S/ {Number(payslip.base_salary || 0).toFixed(2)}</span>
            </div>
            {payslip.family_allowance > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Asignación Familiar</span>
                <span className="font-semibold text-slate-900">S/ {Number(payslip.family_allowance || 0).toFixed(2)}</span>
              </div>
            )}
            {payslip.overtime_pay > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Horas Extras</span>
                <span className="font-semibold text-slate-900">S/ {Number(payslip.overtime_pay || 0).toFixed(2)}</span>
              </div>
            )}
            {payslip.bonuses > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Bonificaciones</span>
                <span className="font-semibold text-slate-900">S/ {Number(payslip.bonuses || 0).toFixed(2)}</span>
              </div>
            )}
            {payslip.commissions > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Comisiones</span>
                <span className="font-semibold text-slate-900">S/ {Number(payslip.commissions || 0).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-green-200">
              <span className="font-bold text-green-700">TOTAL INGRESOS</span>
              <span className="font-bold text-green-700 text-lg">S/ {Number(payslip.total_income || 0).toFixed(2)}</span>
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
                <span className="font-semibold text-slate-900">S/ {Number(payslip.pension_deduction || 0).toFixed(2)}</span>
              </div>
            )}
            {payslip.health_insurance > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Seguro de Salud</span>
                <span className="font-semibold text-slate-900">S/ {Number(payslip.health_insurance || 0).toFixed(2)}</span>
              </div>
            )}
            {payslip.income_tax > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Impuesto 5ta Categoría</span>
                <span className="font-semibold text-slate-900">S/ {Number(payslip.income_tax || 0).toFixed(2)}</span>
              </div>
            )}
            {payslip.tardiness_discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Descuento por Tardanzas</span>
                <span className="font-semibold text-slate-900">S/ {Number(payslip.tardiness_discount || 0).toFixed(2)}</span>
              </div>
            )}
            {payslip.absence_discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Descuento por Inasistencias</span>
                <span className="font-semibold text-slate-900">S/ {Number(payslip.absence_discount || 0).toFixed(2)}</span>
              </div>
            )}
            {payslip.advance_deduction > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Adelanto Quincenal</span>
                <span className="font-semibold text-slate-900">S/ {Number(payslip.advance_deduction || 0).toFixed(2)}</span>
              </div>
            )}
            {payslip.loan_deduction > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Préstamos</span>
                <span className="font-semibold text-slate-900">S/ {Number(payslip.loan_deduction || 0).toFixed(2)}</span>
              </div>
            )}
            {payslip.other_deductions > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Otros Descuentos</span>
                <span className="font-semibold text-slate-900">S/ {Number(payslip.other_deductions || 0).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-red-200">
              <span className="font-bold text-red-700">TOTAL DESCUENTOS</span>
              <span className="font-bold text-red-700 text-lg">S/ {Number(payslip.total_deductions || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Neto a Pagar */}
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg p-6 border-2 border-indigo-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm mb-1">NETO A PAGAR</p>
              <p className="text-4xl font-bold text-indigo-600">
                S/ {Number(payslip.net_pay || 0).toFixed(2)}
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
                      <span className="font-semibold">S/ {Number(item.amount || 0).toFixed(2)}</span>
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
                      <span className="font-semibold">S/ {Number(item.amount || 0).toFixed(2)}</span>
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
  );
}
