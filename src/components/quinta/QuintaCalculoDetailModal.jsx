import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/payrollUtils";

export default function QuintaCalculoDetailModal({ calculo, employeeName, onApprove, onApplyManual, onRevert, onCancel, canApprove }) {
  const [manualMode, setManualMode] = useState(false);
  const [manualAmount, setManualAmount] = useState("");
  const [manualReason, setManualReason] = useState("");

  useEffect(() => {
    if (calculo) {
      setManualAmount(calculo.manual_amount?.toString() || calculo.current_month_retention?.toString() || "");
      setManualReason(calculo.manual_reason || "");
      setManualMode(calculo.calculation_mode === "manual");
    }
  }, [calculo]);

  if (!calculo) return null;
  const detail = calculo.calculation_detail || {};

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onCancel}>
      <Card className="max-w-2xl w-full my-8" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="border-b sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold">Detalle de Retención de Quinta Categoría</CardTitle>
              <p className="text-sm text-slate-600 mt-1">{employeeName} — {calculo.month}/{calculo.year}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onCancel}>✕</Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge className={calculo.status === "Aplicada" ? "bg-green-100 text-green-700" : calculo.status === "Aprobada" ? "bg-blue-100 text-blue-700" : calculo.status === "Revertida" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}>
              {calculo.status}
            </Badge>
            <Badge variant="outline">{calculo.calculation_mode === "manual" ? "Ajuste Manual" : "Cálculo Automático"}</Badge>
          </div>

          {/* Desglose del cálculo automático */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
            <h4 className="font-semibold text-slate-700 mb-2">Desglose del Cálculo</h4>
            <div className="flex justify-between"><span className="text-slate-600">Remuneración mensual gravable:</span><span className="font-mono">{formatMoney(detail.remuneracion_mensual)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Proyección anual (×12):</span><span className="font-mono">{formatMoney(detail.projected_annual_income || calculo.projected_annual_income)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">UIT vigente:</span><span className="font-mono">{formatMoney(detail.uit_amount)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Deducción anual ({detail.uit_deduction_count || 7} UIT):</span><span className="font-mono">-{formatMoney(detail.annual_deduction || calculo.annual_deduction)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-2"><span className="font-semibold text-slate-700">Base imponible anual:</span><span className="font-mono font-semibold">{formatMoney(detail.projected_taxable_base || calculo.projected_taxable_base)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Impuesto anual proyectado:</span><span className="font-mono">{formatMoney(detail.projected_annual_tax || calculo.projected_annual_tax)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Retenciones previas del ejercicio:</span><span className="font-mono">-{formatMoney(detail.prior_retentions || calculo.prior_retentions)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Meses restantes:</span><span className="font-mono">{detail.remaining_months || (12 - calculo.month + 1)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-2"><span className="font-semibold text-slate-700">Retención del mes (auto):</span><span className="font-mono font-semibold text-indigo-600">{formatMoney(calculo.current_month_retention)}</span></div>
          </div>

          {/* Tramos aplicados */}
          {detail.bracket_details && detail.bracket_details.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="text-left p-2">Tramo (UIT)</th>
                    <th className="text-left p-2">Tramo (S/)</th>
                    <th className="text-right p-2">Tasa</th>
                    <th className="text-right p-2">Base tramo</th>
                    <th className="text-right p-2">Impuesto</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.bracket_details.map((b, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{b.from_uit} - {b.to_uit}</td>
                      <td className="p-2 font-mono">{formatMoney(b.from_soles)} - {formatMoney(b.to_soles)}</td>
                      <td className="p-2 text-right">{b.rate}%</td>
                      <td className="p-2 text-right font-mono">{formatMoney(b.taxable_amount)}</td>
                      <td className="p-2 text-right font-mono">{formatMoney(b.tax_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Ajuste manual */}
          {canApprove && calculo.status !== "Aplicada" && (
            <div className="border border-indigo-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="manualMode"
                  checked={manualMode}
                  onChange={(e) => setManualMode(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <Label htmlFor="manualMode" className="text-sm font-semibold text-indigo-700 cursor-pointer">
                  Aplicar ajuste manual autorizado
                </Label>
              </div>
              {manualMode && (
                <>
                  <div>
                    <Label>Monto manual (S/)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label>Motivo del ajuste *</Label>
                    <Textarea
                      value={manualReason}
                      onChange={(e) => setManualReason(e.target.value)}
                      placeholder="Justificación del ajuste manual..."
                      rows={2}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onCancel}>Cerrar</Button>
            {canApprove && calculo.status === "Pendiente" && (
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={() => onApprove(manualMode ? {
                  calculation_mode: "manual",
                  manual_amount: Number(manualAmount) || 0,
                  manual_reason: manualReason,
                } : {})}
              >
                Aprobar Cálculo
              </Button>
            )}
            {canApprove && calculo.status === "Aprobada" && (
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={() => onApplyManual()}
              >
                Aplicar a Boleta
              </Button>
            )}
            {canApprove && (calculo.status === "Aplicada" || calculo.status === "Aprobada") && (
              <Button
                variant="outline"
                className="text-red-600 hover:bg-red-50"
                onClick={onRevert}
              >
                Revertir
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}