import React from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, Copy, SearchX } from "lucide-react";

const MAX_ROWS_VISIBLE = 200;

const displayName = (row) =>
  [row?.raw?.nombres, row?.raw?.ape_paterno].filter(Boolean).join(" ") || "—";

function RowTable({ items, reasonClass }) {
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
            {items.slice(0, MAX_ROWS_VISIBLE).map(({ row, reason }, index) => (
              <tr key={`${row?.lineNumber}-${index}`} className="hover:bg-slate-50">
                <td className="px-3 py-1.5 font-mono text-slate-500">{row?.lineNumber}</td>
                <td className="px-3 py-1.5 font-mono">{row?.raw?.num_titular || "—"}</td>
                <td className="px-3 py-1.5 font-mono">{row?.raw?.num_dhabiente || "—"}</td>
                <td className="px-3 py-1.5">{displayName(row)}</td>
                <td className={`px-3 py-1.5 ${reasonClass}`}>{reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length > MAX_ROWS_VISIBLE && (
          <p className="text-xs text-slate-500 text-center py-2">
            ... y {items.length - MAX_ROWS_VISIBLE} registros más
          </p>
        )}
      </div>
    </div>
  );
}

function Section({ title, count, icon: Icon, tone, items }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${tone.icon}`} />
        <h4 className="font-semibold text-slate-900 text-sm">
          {title} ({count})
        </h4>
      </div>
      <RowTable items={items} reasonClass={tone.text} />
    </div>
  );
}

// Vista previa: qué se importará y qué queda fuera, con el motivo de cada fila.
export default function DerechohabientePreviewPanel({
  parsed,
  classification,
  processing,
  onImport,
  onReset,
}) {
  const { valid, duplicates, missingTitular, invalid } = classification;
  const excluded = duplicates.length + missingTitular.length + invalid.length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <p className="text-xl font-bold text-slate-900">{parsed.dataLineCount}</p>
          <p className="text-xs text-slate-600">Registros leídos</p>
        </div>
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-xl font-bold text-green-700">{valid.length}</p>
          <p className="text-xs text-green-700">Válidos</p>
        </div>
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xl font-bold text-amber-700">{duplicates.length}</p>
          <p className="text-xs text-amber-700">Duplicados</p>
        </div>
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xl font-bold text-red-700">{missingTitular.length + invalid.length}</p>
          <p className="text-xs text-red-700">Con problemas</p>
        </div>
      </div>

      {valid.length > 0 && (
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <p className="text-sm text-slate-700">
            Se importarán <strong>{valid.length}</strong> registro(s).
            {excluded > 0 && ` Se excluirán ${excluded} por los motivos que se detallan abajo.`}
          </p>
        </div>
      )}

      <Section title="Duplicados (se omiten)" count={duplicates.length} icon={Copy} tone={{ icon: "text-amber-500", text: "text-amber-700" }} items={duplicates} />
      <Section title="Titular no encontrado (se omiten)" count={missingTitular.length} icon={SearchX} tone={{ icon: "text-orange-500", text: "text-orange-700" }} items={missingTitular} />
      <Section title="Errores por línea (se omiten)" count={invalid.length} icon={AlertCircle} tone={{ icon: "text-red-500", text: "text-red-600" }} items={invalid} />

      {valid.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          Ningún registro puede importarse con el archivo actual. Revise los motivos indicados.
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <Button variant="outline" className="flex-1" onClick={onReset} disabled={processing}>
          Cambiar archivo
        </Button>
        <Button
          className="flex-1 bg-indigo-600 hover:bg-indigo-700"
          onClick={onImport}
          disabled={processing || valid.length === 0}
        >
          {processing ? "Importando..." : `Importar ${valid.length} registro(s) válidos`}
        </Button>
      </div>
    </div>
  );
}