import React from "react";
import { AlertCircle } from "lucide-react";

/**
 * Aviso, en la vista previa de planilla, de los trabajadores que no generan boleta
 * por validación pensionaria: datos de afiliación AFP/ONP incompletos o conceptos
 * pensionarios ambiguos. Se muestra el motivo y dónde corregirlo.
 */
export default function PensionBlockedBanner({ workers = [] }) {
  if (workers.length === 0) return null;

  return (
    <div className="mb-4 p-4 bg-red-50 border border-red-300 rounded-lg space-y-2">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
        <p className="text-sm font-bold text-red-900">
          {workers.length} trabajador(es) sin boleta en esta planilla por validación AFP/ONP
        </p>
      </div>
      <ul className="space-y-1 max-h-48 overflow-y-auto">
        {workers.map((w) => (
          <li key={w.employee_id} className="text-xs text-red-800">
            • <span className="font-semibold">{w.employee_code} - {w.employee_name}</span>: {w.detail}
          </li>
        ))}
      </ul>
      <p className="text-xs text-red-700">
        Corrija la afiliación del trabajador en Gestión de Empleados (sistema de pensiones, AFP afiliada,
        tipo de comisión y CUSPP), configure el % de comisión mixta de la AFP en Datos Maestros, o elimine
        el concepto pensionario ambiguo en Conceptos de Planilla. Luego vuelva a calcular.
      </p>
    </div>
  );
}