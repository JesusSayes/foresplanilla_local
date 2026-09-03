import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PenTool, CheckCircle, Loader2, User, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function FirmarBoletasModal({ grupo, companyInfo, onClose, onSuccess }) {
  const [signerType, setSignerType] = useState("gg");
  const [signing, setSigning] = useState(false);

  // Firmante GG = representante legal (siempre disponible si tiene firma)
  const ggName = companyInfo?.legal_representative || "";
  const ggPosition = companyInfo?.legal_representative_position || "Gerente General";
  const ggSignature = companyInfo?.legal_representative_signature_url || "";

  // Firmante delegado (solo si está habilitado)
  const delegatedEnabled = companyInfo?.enable_delegated_signature || false;
  const delName = companyInfo?.delegated_representative || "";
  const delPosition = companyInfo?.delegated_representative_position || "Gerente Operativo";
  const delSignature = companyInfo?.delegated_representative_signature_url || "";

  const ggAvailable = !!(ggName && ggSignature);
  const delAvailable = delegatedEnabled && !!(delName && delSignature);

  // Auto-seleccionar el primero disponible
  React.useEffect(() => {
    if (!ggAvailable && delAvailable) setSignerType("delegado");
    else if (ggAvailable && !delAvailable) setSignerType("gg");
  }, [ggAvailable, delAvailable]);

  const selectedSigner = signerType === "gg"
    ? { name: ggName, position: ggPosition, signature_url: ggSignature }
    : { name: delName, position: delPosition, signature_url: delSignature };

  const handleSign = async () => {
    if (!selectedSigner.signature_url) {
      toast.error("El firmante seleccionado no tiene firma configurada");
      return;
    }
    setSigning(true);
    try {
      const now = new Date().toISOString();
      const updates = grupo.payslips.map(p => ({
        id: p.id,
        digital_signature_url: selectedSigner.signature_url,
        digital_signature_name: selectedSigner.name,
        digital_signature_position: selectedSigner.position,
        digital_signature_date: now,
      }));
      await base44.entities.Payslip.bulkUpdate(updates);
      toast.success(`✓ ${grupo.payslips.length} boleta(s) firmada(s) por ${selectedSigner.name}`);
      onSuccess?.();
    } catch (error) {
      toast.error("Error al firmar las boletas: " + (error.message || ""));
      console.error(error);
    } finally {
      setSigning(false);
    }
  };

  const totalBoletas = grupo.payslips.length;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <PenTool className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Firma Masiva de Boletas</h2>
              <p className="text-xs text-slate-500">{grupo.period} · {grupo.payroll_type} · {totalBoletas} boleta(s)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-600">
            Seleccione el firmante para estampar la firma digital en las <strong>{totalBoletas}</strong> boleta(s) de este período.
          </p>

          {/* Opciones de firmante */}
          <div className="space-y-3">
            {/* GG */}
            <button
              type="button"
              disabled={!ggAvailable}
              onClick={() => setSignerType("gg")}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left
                ${signerType === "gg" ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}
                ${!ggAvailable ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0
                ${signerType === "gg" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                <User className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">{ggName || "Sin configurar"}</span>
                  <Badge className="text-[10px] bg-indigo-100 text-indigo-700">GG</Badge>
                </div>
                <p className="text-xs text-slate-500">{ggPosition}</p>
                {ggSignature && <p className="text-[10px] text-green-600 mt-0.5">✓ Firma registrada</p>}
                {!ggAvailable && <p className="text-[10px] text-red-500 mt-0.5">Sin firma configurada</p>}
              </div>
              {signerType === "gg" && <CheckCircle className="w-5 h-5 text-indigo-600 shrink-0" />}
            </button>

            {/* Delegado */}
            <button
              type="button"
              disabled={!delAvailable}
              onClick={() => setSignerType("delegado")}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left
                ${signerType === "delegado" ? "border-purple-500 bg-purple-50" : "border-slate-200 hover:border-slate-300"}
                ${!delAvailable ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0
                ${signerType === "delegado" ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                <UserCheck className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">{delName || "Sin configurar"}</span>
                  <Badge className="text-[10px] bg-purple-100 text-purple-700">Delegado</Badge>
                </div>
                <p className="text-xs text-slate-500">{delPosition}</p>
                {delSignature && <p className="text-[10px] text-green-600 mt-0.5">✓ Firma registrada</p>}
                {!delegatedEnabled && <p className="text-[10px] text-slate-400 mt-0.5">Firma delegada no habilitada</p>}
                {delegatedEnabled && !delAvailable && <p className="text-[10px] text-red-500 mt-0.5">Sin firma configurada</p>}
              </div>
              {signerType === "delegado" && <CheckCircle className="w-5 h-5 text-purple-600 shrink-0" />}
            </button>
          </div>

          {/* Preview de la firma seleccionada */}
          {selectedSigner.signature_url && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <img
                src={selectedSigner.signature_url}
                alt="Firma"
                className="h-12 object-contain bg-white border border-slate-200 rounded px-2"
              />
              <div>
                <p className="text-xs font-semibold text-slate-700">Vista previa de la firma</p>
                <p className="text-[10px] text-slate-500">Aparecerá en la parte inferior izquierda de cada boleta</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={signing}>
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            onClick={handleSign}
            disabled={signing || !selectedSigner.signature_url}
          >
            {signing
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Firmando...</>
              : <><PenTool className="w-4 h-4 mr-2" />Firmar {totalBoletas} Boleta(s)</>}
          </Button>
        </div>
      </div>
    </div>
  );
}