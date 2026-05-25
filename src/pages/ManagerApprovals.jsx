import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { 
  CheckCircle, XCircle, Clock, Calendar, User, 
  FileText, AlertCircle, Search, Filter
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima } from "@/lib/dateUtils";
import { toast } from "sonner";
import PermissionGuard from "../components/PermissionGuard";

export default function ManagerApprovals() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [filterStatus, setFilterStatus] = useState("Pendiente");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [reviewAction, setReviewAction] = useState(null);
  const [reviewForm, setReviewForm] = useState({
    action: "",
    comments: "",
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);

        const employees = await base44.entities.Employee.filter({ 
          work_email: user.email 
        });
        
        if (employees && employees.length > 0) {
          setEmployee(employees[0]);
        }
      } catch (error) {
        console.error("Error loading user:", error);
      }
    };

    loadUserData();
  }, []);

  const isAdmin = employee?.role === "admin" || employee?.role === "super_admin";

  const { data: allRequests = [], isLoading } = useQuery({
    queryKey: ["allVacationRequests", employee?.id, isAdmin],
    queryFn: async () => {
      if (!employee) return [];

      // Admin/super_admin: cargar todas las solicitudes
      if (isAdmin) {
        return await base44.entities.VacationRequest.list("-created_date", 500);
      }

      // Manager: cargar solicitudes de su departamento
      // Si tiene managed_team_ids, usar esos; si no, usar su departamento
      if (employee.managed_team_ids && employee.managed_team_ids.length > 0) {
        const requests = await base44.entities.VacationRequest.list("-created_date", 500);
        return requests.filter(r => employee.managed_team_ids.includes(r.employee_id));
      }

      if (employee.department_name) {
        const deptEmployees = await base44.entities.Employee.filter({
          department_name: employee.department_name,
        });
        const employeeIds = deptEmployees.map(e => e.id);
        const requests = await base44.entities.VacationRequest.list("-created_date", 500);
        return requests.filter(r => employeeIds.includes(r.employee_id));
      }

      return [];
    },
    enabled: !!employee,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["departmentEmployees", employee?.id, isAdmin],
    queryFn: async () => {
      if (!employee) return [];
      if (isAdmin) return await base44.entities.Employee.list("-created_date");
      if (employee.department_name) {
        return await base44.entities.Employee.filter({ department_name: employee.department_name });
      }
      return [];
    },
    enabled: !!employee,
  });

  // Extrae "yyyy-MM-dd" de forma segura desde cualquier formato de fecha
  const extractDateStr = (input) => {
    if (!input) return null;
    const s = String(input).trim();
    // Si ya es "yyyy-MM-dd" exacto, usarlo directo
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // Para ISO datetime u otros formatos, parsear y leer en UTC
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // Crea/sobreescribe registros de asistencia para cada día del período de vacaciones
  const createAttendanceRecordsForVacation = async (request) => {
    const startStr = extractDateStr(request.start_date);
    const endStr = extractDateStr(request.end_date);
    if (!startStr || !endStr) {
      console.error("[Vacaciones] Fechas inválidas:", request.start_date, request.end_date);
      return;
    }

    // Generar todas las fechas del período usando UTC noon para evitar desfases de TZ
    const allDates = [];
    const [sy, sm, sd] = startStr.split("-").map(Number);
    const [ey, em, ed] = endStr.split("-").map(Number);
    let cur = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));
    const endUTC = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));
    while (cur <= endUTC) {
      const y = cur.getUTCFullYear();
      const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
      const d = String(cur.getUTCDate()).padStart(2, "0");
      allDates.push(`${y}-${m}-${d}`);
      cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
    }

    console.log(`[Vacaciones] Registrando asistencia para ${allDates.length} días:`, allDates);

    // Buscar registros existentes del empleado en el período exacto
    const allExisting = await base44.entities.AttendanceRecord.filter({
      employee_id: request.employee_id,
    });
    // Indexar por fecha normalizada para lookup O(1)
    const existingByDate = {};
    allExisting.forEach(r => {
      const normalizedDate = extractDateStr(r.date) || r.date;
      existingByDate[normalizedDate] = r;
    });

    const vacationPayload = (dateStr) => ({
      employee_id: request.employee_id,
      date: dateStr,
      clock_in: "09:00",
      clock_out: "18:00",
      scheduled_start: "09:00",
      scheduled_end: "18:00",
      worked_hours: 8,
      regular_hours: 8,
      overtime_hours_25: 0,
      overtime_hours_35: 0,
      overtime_authorized: false,
      is_late: false,
      late_minutes: 0,
      is_absent: false,
      status: "Vacaciones",
      notes: `Vacaciones aprobadas (${request.request_type})`,
    });

    let created = 0;
    let updated = 0;
    for (const dateStr of allDates) {
      if (existingByDate[dateStr]) {
        await base44.entities.AttendanceRecord.update(existingByDate[dateStr].id, vacationPayload(dateStr));
        updated++;
      } else {
        await base44.entities.AttendanceRecord.create(vacationPayload(dateStr));
        created++;
      }
    }
    console.log(`[Vacaciones] Asistencia procesada: ${created} creados, ${updated} actualizados.`);
  };

  const updateRequestMutation = useMutation({
    mutationFn: async ({ id, data, request }) => {
      const updatedRequest = await base44.entities.VacationRequest.update(id, data);
      
      if (data.status === "Aprobada") {
        // Actualizar balance de vacaciones si es solicitud de vacaciones
        if (request.request_type === "Vacaciones") {
          const balances = await base44.entities.VacationBalance.filter({
            employee_id: request.employee_id,
            is_active: true
          });
          
          if (balances.length > 0) {
            const balance = balances[0];
            await base44.entities.VacationBalance.update(balance.id, {
              days_taken: (balance.days_taken || 0) + request.business_days,
              days_pending: (balance.total_entitled_days || 0) - ((balance.days_taken || 0) + request.business_days)
            });
          }
        }
        
        // Si es permiso sin goce, crear concepto de descuento en planilla
        if (request.request_type === "Permiso sin goce") {
          const emp = employees.find(e => e.id === request.employee_id);
          if (emp && emp.base_salary) {
            const startDateStr = extractDateStr(request.start_date) || request.start_date;
            const [startY, startM] = startDateStr.split("-").map(Number);
            const discountAmount = (emp.base_salary / 30) * request.total_days;
            
            await base44.entities.PayrollConcept.create({
              employee_id: request.employee_id,
              concept_type: "Descuento",
              concept_name: "Permiso sin goce",
              amount: discountAmount,
              is_dynamic: false,
              month: startM,
              year: startY,
              is_recurring: false,
              is_applied: false,
              notes: `Descuento por ${request.total_days} días de permiso sin goce (${format(parseDateLima(request.start_date), "dd/MM/yyyy")} - ${format(parseDateLima(request.end_date), "dd/MM/yyyy")})`
            });
          }
        }

        // Crear/sobreescribir registros de asistencia para TODOS los días del período
        await createAttendanceRecordsForVacation(request);
      }
      
      return updatedRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["allVacationRequests"]);
      queryClient.invalidateQueries(["vacationBalances"]);
      queryClient.invalidateQueries(["todayAttendance"]);
      queryClient.invalidateQueries(["allAttendanceRecords"]);
      toast.success("Solicitud aprobada y asistencia registrada correctamente");
      setSelectedRequest(null);
      setReviewForm({ action: "", comments: "" });
    },
    onError: (error) => {
      toast.error("Error al actualizar la solicitud");
      console.error(error);
    },
  });

  const handleReview = (action) => {
    if (!selectedRequest) return;

    // Validar comentario solo para rechazo
    if (action === "reject" && !reviewForm.comments.trim()) {
      toast.error("El motivo del rechazo es obligatorio");
      return;
    }

    const updateData = {
      status: action === "approve" ? "Aprobada" : "Rechazada",
      approved_by: `${employee.first_name} ${employee.last_name}`,
      approved_date: format(new Date(), "yyyy-MM-dd"),
      rejection_reason: action === "reject" ? reviewForm.comments : null,
      comments: reviewForm.comments || null,
    };

    updateRequestMutation.mutate({
      id: selectedRequest.id,
      data: updateData,
      request: selectedRequest,
    });
  };

  const getStatusConfig = (status) => {
    const configs = {
      "Pendiente": { color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
      "Aprobada": { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle },
      "Rechazada": { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
      "Cancelada": { color: "bg-slate-100 text-slate-700 border-slate-200", icon: AlertCircle },
    };
    return configs[status] || configs["Pendiente"];
  };

  const getEmployeeName = (employeeId) => {
    const emp = employees.find(e => e.id === employeeId);
    return emp ? `${emp.first_name} ${emp.last_name}` : "Desconocido";
  };

  const filteredRequests = allRequests.filter(request => {
    const matchesStatus = filterStatus === "all" || request.status === filterStatus;
    const employeeName = getEmployeeName(request.employee_id).toLowerCase();
    const matchesSearch = employeeName.includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const stats = {
    pending: allRequests.filter(r => r.status === "Pendiente").length,
    approved: allRequests.filter(r => r.status === "Aprobada").length,
    rejected: allRequests.filter(r => r.status === "Rechazada").length,
  };

  if (!employee || isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card><CardContent className="p-8 flex items-center gap-3"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /><p>Cargando...</p></CardContent></Card>
      </div>
    );
  }

  return (
    <PermissionGuard employee={employee} requiredAnyPermissions={["vacations.approve", "vacations.manage", "system.admin"]}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Aprobación de Vacaciones
          </h1>
          <p className="text-slate-600 text-lg">
            Gestiona las solicitudes de tu equipo
          </p>
        </div>

        {/* Stats Cards */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Clock className="w-5 h-5 text-yellow-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.pending}</span>
              <span className="text-sm text-slate-600">Pendientes de revisión</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.approved}</span>
              <span className="text-sm text-slate-600">Aprobadas</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <XCircle className="w-5 h-5 text-red-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.rejected}</span>
              <span className="text-sm text-slate-600">Rechazadas</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-lg mb-8">
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="Buscar por empleado..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="flex gap-2">
                {["all", "Pendiente", "Aprobada", "Rechazada"].map((status) => (
                  <Button
                    key={status}
                    variant={filterStatus === status ? "default" : "outline"}
                    onClick={() => setFilterStatus(status)}
                    className={filterStatus === status ? "bg-indigo-600" : ""}
                  >
                    {status === "all" ? "Todas" : status}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Requests List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredRequests.length === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 text-lg">No se encontraron solicitudes</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredRequests.map((request) => {
              const StatusIcon = getStatusConfig(request.status).icon;
              const empName = getEmployeeName(request.employee_id);
              
              return (
                <Card 
                  key={request.id}
                  className="border-0 shadow-lg hover:shadow-xl transition-all"
                >
                  <CardHeader className="border-b bg-slate-50/50">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <User className="w-4 h-4 text-slate-500" />
                          <h3 className="font-bold text-slate-900">{empName}</h3>
                        </div>
                        <Badge className={getStatusConfig(request.status).color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {request.status}
                        </Badge>
                      </div>
                      <div className="p-3 bg-indigo-100 rounded-xl">
                        <Calendar className="w-5 h-5 text-indigo-600" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div>
                        <span className="text-sm text-slate-600">Tipo:</span>
                        <p className="font-semibold text-slate-900">{request.request_type}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-sm text-slate-600">Desde:</span>
                          <p className="font-semibold text-slate-900">
                            {format(parseDateLima(request.start_date), "dd MMM yyyy", { locale: es })}
                          </p>
                        </div>
                        <div>
                          <span className="text-sm text-slate-600">Hasta:</span>
                          <p className="font-semibold text-slate-900">
                            {format(parseDateLima(request.end_date), "dd MMM yyyy", { locale: es })}
                          </p>
                        </div>
                      </div>

                      <div>
                        <span className="text-sm text-slate-600">Duración:</span>
                        <p className="font-semibold text-slate-900">
                          {request.total_days} días ({request.business_days} hábiles)
                        </p>
                      </div>

                      {request.reason && (
                        <div>
                          <span className="text-sm text-slate-600">Motivo:</span>
                          <p className="text-slate-900 text-sm mt-1">{request.reason}</p>
                        </div>
                      )}

                      {request.supporting_document_url && (
                        <a 
                          href={request.supporting_document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-indigo-600 hover:underline"
                        >
                          📎 Ver documento adjunto
                        </a>
                      )}

                      {request.status === "Aprobada" && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                          <strong>Aprobado por:</strong> {request.approved_by}
                          <br />
                          <strong>Fecha:</strong> {format(parseDateLima(request.approved_date), "dd MMM yyyy", { locale: es })}
                        </div>
                      )}

                      {request.status === "Rechazada" && request.rejection_reason && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                          <strong>Motivo de rechazo:</strong> {request.rejection_reason}
                        </div>
                      )}

                      {request.status === "Pendiente" && (
                        <div className="flex gap-3 pt-4 border-t">
                          <Button
                            variant="outline"
                            className="flex-1 text-red-600 hover:bg-red-50"
                            onClick={() => {
                              setSelectedRequest(request);
                              setReviewAction("reject");
                            }}
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Rechazar
                          </Button>
                          <Button
                            className="flex-1 bg-green-600 hover:bg-green-700"
                            onClick={() => {
                              setSelectedRequest(request);
                              setReviewAction("approve");
                            }}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Aprobar
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Review Modal */}
        {selectedRequest && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
            onClick={() => {
              setSelectedRequest(null);
              setReviewAction(null);
              setReviewForm({ action: "", comments: "" });
            }}
          >
            <Card 
              className="max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className={`border-b ${reviewAction === "approve" ? "bg-green-50" : "bg-red-50"}`}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">
                    {reviewAction === "approve" ? "Aprobar Solicitud" : "Rechazar Solicitud"}
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => {
                      setSelectedRequest(null);
                      setReviewAction(null);
                      setReviewForm({ action: "", comments: "" });
                    }}
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600 mb-1">
                      <strong>Empleado:</strong> {getEmployeeName(selectedRequest.employee_id)}
                    </p>
                    <p className="text-sm text-slate-600 mb-1">
                      <strong>Tipo:</strong> {selectedRequest.request_type}
                    </p>
                    <p className="text-sm text-slate-600 mb-1">
                      <strong>Periodo:</strong> {format(parseDateLima(selectedRequest.start_date), "dd MMM", { locale: es })} - {format(parseDateLima(selectedRequest.end_date), "dd MMM yyyy", { locale: es })}
                    </p>
                    <p className="text-sm text-slate-600">
                      <strong>Días:</strong> {selectedRequest.total_days} días ({selectedRequest.business_days} hábiles)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      {reviewAction === "approve" ? "Comentario (Opcional)" : "Motivo del rechazo *"}
                    </label>
                    <Textarea
                      value={reviewForm.comments}
                      onChange={(e) => setReviewForm({ ...reviewForm, comments: e.target.value })}
                      placeholder={
                        reviewAction === "approve" 
                          ? "Ej: Aprobado. Que disfrute sus vacaciones..." 
                          : "Explica por qué se rechaza esta solicitud..."
                      }
                      rows={4}
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setSelectedRequest(null);
                        setReviewAction(null);
                        setReviewForm({ action: "", comments: "" });
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className={`flex-1 ${reviewAction === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
                      onClick={() => handleReview(reviewAction)}
                      disabled={updateRequestMutation.isPending || (reviewAction === "reject" && !reviewForm.comments.trim())}
                    >
                      {updateRequestMutation.isPending 
                        ? (reviewAction === "approve" ? "Aprobando..." : "Rechazando...") 
                        : (reviewAction === "approve" ? "Confirmar Aprobación" : "Confirmar Rechazo")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
    </PermissionGuard>
  );
}