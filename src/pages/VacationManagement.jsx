import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Calendar, Users, CheckCircle, XCircle, Clock, 
  TrendingUp, AlertCircle, Search, FileText, Eye
} from "lucide-react";
import { format, differenceInDays, addYears, eachDayOfInterval, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { createPageUrl } from "../utils";

export default function VacationManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedEmployee, setSelectedEmployee] = useState(null);

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

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      return await base44.entities.Employee.filter({ status: "Activo" });
    },
  });

  const { data: vacationRequests = [] } = useQuery({
    queryKey: ["vacationRequests"],
    queryFn: async () => {
      return await base44.entities.VacationRequest.list("-created_date");
    },
  });

  const { data: vacationBalances = [] } = useQuery({
    queryKey: ["vacationBalances"],
    queryFn: async () => {
      return await base44.entities.VacationBalance.list("-created_date");
    },
  });

  const calculateVacationBalance = (emp) => {
    const empBalance = vacationBalances.find(vb => vb.employee_id === emp.id && vb.is_active);
    
    if (empBalance) {
      return {
        total: empBalance.total_entitled_days,
        taken: empBalance.days_taken,
        pending: empBalance.days_pending,
        available: empBalance.days_pending,
        expired: false
      };
    }

    // Calcular basado en antigüedad si no existe balance
    if (!emp.hire_date) return { total: 30, taken: 0, pending: 30, available: 30, expired: false };

    const hireDate = new Date(emp.hire_date);
    const today = new Date();
    const yearsDiff = differenceInDays(today, hireDate) / 365;

    if (yearsDiff < 1) {
      return { total: 0, taken: 0, pending: 0, available: 0, expired: false };
    }

    return { total: 30, taken: 0, pending: 30, available: 30, expired: false };
  };

  const approveRequestMutation = useMutation({
    mutationFn: async (request) => {
      // Actualizar estado de la solicitud
      await base44.entities.VacationRequest.update(request.id, {
        status: "Aprobada",
        approved_by: `${employee.first_name} ${employee.last_name}`,
        approved_date: format(new Date(), "yyyy-MM-dd"),
      });

      // Actualizar balance de vacaciones
      if (request.request_type === "Vacaciones") {
        const balances = await base44.entities.VacationBalance.filter({
          employee_id: request.employee_id,
          is_active: true,
        });
        if (balances.length > 0) {
          const balance = balances[0];
          await base44.entities.VacationBalance.update(balance.id, {
            days_taken: (balance.days_taken || 0) + (request.business_days || request.total_days),
            days_pending: (balance.total_entitled_days || 0) - ((balance.days_taken || 0) + (request.business_days || request.total_days)),
          });
        }
      }

      // Crear/actualizar registros de asistencia para todo el período
      const startDate = parseISO(request.start_date);
      const endDate = parseISO(request.end_date);
      const days = eachDayOfInterval({ start: startDate, end: endDate });

      const existingRecords = await base44.entities.AttendanceRecord.filter({
        employee_id: request.employee_id,
      });
      const existingByDate = {};
      existingRecords.forEach(r => { existingByDate[r.date] = r; });

      for (const day of days) {
        const dateStr = format(day, "yyyy-MM-dd");
        if (existingByDate[dateStr]) {
          await base44.entities.AttendanceRecord.update(existingByDate[dateStr].id, {
            status: "Justificado",
            notes: `Vacaciones aprobadas (${request.request_type})`,
          });
        } else {
          await base44.entities.AttendanceRecord.create({
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
            is_late: false,
            late_minutes: 0,
            is_absent: false,
            status: "Justificado",
            notes: `Vacaciones aprobadas (${request.request_type})`,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["vacationRequests"]);
      queryClient.invalidateQueries(["vacationBalances"]);
      queryClient.invalidateQueries(["todayAttendance"]);
      queryClient.invalidateQueries(["allAttendanceRecords"]);
      toast.success("Solicitud aprobada y asistencia registrada");
    },
    onError: () => {
      toast.error("Error al aprobar la solicitud");
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: async (request) => {
      await base44.entities.VacationRequest.update(request.id, {
        status: "Rechazada",
        approved_by: `${employee.first_name} ${employee.last_name}`,
        approved_date: format(new Date(), "yyyy-MM-dd"),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["vacationRequests"]);
      toast.success("Solicitud rechazada");
    },
    onError: () => {
      toast.error("Error al rechazar la solicitud");
    },
  });

  const createVacationBalanceMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.VacationBalance.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["vacationBalances"]);
      toast.success("Saldo de vacaciones inicializado");
    },
    onError: () => {
      toast.error("Error al inicializar saldo");
    },
  });

  const initializeBalances = async () => {
    const employeesWithoutBalance = allEmployees.filter(emp => {
      const hasBalance = vacationBalances.some(vb => vb.employee_id === emp.id);
      return !hasBalance && emp.hire_date;
    });

    for (const emp of employeesWithoutBalance) {
      const hireDate = new Date(emp.hire_date);
      const today = new Date();
      const yearsDiff = differenceInDays(today, hireDate) / 365;

      if (yearsDiff >= 1) {
        await createVacationBalanceMutation.mutateAsync({
          employee_id: emp.id,
          period_start: format(hireDate, "yyyy-MM-dd"),
          period_end: format(addYears(hireDate, 1), "yyyy-MM-dd"),
          total_entitled_days: 30,
          days_taken: 0,
          days_pending: 30,
          days_sold: 0,
          is_active: true,
          deadline: format(addYears(hireDate, 2), "yyyy-MM-dd")
        });
      }
    }

    toast.success(`${employeesWithoutBalance.length} saldos inicializados`);
  };

  const filteredEmployees = allEmployees.filter(emp => {
    const matchesSearch = emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const stats = {
    totalEmployees: allEmployees.length,
    pendingRequests: vacationRequests.filter(r => r.status === "Pendiente").length,
    approvedRequests: vacationRequests.filter(r => r.status === "Aprobada").length,
    rejectedRequests: vacationRequests.filter(r => r.status === "Rechazada").length,
  };

  // Mientras carga el empleado, mostrar spinner
  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              Gestión de Vacaciones
            </h1>
            <p className="text-slate-600 text-lg">
              Administra solicitudes, saldos y calendario de vacaciones
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => window.location.href = createPageUrl("VacationCalendar")}
              variant="outline"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Ver Calendario
            </Button>
            <Button
              onClick={() => window.location.href = createPageUrl("ManagerApprovals")}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Aprobar Solicitudes
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Users className="w-5 h-5 text-blue-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.totalEmployees}</span>
              <span className="text-sm text-slate-600">Total Empleados</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Clock className="w-5 h-5 text-amber-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.pendingRequests}</span>
              <span className="text-sm text-slate-600">Solicitudes Pendientes</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.approvedRequests}</span>
              <span className="text-sm text-slate-600">Solicitudes Aprobadas</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <XCircle className="w-5 h-5 text-red-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.rejectedRequests}</span>
              <span className="text-sm text-slate-600">Solicitudes Rechazadas</span>
            </div>
          </div>
        </div>

        <Tabs defaultValue="balances" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="balances">Saldos de Vacaciones</TabsTrigger>
            <TabsTrigger value="requests">Solicitudes</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>

          {/* Saldos de Vacaciones */}
          <TabsContent value="balances" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">Saldos de Vacaciones</CardTitle>
                  <Button
                    onClick={initializeBalances}
                    variant="outline"
                    disabled={createVacationBalanceMutation.isPending}
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    {createVacationBalanceMutation.isPending ? "Inicializando..." : "Inicializar Saldos"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      placeholder="Buscar empleado..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredEmployees.map(emp => {
                    const balance = calculateVacationBalance(emp);
                    const percentage = balance.total > 0 ? (balance.available / balance.total) * 100 : 0;

                    return (
                      <div key={emp.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-bold text-slate-900">
                              {emp.first_name} {emp.last_name}
                            </h4>
                            <p className="text-sm text-slate-600">
                              {emp.employee_code} • {emp.department_name}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedEmployee(emp)}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            Ver Detalle
                          </Button>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-slate-600 mb-1">Días Disponibles</p>
                              <p className="text-2xl font-bold text-green-600">{balance.available} días</p>
                            </div>
                            <div className="text-right">
                              <Badge className={
                                balance.available === 0 ? "bg-red-100 text-red-700" :
                                balance.available < 10 ? "bg-amber-100 text-amber-700" :
                                "bg-green-100 text-green-700"
                              }>
                                {balance.available === 0 ? "Sin saldo" :
                                 balance.available < 10 ? "Saldo bajo" :
                                 "Disponible"}
                              </Badge>
                            </div>
                          </div>
                          
                          <Progress value={percentage} className="h-2" />
                          
                          <div className="grid grid-cols-4 gap-3 text-xs">
                            <div className="bg-slate-50 rounded p-2 text-center">
                              <p className="text-slate-600 mb-1">Total</p>
                              <p className="font-bold text-slate-900 text-lg">{balance.total}</p>
                            </div>
                            <div className="bg-blue-50 rounded p-2 text-center">
                              <p className="text-blue-600 mb-1">Tomados</p>
                              <p className="font-bold text-blue-700 text-lg">{balance.taken}</p>
                            </div>
                            <div className="bg-green-50 rounded p-2 text-center">
                              <p className="text-green-600 mb-1">Disponibles</p>
                              <p className="font-bold text-green-700 text-lg">{balance.available}</p>
                            </div>
                            <div className="bg-purple-50 rounded p-2 text-center">
                              <p className="text-purple-600 mb-1">Progreso</p>
                              <p className="font-bold text-purple-700 text-lg">{Math.round(percentage)}%</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Solicitudes */}
          <TabsContent value="requests" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b">
                <CardTitle className="text-xl font-bold">Solicitudes de Vacaciones</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {vacationRequests
                    .filter(r => statusFilter === "all" || r.status === statusFilter)
                    .map(request => {
                      const emp = allEmployees.find(e => e.id === request.employee_id);
                      if (!emp) return null;

                      const statusConfig = {
                        "Pendiente": { color: "bg-amber-100 text-amber-700", icon: Clock },
                        "Aprobada": { color: "bg-green-100 text-green-700", icon: CheckCircle },
                        "Rechazada": { color: "bg-red-100 text-red-700", icon: XCircle },
                        "Cancelada": { color: "bg-slate-100 text-slate-700", icon: XCircle },
                      };

                      const config = statusConfig[request.status] || statusConfig["Pendiente"];
                      const StatusIcon = config.icon;

                      return (
                        <div key={request.id} className="p-4 border border-slate-200 rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="font-bold text-slate-900">
                                {emp.first_name} {emp.last_name}
                              </h4>
                              <p className="text-sm text-slate-600">{emp.department_name}</p>
                            </div>
                            <Badge className={config.color}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {request.status}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-slate-600">Tipo</p>
                              <p className="font-semibold text-slate-900">{request.request_type}</p>
                            </div>
                            <div>
                              <p className="text-slate-600">Días</p>
                              <p className="font-semibold text-slate-900">{request.total_days} días</p>
                            </div>
                            <div>
                              <p className="text-slate-600">Desde</p>
                              <p className="font-semibold text-slate-900">
                                {format(new Date(request.start_date), "dd/MM/yyyy")}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-600">Hasta</p>
                              <p className="font-semibold text-slate-900">
                                {format(new Date(request.end_date), "dd/MM/yyyy")}
                              </p>
                            </div>
                          </div>

                          {request.reason && (
                            <p className="text-sm text-slate-600 mt-2 italic">
                              "{request.reason}"
                            </p>
                          )}

                          {request.status === "Pendiente" && (
                            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-red-600 hover:bg-red-50 border-red-200"
                                disabled={rejectRequestMutation.isPending || approveRequestMutation.isPending}
                                onClick={() => rejectRequestMutation.mutate(request)}
                              >
                                <XCircle className="w-3 h-3 mr-1" />
                                Rechazar
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 bg-green-600 hover:bg-green-700"
                                disabled={approveRequestMutation.isPending || rejectRequestMutation.isPending}
                                onClick={() => approveRequestMutation.mutate(request)}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Aprobar
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Historial */}
          <TabsContent value="history" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b">
                <CardTitle className="text-xl font-bold">Historial de Vacaciones</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {vacationRequests
                    .filter(r => r.status === "Aprobada")
                    .map(request => {
                      const emp = allEmployees.find(e => e.id === request.employee_id);
                      if (!emp) return null;

                      return (
                        <div key={request.id} className="p-4 border border-green-200 bg-green-50 rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-bold text-slate-900">
                                {emp.first_name} {emp.last_name}
                              </h4>
                              <p className="text-sm text-slate-600">{emp.department_name}</p>
                            </div>
                            <Badge className="bg-green-100 text-green-700">
                              {request.total_days} días
                            </Badge>
                          </div>

                          <div className="text-sm text-slate-700">
                            <p>
                              <strong>Período:</strong> {format(new Date(request.start_date), "dd/MM/yyyy")} - {format(new Date(request.end_date), "dd/MM/yyyy")}
                            </p>
                            {request.approved_by && (
                              <p className="text-xs text-slate-600 mt-1">
                                Aprobado por: {request.approved_by}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Employee Detail Modal */}
      {selectedEmployee && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
          onClick={() => setSelectedEmployee(null)}
        >
          <Card 
            className="max-w-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  Detalle de Vacaciones - {selectedEmployee.first_name} {selectedEmployee.last_name}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setSelectedEmployee(null)}>
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {(() => {
                const balance = calculateVacationBalance(selectedEmployee);
                const empRequests = vacationRequests.filter(r => r.employee_id === selectedEmployee.id);
                
                return (
                  <div className="space-y-6">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <h5 className="font-bold text-slate-900 mb-3">Saldo Actual</h5>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-2xl font-bold text-blue-600">{balance.total}</p>
                          <p className="text-xs text-slate-600">Total Días</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-slate-900">{balance.taken}</p>
                          <p className="text-xs text-slate-600">Tomados</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-green-600">{balance.available}</p>
                          <p className="text-xs text-slate-600">Disponibles</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h5 className="font-bold text-slate-900 mb-3">Historial de Solicitudes</h5>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {empRequests.length === 0 ? (
                          <p className="text-slate-600 text-sm text-center py-4">
                            No hay solicitudes registradas
                          </p>
                        ) : (
                          empRequests.map(req => (
                            <div key={req.id} className="p-3 border border-slate-200 rounded text-sm">
                              <div className="flex items-center justify-between mb-1">
                                <Badge className={
                                  req.status === "Pendiente" ? "bg-amber-100 text-amber-700" :
                                  req.status === "Aprobada" ? "bg-green-100 text-green-700" :
                                  "bg-red-100 text-red-700"
                                }>
                                  {req.status}
                                </Badge>
                                <span className="text-slate-600">{req.total_days} días</span>
                              </div>
                              <p className="text-slate-900">
                                {format(new Date(req.start_date), "dd/MM/yyyy")} - {format(new Date(req.end_date), "dd/MM/yyyy")}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}