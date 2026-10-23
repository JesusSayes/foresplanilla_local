import React from "react";
import { AlertCircle } from "lucide-react";

/**
 * Aviso de inconsistencias de contrato en la vista previa de planilla:
 * trabajadores sin contrato aprobado (estado Vigente) aplicable al período y
 * trabajadores con contratos superpuestos.
 */
export default function ContractAlertBanner({ noApproved = [], conflicts = [] }) {
  if (noApproved.length === 0 && conflicts.length === 0) return null;

  return (
    <div className="mb-4 p-4 bg-amber-50 border border-amber-300 rounded-lg space-y-3">
      {noApproved.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-sm font-bold text-amber-900">
              {noApproved.length} trabajador(es) sin contrato aprobado (Vigente) para este período
            </p>
          </div>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {noApproved.map((w) => (
              <li key={w.employee_id} className="text-xs text-amber-800">
                • <span className="font-semibold">{w.employee_code} - {w.employee_name}</span>: {w.detail}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-700 mt-2">
            Su remuneración básica se toma del último contrato aprobado registrado. Confirme la generación
            solo si el importe es correcto.
          </p>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="pt-3 border-t border-amber-200">
          <p className="text-sm font-bold text-amber-900 mb-1">
            {conflicts.length} trabajador(es) con contratos superpuestos en el período
          </p>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {conflicts.map((c, idx) => (
              <li key={idx} className="text-xs text-amber-800">• {c.detail}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}