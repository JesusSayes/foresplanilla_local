import React from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, XCircle } from "lucide-react";

const displayName = (row) =>
  [row?.raw?.nombres, row?.raw?.ape_paterno].filter(Boolean).join(" ") || "—";

function ReasonTable({ items }) {
  if (!items.length) return null;
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="max-h-56 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Línea</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Doc. Titular</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Doc. DH</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Nombre DH</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Motivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map(({ row, reason }, index) => (
              <tr key={`${row?.lineNumber}-${index}`} className="hover:bg-slate-50">
                <td className="px-3 py-1.5 font-mono text-slate-500">{row?.lineNumber}</td>
                <td className="px-3 py-1.5 font-mono">{row?.raw?.num_titular || "—"}</td>
                <td className="px-3 py-1.5 font-mono">{row?.raw?.num_dhabiente || "—"}</td>
                <td className="px-3 py-1.5">{displayName(row)}</td>
                <td className="px-3 py-1.5 text-red-600">{reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Resumen final: guardados, omitidos y fallidos, con el motivo de cada fila.
export default function DerechohabienteImportResult({ result, onClose }) {
  const { saved, skipped, failed } = result;
  const pending = [...skipped, ...failed];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-7 h-7 text-green-600 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-green-700">{saved.length}</p>
            <p className="text-xs text-green-600">Guardados</p>
          </div>
        </div>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-7 h-7 text-amber-600 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-amber-700">{skipped.length}</p>
            <p className="text-xs text-amber-700">Omitidos</p>
          </div>
        </div>
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
          <XCircle className="w-7 h-7 text-red-600 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-red-700">{failed.length}</p>
            <p className="text-xs text-red-600">Fallidos</p>
          </div>
        </div>
      </div>

      {pending.length > 0 && (
        <div>
          <h4 className="font-semibold text-slate-900 text-sm mb-2">
            Registros no guardados ({pending.length})
          </h4>
          <ReasonTable items={pending} />
        </div>
      )}

      <Button className="w-full" onClick={onClose}>
        Cerrar
      </Button>
    </div>
  );
}