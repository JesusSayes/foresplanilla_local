import React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Jornadas del período pendientes de regularización: no se descuentan como falta
 * (marcación incompleta o cobertura pendiente) y requieren revisión manual antes
 * de volver a calcular la planilla.
 */
export default function AbsenceReviewBanner({ pending = [] }) {
  if (!pending || pending.length === 0) return null;

  const totalDays = pending.reduce((sum, item) => sum + (item.days?.length || 0), 0);

  return (
    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            {totalDays} jornada(s) por regularizar en {pending.length} trabajador(es): NO se descontaron como falta
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            Marcación incompleta o cobertura pendiente. Regulárelas en Asistencia → "Regularizar asistencia" y vuelva a calcular la planilla.
          </p>
          <div className="mt-2 space-y-0.5 max-h-32 overflow-y-auto">
            {pending.slice(0, 20).map((item) => (
              <p key={item.employee_id} className="text-xs text-amber-800">
                <span className="font-medium">
                  {item.employee_code} {item.employee_name}
                </span>
                : {item.days.slice(0, 6).map((d) => d.date).join(", ")}
                {item.days.length > 6 ? ` (+${item.days.length - 6})` : ""}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}