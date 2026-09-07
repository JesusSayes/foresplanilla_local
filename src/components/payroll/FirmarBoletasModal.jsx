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
  const [currentUserDni, setCurrentUserDni] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [showOnlyUnsigned, setShowOnlyUnsigned] = useState(false);
  const [employees, setEmployees] = useState([]);

  // Firmante GG = representante legal
  const ggName = companyInfo?.legal_representative || "";
  const ggPosition = companyInfo?.legal_representative_position || "Gerente General";
  const ggSignature = companyInfo?.legal_representative_signature_url || "";
  const ggDni = companyInfo?.legal_representative_dni || "";

  // Firmante delegado (solo si está habilitado)
  const delegatedEnabled = companyInfo?.enable_delegated_signature || false;
  const delName = companyInfo?.delegated_representative || "";
  const delPosition = companyInfo?.delegated_representative_position || "Gerente Operativo";
  const delSignature = companyInfo?.delegated_representative_signature_url || "";
  const delDni = companyInfo?.delegated_representative_dni || "";

  // Coincidencia exacta por DNI: nadie puede firmar a nombre de otra persona.
  // Incluso el superadmin debe coincidir con uno de los firmantes autorizados.
  const dniMatchesGG = currentUserDni && ggDni &&
    String(currentUserDni).trim() === String(ggDni).trim();
  const dniMatchesDelegated = currentUserDni && delDni &&
    String(currentUserDni).trim() === String(delDni).trim();

  // Cada firmante solo está habilitado si tiene firma configurada Y el usuario
  // logueado coincide exactamente por DNI con ese firmante.
  const ggAvailable = !!(ggName && ggSignature) && dniMatchesGG;
  const delAvailable = delegatedEnabled && !!(delName && delSignature) && dniMatchesDelegated;

  // Cargar DNI del usuario logueado y empleados para mostrar nombres
  React.useEffect(() => {
    (async () => {
      try {
        const user = await base44.auth.me();
        setIsAdmin(user.role === "admin");
        const emps = await base44.entities.Employee.filter({ work_email: user.email });
        if (emps?.length > 0) {
          setCurrentUserDni(emps[0].document_number || "");
        }
        // Cargar empleados para mostrar nombres en la lista de boletas
        const allEmps = await base44.entities.Employee.list();
        setEmployees(allEmps);
      } catch (e) { /* noop */ }
    })();
  }, []);

  // Pre-seleccionar el firmante que coincide con el usuario logueado
  React.useEffect(() => {
    if (ggAvailable) setSignerType("gg");
    else if (delAvailable) setSignerType("delegado");
  }, [ggAvailable, delAvailable]);

  const selectedSigner = signerType === "gg"
    ? { name: ggName, position: ggPosition, signature_url: ggSignature }
    : { name: delName, position: delPosition, signature_url: delSignature };

  // Boletas firmadas y pendientes
  const signedPayslips = (grupo.payslips || []).filter(p => p.digital_signature_url);
  const unsignedPayslips = (grupo.payslips || []).filter(p => !p.digital_signature_url);
  const totalBoletas = grupo.payslips.length;
  const pendingCount = unsignedPayslips.length;

  // Lista a mostrar según filtro
  const displayedPayslips = showOnlyUnsigned ? unsignedPayslips : (grupo.payslips || []);

  // Mapa de empleados para resolver nombres
  const empMap = React.useMemo(() => {
    const m = {};
    employees.forEach(e => { m[e.id] = e; });
    return m;
  }, [employees]);

  const getEmpName = (p) => {
    const e = empMap[p.employee_id];
    return e ? `${e.first_name} ${e.last_name}` : "Empleado";
  };

  const handleSign = async () => {
    if (!selectedSigner.signature_url) {
      toast.error("El firmante seleccionado no tiene firma configurada");
      return;
    }
    // Firmar solo las boletas que aún no están firmadas
    const toSign = unsignedPayslips;
    if (toSign.length === 0) {
      toast.info("Todas las boletas ya están firmadas");
      return;
    }
    setSigning(true);
    try {
      const now = new Date().toISOString();
      const updates = toSign.map(p => ({
        id: p.id,
        digital_signature_url: selectedSigner.signature_url,
        digital_signature_name: selectedSigner.name,
        digital_signature_position: selectedSigner.position,
        digital_signature_date: now,
      }));
      await base44.entities.Payslip.bulkUpdate(updates);
      toast.success(`✓ ${toSign.length} boleta(s) firmada(s) por ${selectedSigner.name}`);
      onSuccess?.();
    } catch (error) {
      toast.error("Error al firmar las boletas: " + (error.message || ""));
      console.error(error);
    } finally {
      setSigning(false);
    }
  };

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
            Seleccione el firmante para estampar la firma digital en las <strong>{pendingCount}</strong> boleta(s) pendiente(s) de un total de {totalBoletas}.
          </p>

          {/* Filtro rápido + lista de boletas */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlyUnsigned}
                  onChange={(e) => setShowOnlyUnsigned(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs font-medium text-slate-700">Ver solo boletas no firmadas</span>
              </label>
              <span className="text-[11px] text-slate-500">
                {pendingCount} pendiente(s) · {signedPayslips.length} firmada(s)
              </span>
            </div>
            <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
              {displayedPayslips.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-6">No hay boletas para mostrar</p>
              ) : (
                displayedPayslips.map(p => {
                  const isSigned = !!p.digital_signature_url;
                  return (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-800 truncate">{getEmpName(p)}</p>
                        <p className="text-[10px] text-slate-400">
                          {p.digital_signature_name ? `Firmado por: ${p.digital_signature_name}` : "Pendiente de firma"}
                        </p>
                      </div>
                      {isSigned ? (
                        <Badge className="text-[10px] bg-green-100 text-green-700 shrink-0">✓ Firmada</Badge>
                      ) : (
                        <Badge className="text-[10px] bg-amber-100 text-amber-700 shrink-0">Pendiente</Badge>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {!ggAvailable && !delAvailable && currentUserDni && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">
                Su DNI no coincide con ninguno de los firmantes autorizados (Gerente General o Delegado).
                Nadie puede firmar a nombre de otra persona.
              </p>
            </div>
          )}

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
                {!ggSignature && <p className="text-[10px] text-red-500 mt-0.5">Sin firma configurada</p>}
                {ggSignature && !dniMatchesGG && currentUserDni && <p className="text-[10px] text-amber-600 mt-0.5">Su DNI no coincide con el Gerente General</p>}
                {ggSignature && !currentUserDni && <p className="text-[10px] text-slate-400 mt-0.5">Sin DNI de usuario</p>}
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
                {delegatedEnabled && !delSignature && <p className="text-[10px] text-red-500 mt-0.5">Sin firma configurada</p>}
                {delegatedEnabled && delSignature && !dniMatchesDelegated && currentUserDni && <p className="text-[10px] text-amber-600 mt-0.5">Su DNI no coincide con el delegado autorizado</p>}
                {delegatedEnabled && delSignature && !currentUserDni && <p className="text-[10px] text-slate-400 mt-0.5">Sin DNI de usuario</p>}
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
            disabled={signing || !selectedSigner.signature_url || pendingCount === 0}
          >
            {signing
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Firmando...</>
              : <><PenTool className="w-4 h-4 mr-2" />Firmar {pendingCount} Boleta(s)</>}
          </Button>
        </div>
      </div>
    </div>
  );
}