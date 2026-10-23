import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Edit2, Eye } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import ConceptsManager from "@/components/payroll/ConceptsManager";

/**
 * Tarjeta de un trabajador en la vista previa de planilla: sus conceptos, montos,
 * avisos de cálculo y de contrato. Presentacional; la lógica vive en la página.
 */
export default function PayrollPreviewCard({
  payslip,
  emp,
  payrollConcepts = [],
  additionalConcepts = [],
  canViewAmounts,
  selectedMonth,
  selectedYear,
  contractAlert,
  showConcepts,
  onToggleConcepts,
  onAddConcept,
  onRemoveConcept,
  onRemoveEmployee,
  onViewPayslip,
  onRecalculate,
}) {
  const empConcepts = [...payrollConcepts, ...additionalConcepts].filter(
    (c) => c.employee_id === payslip.employee_id
  );
  const hasAdditionalConcepts = empConcepts.length > 0;
  const hasCalculationErrors = payslip.has_errors;
  const hasMissingSalary = !payslip.base_salary || payslip.base_salary === 0;

  const currentSalary = emp ? parseFloat(emp.base_salary) || 0 : 0;
  const usedSalary = parseFloat(payslip.base_salary) || 0;
  const showContractSalaryNote =
    canViewAmounts && currentSalary > 0 && usedSalary > 0 && Math.abs(currentSalary - usedSalary) > 0.01;

  return (
    <div
      className={`p-4 border rounded-lg ${
        contractAlert || hasMissingSalary
          ? "border-orange-400 bg-orange-50"
          : hasCalculationErrors
          ? "border-red-300 bg-red-50"
          : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-slate-900">
              {emp?.document_type} {emp?.document_number} - {payslip.employee_name}
            </h4>
            <Button size="sm" variant="outline" onClick={onToggleConcepts}>
              <Edit2 className="w-3 h-3 mr-1" />
              Conceptos
            </Button>
            <Button size="sm" variant="outline" onClick={onViewPayslip} className="bg-blue-50 hover:bg-blue-100">
              <Eye className="w-3 h-3 mr-1" />
              Ver Boleta
            </Button>
            <Button size="sm" variant="outline" onClick={onRemoveEmployee} className="text-red-600 hover:bg-red-50">
              ✕ Quitar
            </Button>
          </div>
          <p className="text-sm text-slate-600">{payslip.department}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge className="bg-indigo-100 text-indigo-700">{payslip.worked_days} días</Badge>
          {contractAlert && (
            <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px]">
              Sin contrato vigente
            </Badge>
          )}
        </div>
      </div>

      {showConcepts && (
        <div className="mb-3">
          <ConceptsManager
            employeeId={payslip.employee_id}
            employeeName={payslip.employee_name}
            month={selectedMonth}
            year={selectedYear}
            concepts={additionalConcepts}
            onAdd={onAddConcept}
            onRemove={(idx) => {
              onRemoveConcept(idx);
              setTimeout(() => onRecalculate(), 100);
            }}
          />
        </div>
      )}

      {canViewAmounts ? (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-600">Salario Base</p>
            <p className="font-semibold text-slate-900">S/ {payslip.base_salary.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-slate-600">Total Ingresos</p>
            <p className="font-semibold text-green-600">S/ {payslip.total_income.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-slate-600">Descuentos</p>
            <p className="font-semibold text-red-600">-S/ {payslip.total_deductions.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-slate-600 font-bold">Neto a Pagar</p>
            <p className="font-bold text-indigo-600 text-lg">S/ {payslip.net_pay.toFixed(2)}</p>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-slate-100 rounded-lg text-center">
          <p className="text-sm text-slate-600">🔒 Sin permisos para ver montos</p>
        </div>
      )}

      {showContractSalaryNote && (
        <div className="mt-3 p-2 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>
            <strong>Salario del contrato del período:</strong> S/ {usedSalary.toFixed(2)}{" "}
            (vigente en {format(new Date(selectedYear, selectedMonth - 1), "MMMM yyyy", { locale: es })}).{" "}
            Salario actual: S/ {currentSalary.toFixed(2)}
          </span>
        </div>
      )}

      {contractAlert && (
        <div className="mt-3 p-2 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            <strong>Sin contrato aprobado (Vigente) para el período.</strong> {contractAlert.detail}
          </span>
        </div>
      )}

      {payslip.advance_deduction > 0 && (
        <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
          Adelanto descontado: S/ {payslip.advance_deduction.toFixed(2)}
        </div>
      )}

      {payslip.loan_deduction > 0 && (
        <div className="mt-3 p-2 bg-purple-50 border border-purple-200 rounded text-sm text-purple-800">
          Cuota de préstamo descontada: S/ {payslip.loan_deduction.toFixed(2)}
        </div>
      )}

      {payslip.non_worked_days > 0 && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
          <strong>Descuento por faltas:</strong> {payslip.non_worked_days} día(s) sin marcaciones
          {canViewAmounts ? ` — S/ ${(payslip.absence_discount || 0).toFixed(2)}` : ""}
        </div>
      )}

      {hasAdditionalConcepts && (
        <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
          ✓ {empConcepts.length} concepto(s) adicional(es) aplicado(s)
        </div>
      )}

      {hasMissingSalary && (
        <div className="mt-3 p-2 bg-orange-50 border border-orange-400 rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
          <p className="text-xs font-semibold text-orange-800">
            ⚠️ Este empleado no tiene salario base ni contrato aprobado con remuneración. El cálculo
            resultará en S/ 0.00. Registre o apruebe el contrato del período.
          </p>
        </div>
      )}

      {hasCalculationErrors && (
        <div className="mt-3 p-2 bg-red-50 border border-red-300 rounded">
          <p className="text-xs font-semibold text-red-800 mb-1">⚠️ Errores en el cálculo:</p>
          {payslip.errors.map((err, idx) => (
            <p key={idx} className="text-xs text-red-700">
              • {err.formula}: {err.error}
            </p>
          ))}
        </div>
      )}

      {payslip.calculation_summary && (
        <details className="mt-3">
          <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-900">
            Ver resumen detallado de cálculos
          </summary>
          <div className="mt-2 p-3 bg-slate-50 rounded text-xs space-y-2">
            <div>
              <p className="font-semibold text-slate-900 mb-1">
                Ingresos ({payslip.calculation_summary.breakdown.incomes.count}):
              </p>
              {payslip.calculation_summary.breakdown.incomes.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-slate-700 ml-2">
                  <span>
                    {item.name} {item.formula && `(${item.formula})`}
                  </span>
                  <span className="font-semibold">S/ {item.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="font-semibold text-slate-900 mb-1">
                Descuentos ({payslip.calculation_summary.breakdown.deductions.count}):
              </p>
              {payslip.calculation_summary.breakdown.deductions.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-slate-700 ml-2">
                  <span>
                    {item.name} {item.formula && `(${item.formula})`}
                  </span>
                  <span className="font-semibold">S/ {item.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
            {payslip.calculation_summary.breakdown.contributions.count > 0 && (
              <div>
                <p className="font-semibold text-slate-900 mb-1">
                  Aportes Empleador ({payslip.calculation_summary.breakdown.contributions.count}):
                </p>
                {payslip.calculation_summary.breakdown.contributions.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-slate-700 ml-2">
                    <span>
                      {item.name} {item.formula && `(${item.formula})`}
                    </span>
                    <span className="font-semibold">S/ {item.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}