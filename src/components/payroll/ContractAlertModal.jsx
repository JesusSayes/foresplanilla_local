import React from "react";
import { AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Confirmación previa a generar la planilla cuando hay trabajadores sin contrato
 * aprobado (Vigente) aplicable al período o con contratos superpuestos. Nada se
 * persiste hasta que el usuario confirma explícitamente.
 */
export default function ContractAlertModal({
  noApproved = [],
  conflicts = [],
  employeesCount = 0,
  isSaving = false,
  onConfirm,
  onCancel,
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Revisar contratos antes de generar</h2>
              <p className="text-sm text-slate-500">
                La remuneración básica se toma del contrato aprobado (Vigente) del período.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {noApproved.length > 0 && (
            <div>
              <p className="text-sm font-bold text-slate-900 mb-2">
                Sin contrato aprobado para el período ({noApproved.length})
              </p>
              <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 border border-amber-200 rounded-lg bg-amber-50">
                {noApproved.map((w) => (
                  <div key={w.employee_id} className="px-3 py-2">
                    <p className="text-sm font-semibold text-slate-800">
                      {w.employee_code} — {w.employee_name}
                    </p>
                    <p className="text-xs text-amber-800">{w.detail}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Revise el sueldo del contrato disponible del período o de la ficha. Si no es correcto, apruebe
                el contrato del período y vuelva a calcular.
              </p>
            </div>
          )}

          {conflicts.length > 0 && (
            <div>
              <p className="text-sm font-bold text-slate-900 mb-2">
                Contratos superpuestos en el período ({conflicts.length})
              </p>
              <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 border border-amber-200 rounded-lg bg-amber-50">
                {conflicts.map((c, idx) => (
                  <div key={idx} className="px-3 py-2">
                    <p className="text-xs text-amber-800">{c.detail}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Se usó el contrato con fecha de inicio más reciente. Depure los contratos superpuestos para
                evitar importes incorrectos.
              </p>
            </div>
          )}
        </div>

        <div className="p-6 pt-0 flex flex-col sm:flex-row gap-3 sm:justify-end">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isSaving}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {isSaving ? "Generando..." : `Continuar y generar ${employeesCount} boleta(s)`}
          </Button>
        </div>
      </div>
    </div>
  );
}