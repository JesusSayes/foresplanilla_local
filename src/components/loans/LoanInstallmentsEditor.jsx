import React from "react";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { format, addMonths } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Editor de cuotas del préstamo.
 * Muestra cada cuota con su monto editable y, al final, la suma NO editable de
 * las cuotas contrastada contra el monto total del préstamo.
 */
export default function LoanInstallmentsEditor({ amounts, startDate, totalAmount, onChange }) {
  if (!amounts || amounts.length === 0) return null;

  const sum = amounts.reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const matches = Math.abs(sum - totalAmount) < 0.005;
  const difference = sum - totalAmount;
  const start = startDate ? new Date(startDate) : new Date();

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50 rounded-t-lg">
        <p className="text-sm font-semibold text-slate-900">Cuotas del préstamo</p>
        <p className="text-xs text-slate-500">Los montos son editables</p>
      </div>

      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
        {amounts.map((value, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-2">
            <span className="text-xs font-semibold text-slate-500 w-16 shrink-0">
              Cuota {index + 1}
            </span>
            <span className="text-xs text-slate-600 w-24 shrink-0 capitalize">
              {format(addMonths(start, index), "MMM yyyy", { locale: es })}
            </span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => onChange(index, e.target.value)}
              className="h-8 text-sm text-right"
            />
          </div>
        ))}
      </div>

      <div className="border-t bg-slate-50 rounded-b-lg px-4 py-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">Monto total del préstamo</span>
          <span className="font-mono font-semibold text-slate-900">S/ {totalAmount.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">Suma de cuotas (no editable)</span>
          <span className={`font-mono font-semibold ${matches ? "text-green-700" : "text-red-600"}`}>
            S/ {sum.toFixed(2)}
          </span>
        </div>

        {matches ? (
          <div className="flex items-center gap-2 text-xs text-green-700 pt-1">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            La suma de las cuotas coincide con el monto total del préstamo.
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-red-600 pt-1">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Diferencia de S/ {Math.abs(difference).toFixed(2)} ({difference > 0 ? "exceso" : "faltante"}). Ajusta las cuotas para igualar el monto total.
          </div>
        )}
      </div>
    </div>
  );
}