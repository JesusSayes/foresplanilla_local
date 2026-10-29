import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Loader2, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { renewContractWithRmv } from "@/lib/rmvContractRenewal";

export default function RmvComplianceModal({ open, onClose, matches, activeRmv, rule, onCompleted }) {
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initial = (matches || []).map(match => ({ ...match, status: "pending", message: null }));
    setItems(initial);
    setSelectedIds(new Set(initial.map(item => item.contract.id)));
    setProcessing(false);
  }, [open]);

  if (!open) return null;

  const months = rule?.renewal_months || 12;
  const rmvAmount = Number(activeRmv?.amount || 0);

  const updateItem = (contractId, patch) => {
    setItems(prev => prev.map(item => item.contract.id === contractId ? { ...item, ...patch } : item));
  };

  const pendingItems = items.filter(item => item.status === "pending");
  const selectedPending = pendingItems.filter(item => selectedIds.has(item.contract.id));
  const allSelected = pendingItems.length > 0 && pendingItems.every(item => selectedIds.has(item.contract.id));

  const approveOne = async (item) => {
    updateItem(item.contract.id, { status: "saving", message: null });
    try {
      const { newContract } = await renewContractWithRmv({
        contract: item.contract,
        employee: item.employee,
        activeRmv,
        rule,
      });
      updateItem(item.contract.id, {
        status: "done",
        message: `Contrato ${newContract.contract_number} generado (${String(newContract.start_date).slice(0, 10)} al ${newContract.end_date ? String(newContract.end_date).slice(0, 10) : "sin término"})`,
      });
      return true;
    } catch (error) {
      updateItem(item.contract.id, {
        status: "error",
        message: error?.message || "No se pudo renovar el contrato",
      });
      return false;
    }
  };

  const runApproval = async (targets) => {
    if (processing || targets.length === 0) return;
    setProcessing(true);
    let ok = 0;
    let failed = 0;

    for (const item of targets) {
      const success = await approveOne(item);
      if (success) ok++; else failed++;
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(item.contract.id);
        return next;
      });
    }

    setProcessing(false);
    if (onCompleted) onCompleted();
    if (ok > 0) toast.success(`${ok} contrato${ok !== 1 ? "s" : ""} actualizado${ok !== 1 ? "s" : ""} y renovado${ok !== 1 ? "s" : ""}`);
    if (failed > 0) toast.error(`${failed} contrato${failed !== 1 ? "s" : ""} no se pudo${failed !== 1 ? "ieron" : ""} renovar`);
  };

  const handleApproveSelected = () => {
    if (selectedPending.length === 0) {
      toast.error("Selecciona al menos un contrato pendiente");
      return;
    }
    runApproval(selectedPending);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <Card className="max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Contratos con sueldo inferior a la RMV</h2>
              <p className="text-sm text-slate-500">
                RMV activa S/ {rmvAmount.toFixed(2)} · renovación por {months} mes{months !== 1 ? "es" : ""}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={processing}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {items.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-slate-700 font-medium">No hay contratos que requieran actualización</p>
              <p className="text-sm text-slate-500 mt-1">Todos los sueldos base alcanzan la RMV activa.</p>
            </div>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                Al aprobar, el nuevo contrato tendrá una remuneración de <strong>S/ {rmvAmount.toFixed(2)}</strong>, el
                contrato anterior queda como <strong>Renovado</strong> y se crea el nuevo contrato vigente con esa
                remuneración desde su fecha de inicio. Los contratos a plazo fijo se renuevan por {months} mes{months !== 1 ? "es" : ""}; los indeterminados permanecen sin fecha de término.
              </div>

              <div className="flex items-center gap-2 px-1">
                <Checkbox
                  id="select-all-rmv"
                  checked={allSelected}
                  disabled={processing || pendingItems.length === 0}
                  onCheckedChange={(checked) => {
                    setSelectedIds(prev => {
                      const next = new Set(prev);
                      pendingItems.forEach(item => {
                        if (checked) next.add(item.contract.id);
                        else next.delete(item.contract.id);
                      });
                      return next;
                    });
                  }}
                />
                <label htmlFor="select-all-rmv" className="text-sm text-slate-700 cursor-pointer select-none">
                  {allSelected ? "Deseleccionar todos" : "Seleccionar todos"} los pendientes ({pendingItems.length})
                </label>
              </div>

              <div className="space-y-2">
                {items.map(item => {
                  const { contract, employee, baseSalary, status, message } = item;
                  const isSelected = selectedIds.has(contract.id);
                  return (
                    <div
                      key={contract.id}
                      className={`p-3 border rounded-lg transition-colors ${
                        status === "done"
                          ? "border-green-200 bg-green-50/40"
                          : status === "error"
                            ? "border-red-200 bg-red-50/40"
                            : isSelected ? "border-indigo-300 bg-indigo-50/30" : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <Checkbox
                            checked={isSelected}
                            disabled={processing || status !== "pending"}
                            onCheckedChange={(checked) => {
                              setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (checked) next.add(contract.id);
                                else next.delete(contract.id);
                                return next;
                              });
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-slate-900 truncate">
                              {employee.first_name} {employee.last_name}
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5 truncate">
                              {contract.position || "Sin cargo"} · {contract.contract_number || "Sin número"} ·{" "}
                              {contract.contract_type}
                            </p>
                            <p className="text-xs text-slate-700 mt-1">
                              Sueldo base actual <strong>S/ {baseSalary.toFixed(2)}</strong> → nuevo{" "}
                              <strong>S/ {rmvAmount.toFixed(2)}</strong>
                            </p>
                            {message && (
                              <p className={`text-xs mt-1 ${status === "error" ? "text-red-600" : "text-green-700"}`}>
                                {message}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="sm:w-40 shrink-0 flex justify-end">
                          {status === "done" ? (
                            <Badge className="bg-green-100 text-green-700">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Renovado
                            </Badge>
                          ) : status === "error" ? (
                            <Badge className="bg-red-100 text-red-700">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Error
                            </Badge>
                          ) : status === "saving" ? (
                            <Badge className="bg-slate-100 text-slate-700">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Procesando
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={processing}
                              onClick={() => runApproval([item])}
                            >
                              Aprobar
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-slate-50 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            {selectedPending.length} seleccionado{selectedPending.length !== 1 ? "s" : ""} para aprobar
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} disabled={processing}>
              Cerrar
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={handleApproveSelected}
              disabled={processing || selectedPending.length === 0}
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                `Aprobar seleccionados (${selectedPending.length})`
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}