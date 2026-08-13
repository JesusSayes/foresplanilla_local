import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima } from "@/lib/dateUtils";
import { groupStatusSummary } from "@/lib/incidentGroups";

// Modal de confirmación para aprobar/rechazar un periodo completo de justificaciones.
// group: { codigo, incidents: [] }  · mode: "approve" | "reject"
export default function PeriodApprovalModal({
  group,
  mode,
  employees,
  loading,
  onConfirm,
  onClose,
}) {
  const [comments, setComments] = useState("");

  useEffect(() => {
    setComments("");
  }, [group, mode]);

  if (!group) return null;

  const isApprove = mode === "approve";
  const pending = group.incidents.filter((i) => i.status === "Pendiente");
  const alreadyResolved = group.incidents.length - pending.length;
  const emp = employees.find((e) => e.id === group.incidents[0].employee_id);
  const sum = groupStatusSummary(group.incidents);

  const canConfirm = isApprove ? true : comments.trim().length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(comments.trim() || (isApprove ? "Aprobada" : ""));
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <Card
        className="max-w-2xl w-full my-4 sm:my-0"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              {isApprove ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
              {isApprove ? "Aprobar todo el periodo" : "Rechazar todo el periodo"}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>✕</Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-5">
            {/* Resumen del grupo */}
            <div className="p-4 bg-slate-50 rounded-lg space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-slate-900">
                  {emp ? `${emp.first_name} ${emp.last_name}` : "Empleado"}
                </p>
                <Badge className="bg-orange-100 text-orange-700">
                  {group.incidents[0].incident_type}
                </Badge>
                {group.codigo && (
                  <Badge variant="outline" className="text-xs">{group.codigo}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <Badge className="bg-yellow-100 text-yellow-700">{sum.pending} pendientes</Badge>
                <Badge className="bg-green-100 text-green-700">{sum.approved} aprobadas</Badge>
                <Badge className="bg-red-100 text-red-700">{sum.rejected} rechazadas</Badge>
                <span className="text-slate-500">de {sum.total} fecha(s)</span>
              </div>
            </div>

            {/* Fechas que se afectarán */}
            <div>
              <p className="text-sm font-semibold text-slate-900 mb-2">
                {isApprove
                  ? `Se aprobarán ${pending.length} fecha(s) pendiente(s):`
                  : `Se rechazarán ${pending.length} fecha(s) pendiente(s):`}
              </p>
              <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {pending.map((inc) => (
                  <div key={inc.id} className="px-3 py-2 flex items-center justify-between text-sm">
                    <span className="text-slate-700">
                      {format(parseDateLima(inc.incident_date), "dd 'de' MMMM, yyyy", { locale: es })}
                    </span>
                    <span className="text-xs text-slate-500 truncate ml-2 max-w-[60%]">
                      {inc.justification}
                    </span>
                  </div>
                ))}
              </div>
              {alreadyResolved > 0 && (
                <div className="flex items-start gap-2 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    {alreadyResolved} fecha(s) ya están resueltas y no se modificarán.
                  </p>
                </div>
              )}
            </div>

            {/* Comentarios */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Comentarios de Revisión {!isApprove && <span className="text-red-500">*</span>}
              </label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={
                  isApprove
                    ? "Comentario opcional (se replica en cada fecha)..."
                    : "Motivo de rechazo obligatorio (se replica en cada fecha)..."
                }
                rows={3}
              />
              {isApprove && (
                <p className="text-xs text-slate-500 mt-2">
                  Si lo dejas vacío, se registrará "Aprobada" en cada fecha.
                </p>
              )}
            </div>

            {/* Acciones */}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
              <Button
                className={`flex-1 ${isApprove ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
                onClick={handleConfirm}
                disabled={!canConfirm || loading}
              >
                {loading
                  ? "Procesando..."
                  : isApprove
                    ? `Aprobar ${pending.length} fecha(s)`
                    : `Rechazar ${pending.length} fecha(s)`}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}