import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from '@/api/entitiesClient';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Calendar, Users, CheckCircle, XCircle, Clock,
  TrendingUp, Search, Eye
} from "lucide-react";
import { format, differenceInDays, addYears } from "date-fns";
import { toast } from "sonner";
import { parseDateLima } from "@/lib/dateUtils";
import { createPageUrl } from "../utils";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";
import { useNavigate } from "react-router-dom";
import PaginationBar from "@/components/ui/PaginationBar";
import { usePermissions } from "../components/hooks/usePermissions";

export default function VacationManagement() {
  const navigate = useNavigate();
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Saldos filters & pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [balanceDeptFilter, setBalanceDeptFilter] = useState("all");
  const [balanceSaldoFilter, setBalanceSaldoFilter] = useState("all");
  const [balancePage, setBalancePage] = useState(1);
  const BALANCE_PAGE_SIZE = 20;

  // Solicitudes filters & pagination
  const [reqSearchTerm, setReqSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reqTypeFilter, setReqTypeFilter] = useState("all");
  const [reqPage, setReqPage] = useState(1);
  const REQ_PAGE_SIZE = 20;

  // Historial filters & pagination
  const [histSearchTerm, setHistSearchTerm] = useState("");
  const [histDeptFilter, setHistDeptFilter] = useState("all");
  const [histStatusFilter, setHistStatusFilter] = useState("all");
  const [histTypeFilter, setHistTypeFilter] = useState("all");
  const [histPage, setHistPage] = useState(1);
  const HIST_PAGE_SIZE = 20;

  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const queryClient = useQueryClient();

  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;

  useEffect(() => {
    if (currentUser?.employee?.role === "admin" || currentUser?.employee?.role === "super_admin") {
      updateEmployeeStatuses().then(result => {
        if (result.success && result.updatedCount > 0) {
          console.log(`${result.updatedCount} empleado(s) actualizado(s) a estado Cesado automáticamente`);
        }
      });
    }
  }, [currentUser]);

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      return await entitiesAPI.Employee.filter({ status: "Activo" });
    },
  });

  const { data: vacationRequests = [] } = useQuery({
    queryKey: ["allVacationRequests"],
    queryFn: async () => {
      return await entitiesAPI.VacationRequest.list("-created_date");
    },
  });

  const { data: vacationBalances = [] } = useQuery({
    queryKey: ["vacationBalances"],
    queryFn: async () => {
      return await entitiesAPI.VacationBalance.list("-created_date");
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
      await entitiesAPI.VacationRequest.update(request.id, {
        status: "Aprobada",
        approved_by: `${employee.first_name} ${employee.last_name}`,
        approved_date: format(new Date(), "yyyy-MM-dd"),
      });

      // Actualizar balance de vacaciones
      if (request.request_type === "Vacaciones") {
        const balances = await entitiesAPI.VacationBalance.filter({
          employee_id: request.employee_id,
          is_active: true,
        });
        if (balances.length > 0) {
          const balance = balances[0];
          await entitiesAPI.VacationBalance.update(balance.id, {
            days_taken: (balance.days_taken || 0) + (request.business_days || request.total_days),
            days_pending: (balance.total_entitled_days || 0) - ((balance.days_taken || 0) + (request.business_days || request.total_days)),
          });
        }
      }

      // Extraer "yyyy-MM-dd" de forma segura desde cualquier formato
      const extractDateStr = (input) => {
        if (!input) return null;
        const s = String(input).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const d = new Date(s);
        if (isNaN(d.getTime())) return null;
        const y = d.getUTCFullYear();
        const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        return `${y}-${mo}-${day}`;
      };

      const startStr = extractDateStr(request.start_date);
      const endStr = extractDateStr(request.end_date);

      // Generar fechas "yyyy-MM-dd" usando UTC noon para evitar cualquier desfase de TZ
      const allDates = [];
      if (startStr && endStr) {
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
      }

      console.log(`[Vacaciones] Registrando asistencia para ${allDates.length} días:`, allDates);

      const allExisting = await entitiesAPI.AttendanceRecord.filter({
        employee_id: request.employee_id,
      });
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
        status: "Justificado",
        notes: `Vacaciones aprobadas (${request.request_type})`,
      });

      let created = 0;
      let updated = 0;
      for (const dateStr of allDates) {
        if (existingByDate[dateStr]) {
          // Sobreescribir TODOS los campos del registro existente con los datos de vacaciones
          await entitiesAPI.AttendanceRecord.update(existingByDate[dateStr].id, vacationPayload(dateStr));
          updated++;
        } else {
          await entitiesAPI.AttendanceRecord.create(vacationPayload(dateStr));
          created++;
        }
      }
      console.log(`[Vacaciones] Asistencia procesada: ${created} creados, ${updated} actualizados.`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["vacationRequests"]);
      queryClient.invalidateQueries(["vacationBalances"]);
      queryClient.invalidateQueries(["todayAttendance"]);
      queryClient.invalidateQueries(["allAttendanceRecords"]);
      toast.success("Solicitud aprobada y asistencia registrada");
    },
    onError: (error) => {
      console.error("[Vacaciones] Error al aprobar:", error);
      toast.error("Error al aprobar la solicitud");
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: async (request) => {
      await entitiesAPI.VacationRequest.update(request.id, {
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
      return await entitiesAPI.VacationBalance.create(data);
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
      };
    };

    toast.success(`${employeesWithoutBalance.length} saldos inicializados`);
  };

  const allDepts = [...new Set(allEmployees.map(e => e.department_name).filter(Boolean))].sort();
  const allReqTypes = [...new Set(vacationRequests.map(r => r.request_type).filter(Boolean))].sort();

  const filteredEmployees = allEmployees.filter(emp => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = !term ||
      emp.first_name.toLowerCase().includes(term) ||
      emp.last_name.toLowerCase().includes(term) ||
      (emp.employee_code || "").toLowerCase().includes(term);
    const matchesDept = balanceDeptFilter === "all" || emp.department_name === balanceDeptFilter;
    const balance = calculateVacationBalance(emp);
    const matchesSaldo = balanceSaldoFilter === "all" ||
      (balanceSaldoFilter === "disponible" && balance.available > 0) ||
      (balanceSaldoFilter === "sin_saldo" && balance.available === 0) ||
      (balanceSaldoFilter === "bajo" && balance.available > 0 && balance.available < 10);
    return matchesSearch && matchesDept && matchesSaldo;
  });

  const filteredRequests = vacationRequests.filter(r => {
    const emp = allEmployees.find(e => e.id === r.employee_id);
    const term = reqSearchTerm.toLowerCase();
    const matchesSearch = !term || (emp && (`${emp.first_name} ${emp.last_name}`.toLowerCase().includes(term) || (emp.employee_code || "").toLowerCase().includes(term)));
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    const matchesType = reqTypeFilter === "all" || r.request_type === reqTypeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const histStatuses = [...new Set(vacationRequests.map(r => r.status).filter(Boolean))].sort();

  const filteredHistory = vacationRequests.filter(r => {
    const emp = allEmployees.find(e => e.id === r.employee_id);
    const term = histSearchTerm.toLowerCase();
    const matchesSearch = !term || (emp && (`${emp.first_name} ${emp.last_name}`.toLowerCase().includes(term) || (emp.employee_code || "").toLowerCase().includes(term)));
    const matchesDept = histDeptFilter === "all" || (emp && emp.department_name === histDeptFilter);
    const matchesStatus = histStatusFilter === "all" || r.status === histStatusFilter;
    const matchesType = histTypeFilter === "all" || r.request_type === histTypeFilter;
    return matchesSearch && matchesDept && matchesStatus && matchesType;
  });

  const stats = {
    totalEmployees: allEmployees.length,
    pendingRequests: vacationRequests.filter(r => r.status === "Pendiente").length,
    approvedRequests: vacationRequests.filter(r => r.status === "Aprobada").length,
    rejectedRequests: vacationRequests.filter(r => r.status === "Rechazada").length,
  };

  // Mientras carga el empleado o permisos, mostrar spinner
  if (!employee || permissionsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Guard de acceso — solo roles con permisos de vacaciones
  if (!hasPermission("vacations.manage") && !hasPermission("vacations.view_all") &&
      !hasPermission("vacations.approve") && !hasPermission("system.admin")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">No tienes permisos para gestionar vacaciones</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">
              Gestión de Vacaciones
            </h1>
            <p className="text-slate-600 text-lg">
              Administra solicitudes, saldos y calendario de vacaciones
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => navigate(createPageUrl("VacationCalendar"))}
              variant="outline"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Ver Calendario
            </Button>
            <Button
              onClick={() => navigate(createPageUrl("ManagerApprovals"))}
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
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input placeholder="Buscar empleado..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setBalancePage(1); }} className="pl-9" />
                  </div>
                  <Select value={balanceDeptFilter} onValueChange={(v) => { setBalanceDeptFilter(v); setBalancePage(1); }}>
                    <SelectTrigger className="w-44"><SelectValue placeholder="Departamento" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los deptos.</SelectItem>
                      {allDepts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={balanceSaldoFilter} onValueChange={(v) => { setBalanceSaldoFilter(v); setBalancePage(1); }}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Saldo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los saldos</SelectItem>
                      <SelectItem value="disponible">Con saldo</SelectItem>
                      <SelectItem value="bajo">Saldo bajo (&lt;10)</SelectItem>
                      <SelectItem value="sin_saldo">Sin saldo</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="ml-auto">
                    <PaginationBar inline currentPage={balancePage} totalItems={filteredEmployees.length} pageSize={BALANCE_PAGE_SIZE} onPageChange={setBalancePage} />
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredEmployees.slice((balancePage - 1) * BALANCE_PAGE_SIZE, balancePage * BALANCE_PAGE_SIZE).map(emp => {
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
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input placeholder="Buscar empleado..." value={reqSearchTerm} onChange={(e) => { setReqSearchTerm(e.target.value); setReqPage(1); }} className="pl-9" />
                  </div>
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setReqPage(1); }}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      <SelectItem value="Pendiente">Pendiente</SelectItem>
                      <SelectItem value="Aprobada">Aprobada</SelectItem>
                      <SelectItem value="Rechazada">Rechazada</SelectItem>
                      <SelectItem value="Cancelada">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={reqTypeFilter} onValueChange={(v) => { setReqTypeFilter(v); setReqPage(1); }}>
                    <SelectTrigger className="w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los tipos</SelectItem>
                      {allReqTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="ml-auto">
                    <PaginationBar inline currentPage={reqPage} totalItems={filteredRequests.length} pageSize={REQ_PAGE_SIZE} onPageChange={setReqPage} />
                  </div>
                </div>
                <div className="space-y-3">
                  {filteredRequests
                    .slice((reqPage - 1) * REQ_PAGE_SIZE, reqPage * REQ_PAGE_SIZE)
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
                                {format(parseDateLima(request.start_date), "dd/MM/yyyy")}
                                </p>
                                </div>
                                <div>
                                <p className="text-slate-600">Hasta</p>
                                <p className="font-semibold text-slate-900">
                                {format(parseDateLima(request.end_date), "dd/MM/yyyy")}
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
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input placeholder="Buscar empleado..." value={histSearchTerm} onChange={(e) => { setHistSearchTerm(e.target.value); setHistPage(1); }} className="pl-9" />
                  </div>
                  <Select value={histDeptFilter} onValueChange={(v) => { setHistDeptFilter(v); setHistPage(1); }}>
                    <SelectTrigger className="w-44"><SelectValue placeholder="Departamento" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los deptos.</SelectItem>
                      {allDepts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={histStatusFilter} onValueChange={(v) => { setHistStatusFilter(v); setHistPage(1); }}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      {histStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={histTypeFilter} onValueChange={(v) => { setHistTypeFilter(v); setHistPage(1); }}>
                    <SelectTrigger className="w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los tipos</SelectItem>
                      {allReqTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="ml-auto">
                    <PaginationBar inline currentPage={histPage} totalItems={filteredHistory.length} pageSize={HIST_PAGE_SIZE} onPageChange={setHistPage} />
                  </div>
                </div>
                <div className="space-y-3">
                  {filteredHistory
                    .slice((histPage - 1) * HIST_PAGE_SIZE, histPage * HIST_PAGE_SIZE)
                    .map(request => {
                      const emp = allEmployees.find(e => e.id === request.employee_id);
                      if (!emp) return null;

                      const statusStyle = {
                        "Aprobada": { border: "border-green-200", bg: "bg-green-50", badge: "bg-green-100 text-green-700" },
                        "Rechazada": { border: "border-red-200", bg: "bg-red-50", badge: "bg-red-100 text-red-700" },
                        "Cancelada": { border: "border-slate-200", bg: "bg-slate-50", badge: "bg-slate-100 text-slate-600" },
                        "Pendiente": { border: "border-amber-200", bg: "bg-amber-50", badge: "bg-amber-100 text-amber-700" },
                      }[request.status] || { border: "border-slate-200", bg: "bg-white", badge: "bg-slate-100 text-slate-600" };

                      return (
                        <div key={request.id} className={`p-4 border ${statusStyle.border} ${statusStyle.bg} rounded-lg`}>
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-bold text-slate-900">
                                {emp.first_name} {emp.last_name}
                              </h4>
                              <p className="text-sm text-slate-600">{emp.department_name}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={statusStyle.badge}>{request.status}</Badge>
                              <Badge variant="outline">{request.total_days} días</Badge>
                            </div>
                          </div>

                          <div className="text-sm text-slate-700 space-y-0.5">
                            {request.request_type && <p><strong>Tipo:</strong> {request.request_type}</p>}
                            <p>
                              <strong>Período:</strong> {format(parseDateLima(request.start_date), "dd/MM/yyyy")} - {format(parseDateLima(request.end_date), "dd/MM/yyyy")}
                            </p>
                            {request.approved_by && (
                              <p className="text-xs text-slate-500 mt-1">
                                {request.status === "Aprobada" ? "Aprobado" : "Revisado"} por: {request.approved_by}
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
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto"
          onClick={() => setSelectedEmployee(null)}
        >
          <Card 
            className="max-w-2xl w-full my-4 sm:my-0"
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
                               {format(parseDateLima(req.start_date), "dd/MM/yyyy")} - {format(parseDateLima(req.end_date), "dd/MM/yyyy")}
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
