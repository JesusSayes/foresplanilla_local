import React from "react";
import {
  FIELD_SPECS,
  DOC_TYPE_CODES,
  SEX_CODES,
  RELATIONSHIP_CODES,
} from "@/lib/derechohabienteTemplate";

// Guía visual de campos del formato TXT de derechohabientes.
// Muestra posición, nombre, obligatoriedad, formato y ejemplo de cada campo,
// más los códigos admitidos para tipo de documento, sexo y vínculo familiar.
export default function DerechohabienteImportGuide() {
  return (
    <div className="space-y-4 text-sm">
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
        <p className="text-slate-700 leading-relaxed">
          <strong>Formato:</strong> TXT con separador{" "}
          <code className="bg-slate-200 px-1 rounded">|</code> (pipe), codificación{" "}
          <strong>Latin1 (ISO-8859-1)</strong>. La primera línea es un encabezado y
          se ignora al importar. Las fechas usan el formato{" "}
          <strong>DD/MM/YYYY</strong>. Los apellidos paterno y materno van en
          columnas independientes. Conserve los ceros iniciales de los números de
          documento.
        </p>
      </div>

      <div>
        <h4 className="font-semibold text-slate-900 mb-2">
          Especificación de campos (24 columnas)
        </h4>
        <div className="border rounded-lg overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold text-slate-600">#</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Campo</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Oblig.</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Formato</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Ejemplo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {FIELD_SPECS.map((f) => (
                  <tr key={f.key} className="hover:bg-slate-50">
                    <td className="px-2 py-1.5 text-slate-500 font-mono">{f.pos}</td>
                    <td className="px-2 py-1.5 font-medium text-slate-800">{f.name}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={
                          f.req === "Obligatorio"
                            ? "text-red-600 font-medium"
                            : "text-slate-500"
                        }
                      >
                        {f.req}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-slate-600">{f.format}</td>
                    <td className="px-2 py-1.5 font-mono text-slate-500">
                      {f.example || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <h4 className="font-semibold text-slate-900 mb-1.5">Tipo de documento</h4>
          <ul className="text-xs space-y-0.5">
            {DOC_TYPE_CODES.map((c) => (
              <li key={c.code}>
                <code className="bg-slate-100 px-1 rounded">{c.code}</code> — {c.desc}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-slate-900 mb-1.5">Sexo</h4>
          <ul className="text-xs space-y-0.5">
            {SEX_CODES.map((c) => (
              <li key={c.code}>
                <code className="bg-slate-100 px-1 rounded">{c.code}</code> — {c.desc}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-slate-900 mb-1.5">Vínculo familiar</h4>
          <ul className="text-xs space-y-0.5">
            {RELATIONSHIP_CODES.map((c) => (
              <li key={c.code}>
                <code className="bg-slate-100 px-1 rounded">{c.code}</code> — {c.desc}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}