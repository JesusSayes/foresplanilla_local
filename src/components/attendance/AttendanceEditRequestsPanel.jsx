import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle, XCircle, Clock, Search, ArrowRight, X, AlertCircle, Ban
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima } from "@/lib/dateUtils";
import PaginationBar from "@/components/ui/PaginationBar";

const FIELD_LABELS = {
  clock_in: "Hora de entrada",
  clock_out: "Hora de salida",
  status: "Estado",
  notes: "Notas",
};

const STATUS_BADGE = {
  Pendiente: "bg-yellow-100 text-yellow-800 border-yellow-300",
  Aprobada: "bg-green-100 text-green-800 border-green-300",
  Rechazada: "bg-red-100 text-red-800 border-red-300",
  Cancelada: "bg-slate-100 text-slate-600 border-slate-300",
};

function RequestCard({ req, allEmployees, reviewer, canApprove, onApproved, onRejected, onCancelled }) {
  const [rejectComment, setRejectComment] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [loading, setLoading] = useState(false);

  const employee = allEmployees.find(e => e.id === req.employee_id);
  const isPending = req.status === "Pendiente";

  const handleApprove = async () => {
    if (!window.confirm("¿Aprobar esta solicitud de edición? Se aplicarán los cambios al registro de asistencia.")) return;
    setLoading(true);
    try {
      // Verificar que sigue Pendiente
      const fresh = await base44.entities.AttendanceEditRequest.filter({ id: req.id });
      if (!fresh?.[0] || fresh[0].status !== "Pendiente") {
        toast.error("La solicitud ya no está pendiente");
        onApproved?.();
        return;
      }

      // Aplicar cambios al registro
      await base44.entities.AttendanceRecord.update(req.attendance_record_id, {
        ...req.requested_values,
        manually_protected_fields: Object.keys(req.requested_values),
        last_approved_edit_id: req.id,
        manually_modified_by: `${reviewer.first_name} ${reviewer.last_name}`,
        manually_modified_at: new Date().toISOString(),
      });

      // Marcar solicitud como aprobada
      await base44.entities.AttendanceEditRequest.update(req.id, {
        status: "Aprobada",
        reviewed_by_id: reviewer.id,
        reviewed_by_name: `${reviewer.first_name} ${reviewer.last_name}`,
        reviewed_at: new Date().toISOString(),
      });

      // Recalcular tardanzas y HE con el horario programado del empleado
      await base44.functions.invoke("recalcularAsistencia", {
        employee_id: req.employee_id,
        date_from: req.attendance_date,
        date_to: req.attendance_date,
      });

      toast.success("Solicitud aprobada, cambios aplicados y métricas recalculadas");
      onApproved?.();
    } catch (e) {
      toast.error("Error al aprobar: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectComment.trim()) {
      toast.error("El comentario de rechazo es obligatorio");
      return;
    }
    if (!window.confirm("¿Rechazar esta solicitud de edición?")) return;
    setLoading(true);
    try {
      await base44.entities.AttendanceEditRequest.update(req.id, {
        status: "Rechazada",
        reviewed_by_id: reviewer.id,
        reviewed_by_name: `${reviewer.first_name} ${reviewer.last_name}`,
        reviewed_at: new Date().toISOString(),
        review_comment: rejectComment.trim(),
      });
      toast.success("Solicitud rechazada");
      setShowReject(false);
      onRejected?.();
    } catch (e) {
      toast.error("Error al rechazar: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm("¿Cancelar esta solicitud de edición?")) return;
    setLoading(true);
    try {
      await base44.entities.AttendanceEditRequest.update(req.id, {
        status: "Cancelada",
        reviewed_by_id: reviewer.id,
        reviewed_by_name: `${reviewer.first_name} ${reviewer.last_name}`,
        reviewed_at: new Date().toISOString(),
        review_comment: "Cancelada por el solicitante",
      });
      toast.success("Solicitud cancelada");
      onCancelled?.();
    } catch (e) {
      toast.error("Error al cancelar: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`p-4 border rounded-lg ${isPending ? "border-yellow-200 bg-yellow-50/30" : "border-slate-200 bg-white"}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-slate-900 text-sm">
              {employee ? `${employee.document_type} ${employee.document_number} – ${employee.first_name} ${employee.last_name}` : req.employee_id}
            </span>
            <Badge className={`text-xs border ${STATUS_BADGE[req.status]}`}>{req.status}</Badge>
          </div>
          <p className="text-xs text-slate-500">
            📅 {req.attendance_date ? format(parseDateLima(req.attendance_date), "dd 'de' MMMM yyyy", { locale: es }) : ""} 
            {" · "} Cargo: {employee?.position || "—"} · Depto: {employee?.department_name || "—"}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Solicitado por: <strong>{req.requested_by_name}</strong>
            {req.requested_at && ` · ${format(new Date(req.requested_at), "dd/MM/yyyy HH:mm")}`}
          </p>
        </div>
      </div>

      {/* Motivo */}
      <div className="mb-3 p-2.5 bg-slate-50 rounded-lg">
        <p className="text-xs font-semibold text-slate-600 mb-0.5">Motivo:</p>
        <p className="text-sm text-slate-800">{req.edit_reason}</p>
      </div>

      {/* Cambios solicitados */}
      <div className="mb-3">
        <p className="text-xs font-semibold text-slate-600 mb-2">Cambios solicitados:</p>
        <div className="space-y-1.5">
          {Object.entries(req.requested_values || {}).map(([k, newVal]) => (
            <div key={k} className="flex items-center gap-2 text-sm bg-white border border-slate-200 rounded px-2 py-1">
              <span className="text-slate-500 text-xs w-28 font-medium shrink-0">{FIELD_LABELS[k] || k}:</span>
              <span className="text-slate-400 text-xs line-through shrink-0">{(req.original_values?.[k] || "—")}</span>
              <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" />
              <span className="text-indigo-700 font-semibold text-xs">{newVal || "—"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Info de revisión */}
      {!isPending && req.reviewed_by_name && (
        <div className={`mb-3 p-2.5 rounded-lg text-xs ${req.status === "Aprobada" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
          <p className="font-semibold mb-0.5">
            {req.status === "Aprobada" ? "✓ Aprobada" : req.status === "Rechazada" ? "✗ Rechazada" : "Cancelada"} por {req.reviewed_by_name}
            {req.reviewed_at && ` · ${format(new Date(req.reviewed_at), "dd/MM/yyyy HH:mm")}`}
          </p>
          {req.review_comment && <p className="text-slate-600">{req.review_comment}</p>}
        </div>
      )}

      {/* Acciones */}
      {isPending && (
        <div className="flex flex-col gap-2">
          {/* Cancelar siempre disponible para pendientes */}
          <Button size="sm" variant="outline" className="text-slate-600" onClick={handleCancel} disabled={loading}>
            <Ban className="w-3 h-3 mr-1" />Cancelar solicitud
          </Button>

          {/* Aprobadores pueden aprobar/rechazar cualquier solicitud */}
          {canApprove && (
            <>
              {!showReject ? (
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleApprove} disabled={loading}>
                    <CheckCircle className="w-3 h-3 mr-1" />Aprobar
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setShowReject(true)} disabled={loading}>
                    <XCircle className="w-3 h-3 mr-1" />Rechazar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Comentario de rechazo (obligatorio)..."
                    value={rejectComment}
                    onChange={(e) => setRejectComment(e.target.value)}
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setShowReject(false)}>Volver</Button>
                    <Button size="sm" variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50" onClick={handleReject} disabled={loading}>
                      Confirmar rechazo
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}


        </div>
      )}
    </div>
  );
}

const EDIT_PAGE_SIZE = 20;

export default function AttendanceEditRequestsPanel({ allEmployees, reviewer, canApprove }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [editPage, setEditPage] = useState(1);
  const queryClient = useQueryClient();

  const { data: requests = [], refetch } = useQuery({
    queryKey: ["attendanceEditRequests"],
    queryFn: async () => {
      const all = await base44.entities.AttendanceEditRequest.list("-requested_at", 500);
      return all;
    },
  });

  const refresh = () => {
    refetch();
    queryClient.invalidateQueries(["todayAttendance"]);
    queryClient.invalidateQueries(["attendanceEditRequests"]);
  };

  const filtered = (status) =>
    requests.filter((r) => {
      if (r.status !== status) return false;
      if (dateFilter && r.attendance_date !== dateFilter) return false;
      if (!searchTerm) return true;
      const emp = allEmployees.find((e) => e.id === r.employee_id);
      const name = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
      const doc = emp?.document_number || "";
      const term = searchTerm.toLowerCase();
      return name.includes(term) || doc.includes(term) || r.requested_by_name?.toLowerCase().includes(term);
    });

  const pendingCount = requests.filter((r) => r.status === "Pendiente").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input placeholder="Buscar por empleado o solicitante..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setEditPage(1); }} className="pl-9" />
        </div>
        <Input type="date" value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setEditPage(1); }} className="w-40" title="Filtrar por fecha de asistencia" />
        {dateFilter && <Button size="sm" variant="outline" onClick={() => { setDateFilter(""); setEditPage(1); }}>✕ Fecha</Button>}
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="grid grid-cols-4 max-w-xl mb-4">
          <TabsTrigger value="pending">
            Pendientes {pendingCount > 0 && <Badge className="ml-1.5 bg-yellow-500 text-white text-xs">{pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="approved">Aprobadas</TabsTrigger>
          <TabsTrigger value="rejected">Rechazadas</TabsTrigger>
          <TabsTrigger value="cancelled">Canceladas</TabsTrigger>
        </TabsList>

        {["pending", "approved", "rejected", "cancelled"].map((tab) => {
          const statusMap = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada", cancelled: "Cancelada" };
          const items = filtered(statusMap[tab]);
          const paged = items.slice((editPage - 1) * EDIT_PAGE_SIZE, editPage * EDIT_PAGE_SIZE);
          return (
            <TabsContent key={tab} value={tab}>
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b py-4">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    {tab === "pending" && <Clock className="w-5 h-5 text-yellow-600" />}
                    {tab === "approved" && <CheckCircle className="w-5 h-5 text-green-600" />}
                    {tab === "rejected" && <XCircle className="w-5 h-5 text-red-600" />}
                    {tab === "cancelled" && <Ban className="w-5 h-5 text-slate-500" />}
                    Solicitudes {statusMap[tab]}s
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {items.length === 0 ? (
                    <div className="text-center py-12">
                      <AlertCircle className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                      <p className="text-slate-500 text-sm">No hay solicitudes {statusMap[tab].toLowerCase()}s</p>
                    </div>
                  ) : (
                    <>
                    <div className="space-y-3">
                      {paged.map((req) => (
                        <RequestCard
                          key={req.id}
                          req={req}
                          allEmployees={allEmployees}
                          reviewer={reviewer}
                          canApprove={canApprove}
                          onApproved={refresh}
                          onRejected={refresh}
                          onCancelled={refresh}
                        />
                      ))}
                    </div>
                    <PaginationBar currentPage={editPage} totalItems={items.length} pageSize={EDIT_PAGE_SIZE} onPageChange={setEditPage} />
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}