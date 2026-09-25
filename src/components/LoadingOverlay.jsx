import React from "react";

/**
 * Overlay de carga a pantalla completa con spinner y mensaje.
 * Se muestra por encima de todo el contenido (z-[200]) para indicar
 * que hay un proceso de consulta/procesamiento en curso.
 *
 * @param {boolean} isLoading - Si se muestra el overlay.
 * @param {string}  message   - Mensaje a mostrar bajo el spinner.
 */
export default function LoadingOverlay({ isLoading, message = "Cargando información, espere..." }) {
  if (!isLoading) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 bg-white rounded-2xl shadow-2xl px-10 py-8">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-700 text-center max-w-xs">
          {message}
        </p>
      </div>
    </div>
  );
}