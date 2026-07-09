import React, { useState, useMemo } from "react";
import { entitiesAPI } from "@/api/entitiesClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  UserCheck,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima } from "@/lib/dateUtils";
import { toast } from "sonner";

export default function PendingCompensationsApproval({ allEmployees }) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const currentEmployee = currentUser?.employee || null;
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectComment, setRejectComment] = useState("");
  const [processing, setProcessing] = useState(false);

  // Cargar todas las compensaciones pendientes asignadas al usuario actual
  const { data: pendingComps = [], isLoading } = useQuery({
    queryKey: ["pendingCompsForApproval", currentEmployee?.id],
    queryFn: async () => {
      if (!currentEmployee) return [];
      const all = await entitiesAPI.AttendanceIncident.list("-incident_date");
      return all.filter(
        (i) =>
          i.incident_type === "Compensación de Tardanza" &&
          i.status === "Pendiente" &&
          i.authorizer_id === currentEmployee.id
      );
    },
    enabled: !!currentEmployee,
  });

  // Cargar registros de asistencia relacionados
  const recordIds = useMemo(
    () => pendingComps.map((c) => c.attendance_record_id).filter(Boolean),
    [pendingComps]
  );

  const { data: relatedRecords = [] } = useQuery({
    queryKey: ["compRecordsForApproval", recordIds.join(",")],
    queryFn: async () => {
      if (recordIds.length === 0) return [];
      const all = await entitiesAPI.AttendanceRecord.list("-date");
      return all.filter((r) => recordIds.includes(r.id));
    },
    enabled: recordIds.length > 0,
  });

  // Agrupar compensaciones por empleado
  const groupedByEmployee = useMemo(() => {
    const map = new Map();
    for (const comp of pendingComps) {
      if (!map.has(comp.employee_id)) {
        const emp = allEmployees.find((e) => e.id === comp.employee_id);
        map.set(comp.employee_id, {
          employee: emp,
          employee_id: comp.employee_id,
          compensations: [],
          totalLateMinutes: 0,
          totalOvertimeMinutes: 0,
        });
      }
      const group = map.get(comp.employee_id);
      group.compensations.push(comp);
      group.totalLateMinutes += comp.late_minutes_to_adjust || 0;
      group.totalOvertimeMinutes += Math.round(
        (comp.hours_to_adjust || 0) * 60
      );
    }
    return Array.from(map.values());
  }, [pendingComps, allEmployees]);

  const handleApprove = async (comp) => {
    setProcessing(true);
    try {
      const record = relatedRecords.find(
        (r) => r.id === comp.attendance_record_id
      );

      // 1. Actualizar el incidente a "Aprobada"
      await entitiesAPI.AttendanceIncident.update(comp.id, {
        status: "Aprobada",
        reviewed_by: `${currentEmployee.first_name} ${currentEmployee.last_name}`,
        review_date: format(new Date(), "yyyy-MM-dd"),
        review_comments: "Compensación aprobada",
      });

      // 2. Ajustar el registro de asistencia: descontar tardanza y horas extras
      if (record) {
        const lateToDeduct = comp.late_minutes_to_adjust || 0;
        const hoursToDeduct = comp.hours_to_adjust || 0;

        // Descontar minutos de tardanza
        const newLateMinutes = Math.max(
          0,
          (record.late_minutes || 0) - lateToDeduct
        );
        const newIsLate = newLateMinutes > 0;

        // Descontar horas extras (primero 25%, luego 35%)
        let remainingHours = hoursToDeduct;
        let newOT25 = record.overtime_hours_25 || 0;
        let newOT35 = record.overtime_hours_35 || 0;

        if (remainingHours > 0 && newOT25 > 0) {
          const deduct25 = Math.min(newOT25, remainingHours);
          newOT25 -= deduct25;
          remainingHours -= deduct25;
        }
        if (remainingHours > 0 && newOT35 > 0) {
          const deduct35 = Math.min(newOT35, remainingHours);
          newOT35 -= deduct35;
          remainingHours -= deduct35;
        }

        await entitiesAPI.AttendanceRecord.update(record.id, {
          late_minutes: newLateMinutes,
          is_late: newIsLate,
          overtime_hours_25: newOT25,
          overtime_hours_35: newOT35,
          status: "Justificado",
          notes:
            (record.notes ? record.notes + " | " : "") +
            `Compensación aprobada: -${lateToDeduct} min tardanza, -${hoursToDeduct.toFixed(2)} h HE`,
        });
      }

      queryClient.invalidateQueries(["pendingCompsForApproval"]);
      queryClient.invalidateQueries(["compensationIncidents"]);
      queryClient.invalidateQueries(["compensationRecords"]);
      queryClient.invalidateQueries(["allIncidents"]);
      queryClient.invalidateQueries(["todayAttendance"]);

      toast.success("✓ Compensación aprobada y descuentos aplicados");
    } catch (error) {
      toast.error("Error al aprobar: " + (error.message || ""));
    } finally {
      setProcessing(false);
    }
  };

  const handleApproveAll = async (employeeGroup) => {
    setProcessing(true);
    try {
      for (const comp of employeeGroup.compensations) {
        const record = relatedRecords.find(
          (r) => r.id === comp.attendance_record_id
        );

        await entitiesAPI.AttendanceIncident.update(comp.id, {
          status: "Aprobada",
          reviewed_by: `${currentEmployee.first_name} ${currentEmployee.last_name}`,
          review_date: format(new Date(), "yyyy-MM-dd"),
          review_comments: "Compensación aprobada (lote)",
        });

        if (record) {
          const lateToDeduct = comp.late_minutes_to_adjust || 0;
          const hoursToDeduct = comp.hours_to_adjust || 0;

          const newLateMinutes = Math.max(
            0,
            (record.late_minutes || 0) - lateToDeduct
          );
          const newIsLate = newLateMinutes > 0;

          let remainingHours = hoursToDeduct;
          let newOT25 = record.overtime_hours_25 || 0;
          let newOT35 = record.overtime_hours_35 || 0;

          if (remainingHours > 0 && newOT25 > 0) {
            const deduct25 = Math.min(newOT25, remainingHours);
            newOT25 -= deduct25;
            remainingHours -= deduct25;
          }
          if (remainingHours > 0 && newOT35 > 0) {
            const deduct35 = Math.min(newOT35, remainingHours);
            newOT35 -= deduct35;
            remainingHours -= deduct35;
          }

          await entitiesAPI.AttendanceRecord.update(record.id, {
            late_minutes: newLateMinutes,
            is_late: newIsLate,
            overtime_hours_25: newOT25,
            overtime_hours_35: newOT35,
            status: "Justificado",
          });
        }
      }

      queryClient.invalidateQueries(["pendingCompsForApproval"]);
      queryClient.invalidateQueries(["compensationIncidents"]);
      queryClient.invalidateQueries(["compensationRecords"]);
      queryClient.invalidateQueries(["allIncidents"]);
      queryClient.invalidateQueries(["todayAttendance"]);

      toast.success(
        `✓ ${employeeGroup.compensations.length} compensación(es) aprobadas`
      );
    } catch (error) {
      toast.error("Error al aprobar lote: " + (error.message || ""));
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectingId) return;
    if (!rejectComment.trim()) {
      toast.error("Debe ingresar un motivo de rechazo");
      return;
    }
    setProcessing(true);
    try {
      await entitiesAPI.AttendanceIncident.update(rejectingId, {
        status: "Rechazada",
        reviewed_by: `${currentEmployee.first_name} ${currentEmployee.last_name}`,
        review_date: format(new Date(), "yyyy-MM-dd"),
        review_comments: rejectComment,
      });

      queryClient.invalidateQueries(["pendingCompsForApproval"]);
      queryClient.invalidateQueries(["compensationIncidents"]);

      toast.success("Compensación rechazada");
      setRejectingId(null);
      setRejectComment("");
    } catch (error) {
      toast.error("Error al rechazar: " + (error.message || ""));
    } finally {
      setProcessing(false);
    }
  };

  if (isLoading || !currentEmployee) {
    return null;
  }

  if (pendingComps.length === 0) {
    return null;
  }

  return (
    <Card className="border-0 shadow-lg border-l-4 border-l-amber-400">
      <CardHeader className="border-b bg-amber-50/50">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-amber-600" />
          Compensaciones Pendientes de Aprobación
          <Badge className="bg-amber-500 text-white ml-2">
            {pendingComps.length}
          </Badge>
        </CardTitle>
        <p className="text-sm text-slate-600 mt-1">
          Tienes {pendingComps.length} solicitud(es) de compensación asignadas
          para revisar
        </p>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {groupedByEmployee.map((group) => {
          const emp = group.employee;
          if (!emp) return null;
          return (
            <div
              key={group.employee_id}
              className="border border-slate-200 rounded-lg overflow-hidden"
            >
              {/* Header del empleado */}
              <div className="flex items-center justify-between bg-slate-50 px-4 py-3 border-b">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold bg-gradient-to-br from-indigo-500 to-purple-600">
                    {emp.first_name[0]}
                    {emp.last_name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">
                      {emp.first_name} {emp.last_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {emp.document_type} {emp.document_number} ·{" "}
                      {emp.department_name || "Sin área"} ·{" "}
                      {emp.position || ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="flex items-center gap-1 text-orange-600">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-sm font-bold">
                        {group.totalLateMinutes} min
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">tardanza</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center gap-1 text-blue-600">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span className="text-sm font-bold">
                        {group.totalOvertimeMinutes} min
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">HE</p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white h-8"
                    disabled={processing}
                    onClick={() => handleApproveAll(group)}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Aprobar todo ({group.compensations.length})
                  </Button>
                </div>
              </div>

              {/* Detalle de cada compensación */}
              <div className="divide-y divide-slate-100">
                {group.compensations.map((comp) => {
                  const record = relatedRecords.find(
                    (r) => r.id === comp.attendance_record_id
                  );
                  const isRejecting = rejectingId === comp.id;
                  return (
                    <div key={comp.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-slate-900">
                              {format(
                                parseDateLima(comp.incident_date),
                                "dd MMM yyyy",
                                { locale: es }
                              )}
                            </span>
                            <Badge className="bg-orange-100 text-orange-700 text-xs">
                              {comp.late_minutes_to_adjust || 0} min tard
                            </Badge>
                            <Badge className="bg-blue-100 text-blue-700 text-xs">
                              {((comp.hours_to_adjust || 0) * 60).toFixed(0)}{" "}
                              min HE
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-600">
                            <span className="font-medium">Motivo:</span>{" "}
                            {comp.justification}
                          </p>
                          {record && (
                            <p className="text-[11px] text-slate-400 mt-1">
                              Registro: {record.clock_in || "—"} a{" "}
                              {record.clock_out || "—"} · Tardanza actual:{" "}
                              {record.late_minutes || 0} min
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50"
                            disabled={processing}
                            onClick={() => handleApprove(comp)}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Aprobar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs text-red-700 border-red-300 hover:bg-red-50"
                            disabled={processing}
                            onClick={() => {
                              setRejectingId(comp.id);
                              setRejectComment("");
                            }}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Rechazar
                          </Button>
                        </div>
                      </div>

                      {/* Formulario de rechazo */}
                      {isRejecting && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <Textarea
                            placeholder="Motivo de rechazo (obligatorio)..."
                            value={rejectComment}
                            onChange={(e) => setRejectComment(e.target.value)}
                            rows={2}
                            className="text-sm"
                          />
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => {
                                setRejectingId(null);
                                setRejectComment("");
                              }}
                            >
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white text-xs"
                              disabled={processing || !rejectComment.trim()}
                              onClick={handleReject}
                            >
                              Confirmar rechazo
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
