import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, TrendingUp, TrendingDown, Clock, Calendar, 
  AlertCircle, CheckCircle, FileText, Briefcase, 
  DollarSign, UserCheck, UserX, ChevronRight, ArrowRight,
  CalendarDays, Shield, Database, Settings
} from "lucide-react";
import { format, differenceInDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { createPageUrl } from "../utils";
import { Link } from "react-router-dom";
import PermissionGuard from "../components/PermissionGuard";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";

export default function HRDashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);

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
          
          // Ejecutar actualización automática de estados de empleados (solo para admin)
          if (employees[0].role === "admin" || employees[0].role === "super_admin") {
            updateEmployeeStatuses().then(result => {
              if (result.success && result.updatedCount > 0) {
                console.log(`✅ ${result.updatedCount} empleado(s) actualizado(s) a estado Cesado automáticamente`);
              }
            });
          }
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
      return await base44.entities.Employee.list("-created_date");
    },
  });

  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ["allAttendanceRecords"],
    queryFn: async () => {
      return await base44.entities.AttendanceRecord.list("-date", 1000);
    },
  });

  const { data: pendingIncidents = [] } = useQuery({
    queryKey: ["pendingIncidents"],
    queryFn: async () => {
      return await base44.entities.AttendanceIncident.filter(
        { status: "Pendiente" },
        "-created_date"
      );
    },
  });

  const { data: vacationRequests = [] } = useQuery({
    queryKey: ["allVacationRequests"],
    queryFn: async () => {
      return await base44.entities.VacationRequest.list("-created_date", 200);
    },
  });

  const { data: payslips = [] } = useQuery({
    queryKey: ["allPayslips"],
    queryFn: async () => {
      return await base44.entities.Payslip.list("-created_date", 500);
    },
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["allContracts"],
    queryFn: async () => {
      return await base44.entities.Contract.list("-created_date");
    },
  });

  // Calcular métricas
  const calculateMetrics = () => {
    const activeEmployees = allEmployees.filter(e => e.status === "Activo");
    const totalEmployees = allEmployees.length;
    
    // Rotación de personal (últimos 3 meses)
    const threeMonthsAgo = subMonths(new Date(), 3);
    const recentTerminations = allEmployees.filter(e => 
      e.status === "Cesado" && e.updated_date && new Date(e.updated_date) >= threeMonthsAgo
    ).length;
    const turnoverRate = activeEmployees.length > 0 
      ? ((recentTerminations / activeEmployees.length) * 100).toFixed(1)
      : 0;

    // Tiempo promedio de contratación (días desde created_date hasta hire_date)
    const recentHires = allEmployees
      .filter(e => e.hire_date && e.created_date)
      .slice(0, 20);
    const avgHiringTime = recentHires.length > 0
      ? Math.round(recentHires.reduce((sum, e) => {
          const days = differenceInDays(new Date(e.hire_date), new Date(e.created_date));
          return sum + Math.abs(days);
        }, 0) / recentHires.length)
      : 0;

    // Asistencia del mes actual
    const startDate = startOfMonth(new Date());
    const endDate = endOfMonth(new Date());
    const currentMonthRecords = attendanceRecords.filter(r => {
      const recordDate = new Date(r.date);
      return recordDate >= startDate && recordDate <= endDate;
    });
    const attendanceRate = currentMonthRecords.length > 0
      ? ((currentMonthRecords.filter(r => !r.is_absent).length / currentMonthRecords.length) * 100).toFixed(1)
      : 0;

    // Tardanzas del mes
    const lateRecords = currentMonthRecords.filter(r => r.is_late && r.late_minutes > 0).length;

    // Solicitudes de vacaciones pendientes
    const pendingVacations = vacationRequests.filter(v => v.status === "Pendiente").length;

    // Planillas del mes actual
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const currentMonthPayslips = payslips.filter(p => p.month === currentMonth && p.year === currentYear);
    const totalPayroll = currentMonthPayslips.reduce((sum, p) => sum + (p.net_pay || 0), 0);

    // Contratos próximos a vencer (30 días)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringContracts = contracts.filter(c => {
      if (!c.end_date || c.status !== "Vigente") return false;
      const endDate = new Date(c.end_date);
      return endDate <= thirtyDaysFromNow && endDate >= new Date();
    }).length;

    return {
      totalEmployees,
      activeEmployees: activeEmployees.length,
      suspendedEmployees: allEmployees.filter(e => e.status === "Suspendido").length,
      terminatedEmployees: allEmployees.filter(e => e.status === "Cesado").length,
      turnoverRate,
      avgHiringTime,
      attendanceRate,
      lateRecords,
      pendingVacations,
      pendingIncidents: pendingIncidents.length,
      currentMonthPayslips: currentMonthPayslips.length,
      totalPayroll,
      expiringContracts,
    };
  };

  const metrics = calculateMetrics();

  // Departamentos
  const departments = [...new Set(allEmployees.map(e => e.department_name))].filter(Boolean);

  // Módulos de acceso rápido
  const quickAccessModules = [
    {
      title: "Gestión Empleados",
      description: "Administrar empleados",
      icon: Users,
      color: "from-blue-500 to-blue-600",
      path: "EmployeeManagement",
      badge: metrics.activeEmployees,
    },
    {
      title: "Gestión Asistencia",
      description: "Control de asistencia",
      icon: Clock,
      color: "from-green-500 to-green-600",
      path: "AttendanceManagement",
      badge: metrics.pendingIncidents,
      badgeColor: metrics.pendingIncidents > 0 ? "bg-red-500" : "bg-green-500",
    },
    {
      title: "Gestión Planillas",
      description: "Nómina y pagos",
      icon: DollarSign,
      color: "from-purple-500 to-purple-600",
      path: "PayrollManagement",
      badge: metrics.currentMonthPayslips,
    },
    {
      title: "Gestión Vacaciones",
      description: "Vacaciones y permisos",
      icon: CalendarDays,
      color: "from-orange-500 to-orange-600",
      path: "VacationManagement",
      badge: metrics.pendingVacations,
      badgeColor: metrics.pendingVacations > 0 ? "bg-orange-500" : "bg-green-500",
    },
    {
      title: "Gestión Contratos",
      description: "Contratos laborales",
      icon: FileText,
      color: "from-indigo-500 to-indigo-600",
      path: "ContractManagement",
      badge: metrics.expiringContracts,
      badgeColor: metrics.expiringContracts > 0 ? "bg-yellow-500" : "bg-green-500",
    },
    {
      title: "Reportes Asistencia",
      description: "Análisis y reportes",
      icon: TrendingUp,
      color: "from-pink-500 to-pink-600",
      path: "AttendanceReports",
    },
    {
      title: "Roles y Permisos",
      description: "Gestión de accesos",
      icon: Shield,
      color: "from-red-500 to-red-600",
      path: "RoleManagement",
    },
    {
      title: "Datos Maestros",
      description: "Configuración general",
      icon: Settings,
      color: "from-slate-500 to-slate-600",
      path: "MasterDataManagement",
    },
  ];

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card><CardContent className="p-8"><p>Cargando...</p></CardContent></Card>
      </div>
    );
  }

  return (
    <PermissionGuard employee={employee} requiredAnyPermissions={["employees.view", "attendance.view", "payroll.view"]}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              Dashboard de Recursos Humanos
            </h1>
            <p className="text-slate-600 text-lg">
              Vista ejecutiva de métricas clave y acceso rápido a módulos
            </p>
          </div>

          {/* Métricas principales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg shrink-0">
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xl font-bold text-slate-900">{metrics.activeEmployees}</span>
                      <TrendingUp className="w-3 h-3 text-green-500" />
                    </div>
                    <p className="text-slate-500 text-xs font-medium leading-none mb-1">Empleados Activos</p>
                    <div className="flex gap-1 flex-wrap">
                      <Badge className="bg-yellow-100 text-yellow-700 text-xs px-1 py-0">{metrics.suspendedEmployees} Susp.</Badge>
                      <Badge className="bg-red-100 text-red-700 text-xs px-1 py-0">{metrics.terminatedEmployees} Ces.</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg shrink-0">
                    <TrendingDown className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xl font-bold text-slate-900">{metrics.turnoverRate}%</span>
                      {parseFloat(metrics.turnoverRate) > 5
                        ? <AlertCircle className="w-3 h-3 text-red-500" />
                        : <CheckCircle className="w-3 h-3 text-green-500" />}
                    </div>
                    <p className="text-slate-500 text-xs font-medium leading-none">Rotación de Personal</p>
                    <p className="text-xs text-slate-400">Últimos 3 meses</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg shrink-0">
                    <Clock className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xl font-bold text-slate-900">{metrics.avgHiringTime}</span>
                    <p className="text-slate-500 text-xs font-medium leading-none">Días Promedio</p>
                    <p className="text-xs text-slate-400">Tiempo de contratación</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg shrink-0">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xl font-bold text-slate-900">{metrics.attendanceRate}%</span>
                    <p className="text-slate-500 text-xs font-medium leading-none">Asistencia del Mes</p>
                    <p className="text-xs text-slate-400">{metrics.lateRecords} tardanzas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Alertas y pendientes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Incidencias pendientes */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-orange-600" />
                    Incidencias de Asistencia
                  </CardTitle>
                  <Badge className="bg-orange-100 text-orange-700">
                    {metrics.pendingIncidents} Pendientes
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {pendingIncidents.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
                    <p className="text-slate-600">No hay incidencias pendientes</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingIncidents.slice(0, 5).map(incident => {
                      const emp = allEmployees.find(e => e.id === incident.employee_id);
                      return (
                        <div key={incident.id} className="p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="font-semibold text-slate-900 text-sm">
                                {emp ? `${emp.first_name} ${emp.last_name}` : "Empleado"}
                              </h4>
                              <p className="text-xs text-slate-600">
                                {incident.incident_type} • {format(new Date(incident.incident_date), "dd MMM", { locale: es })}
                              </p>
                            </div>
                            <Badge className="bg-yellow-100 text-yellow-700 text-xs">
                              Pendiente
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-2">
                            {incident.justification}
                          </p>
                        </div>
                      );
                    })}
                    {pendingIncidents.length > 5 && (
                      <Link to={createPageUrl("AttendanceManagement")}>
                        <Button variant="outline" size="sm" className="w-full">
                          Ver todas ({pendingIncidents.length})
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Solicitudes de vacaciones */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    Solicitudes de Vacaciones
                  </CardTitle>
                  <Badge className="bg-blue-100 text-blue-700">
                    {metrics.pendingVacations} Pendientes
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {vacationRequests.filter(v => v.status === "Pendiente").length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
                    <p className="text-slate-600">No hay solicitudes pendientes</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {vacationRequests.filter(v => v.status === "Pendiente").slice(0, 5).map(request => {
                      const emp = allEmployees.find(e => e.id === request.employee_id);
                      return (
                        <div key={request.id} className="p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="font-semibold text-slate-900 text-sm">
                                {emp ? `${emp.first_name} ${emp.last_name}` : "Empleado"}
                              </h4>
                              <p className="text-xs text-slate-600">
                                {request.total_days} días • {format(new Date(request.start_date), "dd MMM", { locale: es })} - {format(new Date(request.end_date), "dd MMM", { locale: es })}
                              </p>
                            </div>
                            <Badge className="bg-blue-100 text-blue-700 text-xs">
                              {request.request_type}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                    {vacationRequests.filter(v => v.status === "Pendiente").length > 5 && (
                      <Link to={createPageUrl("ManagerApprovals")}>
                        <Button variant="outline" size="sm" className="w-full">
                          Ver todas ({metrics.pendingVacations})
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Estadísticas adicionales */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <DollarSign className="w-4 h-4 text-indigo-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  S/ {metrics.totalPayroll.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                </div>
                <p className="text-slate-500 text-xs font-medium">Planilla del Mes</p>
                <p className="text-xs text-slate-400 mt-0.5">{metrics.currentMonthPayslips} empleados</p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <FileText className="w-4 h-4 text-yellow-600" />
                  </div>
                  {metrics.expiringContracts > 0 && (
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                  )}
                </div>
                <div className="text-2xl font-bold text-slate-900">{metrics.expiringContracts}</div>
                <p className="text-slate-500 text-xs font-medium">Contratos por Vencer</p>
                <p className="text-xs text-slate-400 mt-0.5">Próximos 30 días</p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-pink-100 rounded-lg">
                    <Briefcase className="w-4 h-4 text-pink-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">{departments.length}</div>
                <p className="text-slate-500 text-xs font-medium">Departamentos Activos</p>
                <p className="text-xs text-slate-400 mt-0.5">{metrics.totalEmployees} empleados totales</p>
              </CardContent>
            </Card>
          </div>

          {/* Acceso rápido a módulos */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-xl font-bold">
                Acceso Rápido a Módulos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {quickAccessModules.map((module, index) => {
                  const Icon = module.icon;
                  return (
                    <Link key={index} to={createPageUrl(module.path)}>
                      <Card className="border-2 border-slate-200 hover:border-indigo-400 hover:shadow-lg transition-all cursor-pointer h-full">
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div className={`p-3 bg-gradient-to-br ${module.color} rounded-xl`}>
                              <Icon className="w-6 h-6 text-white" />
                            </div>
                            {module.badge !== undefined && (
                              <Badge className={module.badgeColor || "bg-indigo-100 text-indigo-700"}>
                                {module.badge}
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-bold text-slate-900 mb-1">
                            {module.title}
                          </h3>
                          <p className="text-sm text-slate-600">
                            {module.description}
                          </p>
                          <div className="mt-3 flex items-center text-indigo-600 text-sm font-semibold">
                            Abrir
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PermissionGuard>
  );
}