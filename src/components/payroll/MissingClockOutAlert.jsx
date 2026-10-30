import React from "react";
import { Clock } from "lucide-react";

/**
 * Jornadas con entrada registrada pero sin marcación de salida. La marcación debe
 * regularizarse, pero NO impide descontar las horas aprobadas de la justificación:
 * no se descuenta un día completo, solo el tiempo autorizado.
 */
export default function MissingClockOutAlert({ rows = [] }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
      <div className="flex items-start gap-2">
        <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            Debe registrar o regularizar la marcación de salida en {rows.length} jornada(s)
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            Las horas aprobadas de la justificación sí se descontaron. No se descuenta un día completo: solo el tiempo autorizado.
          </p>
          <div className="mt-2 space-y-0.5 max-h-32 overflow-y-auto">
            {rows.slice(0, 20).map((row) => (
              <p key={`${row.employee_id}|${row.date}`} className="text-xs text-amber-800">
                <span className="font-medium">
                  {row.employee_code} {row.employee_name}
                </span>
                : {row.date}
                {row.hours ? ` · ${row.hours.toFixed(2)} h aprobadas (${(row.types || []).join(", ")})` : ""}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}