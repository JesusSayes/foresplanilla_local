import React from "react";
import {
  FIELD_SPECS,
  DOC_TYPE_CODES,
  SEX_CODES,
  RELATIONSHIP_CODES,
} from "@/lib/derechohabienteTemplate";

// Guía visual del formato TXT de derechohabientes realmente aceptado.
export default function DerechohabienteImportGuide() {
  return (
    <div className="space-y-4 text-sm">
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
        <p className="text-slate-700 leading-relaxed">
          <strong>Formato:</strong> el archivo TXT que descarga RR.HH. (24 columnas separadas por{" "}
          <code className="bg-slate-200 px-1 rounded">|</code>) se importa tal cual, sin editarlo ni
          convertirlo. Cada registro puede terminar con un{" "}
          <code className="bg-slate-200 px-1 rounded">|</code> adicional: se tolera y no cuenta como
          columna. El encabezado es opcional y se reconoce automáticamente.
        </p>
        <ul className="list-disc ml-5 mt-2 text-xs text-slate-600 space-y-0.5">
          <li>Codificación: UTF-8 o Windows-1252/Latin-1 (se detecta al leer el archivo).</li>
          <li>Fin de línea Windows (CRLF) o Unix (LF), con o sin BOM.</li>
          <li>Fechas <strong>DD/MM/YYYY</strong> y deben existir en el calendario.</li>
          <li>
            Documentos, teléfonos, mes de concepción y códigos se guardan como{" "}
            <strong>texto</strong>: se conservan los ceros iniciales.
          </li>
          <li>
            País y ubigeo se guardan tal como vienen (<code>PERÚ</code>,{" "}
            <code>DEPARTAMENTO-PROVINCIA-DISTRITO</code>); no se exige código numérico ni se inventa
            uno.
          </li>
          <li>Las líneas vacías se ignoran y los errores se informan con su número de línea.</li>
        </ul>
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
                          f.req === "Obligatorio" ? "text-red-600 font-medium" : "text-slate-500"
                        }
                      >
                        {f.req}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-slate-600">{f.format}</td>
                    <td className="px-2 py-1.5 font-mono text-slate-500">{f.example || "—"}</td>
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

      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-900 space-y-1">
        <p className="font-semibold">Antes de importar</p>
        <p>
          El derechohabiente se vincula al titular por su número de documento (y por el tipo cuando
          hay más de un empleado con el mismo número). Los titulares inexistentes, las coincidencias
          ambiguas y los registros ya guardados se omiten y se informan; no se crean empleados ni se
          desactivan derechohabientes que no aparezcan en el archivo.
        </p>
      </div>
    </div>
  );
}