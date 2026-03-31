import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  User, FileText, Calendar, Download,
  TrendingUp, Clock, DollarSign, Award,
  ChevronRight, Briefcase, Mail, Phone
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";

export default function Dashboard() {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;
  const [loading, setLoading] = useState(true);

  // useEffect(() => {
    // if (!isLoadingAuth && user) {
      // if (user.employee) {
        // setEmployee(user.employee);
      // }
      // setLoading(false);
    // }
  // }, [user, isLoadingAuth]);
  useEffect(() => {
    if (currentUser?.employee?.role === "admin" || currentUser?.employee?.role === "super_admin") {
      updateEmployeeStatuses().then(result => {
        if (result.success && result.updatedCount > 0) {
          console.log(`${result.updatedCount} empleado(s) actualizado(s) a estado Cesado automáticamente`);
        }
      });
    }
    if (currentUser !== undefined) {
      setLoading(false);
    }
  }, [currentUser]);

  const { data: latestPayslip } = useQuery({
    queryKey: ["latestPayslip", employee?.id],
    queryFn: async () => {
      if (!employee?.id) return null;
      const payslips = await entitiesAPI.Payslip.filter(
        { employee_id: employee.id },
        "-year,-month",
        1
      );
      return payslips[0] ?? null;;
    },
    enabled: !!employee?.id,
  });

  const { data: vacationBalance } = useQuery({
    queryKey: ["vacationBalance", employee?.id],
    queryFn: async () => {
      if (!employee?.id) return null;
      const balances = await entitiesAPI.VacationBalance.filter(
        { employee_id: employee.id, is_active: true },
        "-period_start",
        1
      );
      return balances[0];
    },
    enabled: !!employee?.id,
  });

  const { data: pendingRequests } = useQuery({
    queryKey: ["pendingRequests", employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      const result = await entitiesAPI.VacationRequest.filter(
        { employee_id: employee.id, status: "Pendiente" }
      );
      return result ?? [];
    },
    enabled: !!employee?.id,
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center text-red-600">Acceso no autorizado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-slate-600">
              No se encontró un perfil de empleado asociado a tu cuenta.
              Por favor contacta a Recursos Humanos.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const yearsOfService = employee.hire_date
    ? Math.floor((new Date() - new Date(employee.hire_date)) / (365.25 * 24 * 60 * 60 * 1000))
    : 0;

  const quickActions = [
    {
      title: "Mis Boletas",
      description: "Descarga tus boletas de pago",
      icon: FileText,
      color: "bg-blue-500",
      link: createPageUrl("Payslips"),
    },
    {
      title: "Solicitar Vacaciones",
      description: "Programa tus días de descanso",
      icon: Calendar,
      color: "bg-green-500",
      link: createPageUrl("VacationRequest"),
    },
    {
      title: "Mis Datos",
      description: "Actualiza tu información",
      icon: User,
      color: "bg-purple-500",
      link: createPageUrl("MyProfile"),
    },
    {
      title: "Certificados",
      description: "Solicita certificados",
      icon: Award,
      color: "bg-orange-500",
      link: createPageUrl("Certificates"),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between">
            <div className="flex gap-6">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-xl">
                {employee.photo_url ? (
                  <img
                    src={`${import.meta.env.VITE_API_URL}${employee.photo_url}`}
                    alt={employee.first_name}
                    className="w-full h-full rounded-2xl object-cover"
                  />
                ) : (
                  <User className="w-12 h-12" />
                )}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">
                  Bienvenido, {employee.first_name}
                </h1>
                <div className="flex flex-wrap items-center gap-4 text-slate-600">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4" />
                    <span className="font-medium">{employee.position}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    <span>{employee.work_email}</span>
                  </div>
                  {employee.mobile && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      <span>{employee.mobile}</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">
                    {employee.employee_code}
                  </Badge>
                  <Badge className="bg-green-100 text-green-700 border-green-200">
                    {employee.status}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg shrink-0">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xl font-bold text-slate-900 truncate">
                      S/ {latestPayslip?.net_pay?.toFixed(2) || "0.00"}
                    </span>
                    <Badge className="bg-blue-100 text-blue-700 text-xs px-1 py-0 border-0 shrink-0">Último</Badge>
                  </div>
                  <p className="text-slate-500 text-xs font-medium leading-none">Neto Pagado</p>
                  <p className="text-xs text-slate-400">{latestPayslip?.period || "Sin datos"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg shrink-0">
                  <Calendar className="w-4 h-4 text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xl font-bold text-slate-900">{vacationBalance?.days_pending || 0}</span>
                    <span className="text-sm text-slate-500">días</span>
                  </div>
                  <p className="text-slate-500 text-xs font-medium leading-none">Vacaciones</p>
                  <p className="text-xs text-slate-400">Disponibles</p>
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
                  <div className="flex items-center gap-1">
                    <span className="text-xl font-bold text-slate-900">{yearsOfService}</span>
                    <span className="text-sm text-slate-500">{yearsOfService === 1 ? 'año' : 'años'}</span>
                  </div>
                  <p className="text-slate-500 text-xs font-medium leading-none">Antigüedad</p>
                  <p className="text-xs text-slate-400">
                    Desde {employee.hire_date && format(new Date(employee.hire_date), "MMM yyyy", { locale: es })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg shrink-0">
                  <TrendingUp className="w-4 h-4 text-orange-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xl font-bold text-slate-900">{pendingRequests?.length || 0}</span>
                  <p className="text-slate-500 text-xs font-medium leading-none">Solicitudes</p>
                  <p className="text-xs text-slate-400">Pendientes de aprobación</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Acciones Rápidas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {quickActions.map((action, index) => (
              <Link key={index} to={action.link}>
                <Card className="group cursor-pointer border-0 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 bg-white">
                  <CardContent className="p-6">
                    <div className={`w-14 h-14 ${action.color} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                      <action.icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">
                      {action.title}
                    </h3>
                    <p className="text-slate-600 text-sm mb-4">
                      {action.description}
                    </p>
                    <div className="flex items-center text-indigo-600 font-medium text-sm group-hover:gap-2 transition-all">
                      Acceder
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Latest Payslip */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold">Última Boleta</CardTitle>
                <Link to={createPageUrl("Payslips")}>
                  <Button variant="ghost" size="sm" className="text-indigo-600">
                    Ver todas
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {latestPayslip ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Periodo</span>
                    <span className="font-semibold text-slate-900">{latestPayslip.period}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Total Ingresos</span>
                    <span className="font-semibold text-green-600">
                      S/ {latestPayslip.total_income?.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Total Descuentos</span>
                    <span className="font-semibold text-red-600">
                      S/ {latestPayslip.total_deductions?.toFixed(2)}
                    </span>
                  </div>
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">Neto a Pagar</span>
                      <span className="text-2xl font-bold text-indigo-600">
                        S/ {latestPayslip.net_pay?.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  {latestPayslip.pdf_url && (
                    <Button className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700">
                      <Download className="w-4 h-4 mr-2" />
                      Descargar Boleta
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-8">
                  No hay boletas disponibles
                </p>
              )}
            </CardContent>
          </Card>

          {/* Vacation Info */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold">Estado de Vacaciones</CardTitle>
                <Link to={createPageUrl("VacationRequest")}>
                  <Button variant="ghost" size="sm" className="text-indigo-600">
                    Solicitar
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {vacationBalance ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Días de derecho</span>
                    <span className="font-semibold text-slate-900">
                      {vacationBalance.total_entitled_days} días
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Días tomados</span>
                    <span className="font-semibold text-orange-600">
                      {vacationBalance.days_taken} días
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Días disponibles</span>
                    <span className="font-semibold text-green-600">
                      {vacationBalance.days_pending} días
                    </span>
                  </div>
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-600">Progreso</span>
                      <span className="text-sm font-semibold text-slate-900">
                        {((vacationBalance.days_taken / vacationBalance.total_entitled_days) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all duration-500"
                        style={{
                          width: `${(vacationBalance.days_taken / vacationBalance.total_entitled_days) * 100}%`
                        }}
                      />
                    </div>
                  </div>
                  {vacationBalance.deadline && (
                    <p className="text-sm text-slate-500 pt-2">
                      Fecha límite: {format(new Date(vacationBalance.deadline), "dd 'de' MMMM, yyyy", { locale: es })}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-8">
                  No hay información de vacaciones disponible
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
