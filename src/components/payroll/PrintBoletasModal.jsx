import React, { useState } from "react";
import { Printer, Copy, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Modal para elegir el formato de impresión masiva de boletas:
 *  - 1 copia (A4 vertical / portrait)
 *  - 2 copias (A4 horizontal / landscape)
 * Mismas opciones que la vista individual de PayslipPreview.
 */
export default function PrintBoletasModal({ grupo, onPrint, onClose }) {
  const [copies, setCopies] = useState(1);
  const [printing, setPrinting] = useState(false);

  const handlePrint = () => {
    setPrinting(true);
    try {
      onPrint(copies);
    } finally {
      setTimeout(() => setPrinting(false), 800);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Printer className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Imprimir Boletas</h2>
            <p className="text-sm text-slate-500">
              {grupo?.payslips?.length || 0} boleta(s) · {grupo?.period || ""} · {grupo?.payroll_type || ""}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">Selecciona el formato de impresión:</p>

          <button
            onClick={() => setCopies(1)}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
              copies === 1
                ? "border-indigo-500 bg-indigo-50"
                : "border-slate-200 hover:border-indigo-300"
            }`}
          >
            <div className={`p-2 rounded-lg ${copies === 1 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-slate-900">1 copia — A4 vertical</div>
              <div className="text-xs text-slate-500">Una boleta por hoja, orientación retrato</div>
            </div>
            {copies === 1 && (
              <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
          </button>

          <button
            onClick={() => setCopies(2)}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
              copies === 2
                ? "border-indigo-500 bg-indigo-50"
                : "border-slate-200 hover:border-indigo-300"
            }`}
          >
            <div className={`p-2 rounded-lg ${copies === 2 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
              <Copy className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-slate-900">2 copias — A4 horizontal</div>
              <div className="text-xs text-slate-500">Dos boletas por hoja, orientación paisaje</div>
            </div>
            {copies === 2 && (
              <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
          </button>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            onClick={handlePrint}
            disabled={printing}
          >
            {printing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Printer className="w-4 h-4 mr-2" />
            )}
            Imprimir
          </Button>
        </div>
      </div>
    </div>
  );
}