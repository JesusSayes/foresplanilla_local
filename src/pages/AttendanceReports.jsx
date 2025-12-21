import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Clock, Calendar as CalendarIcon, Download, Users, 
  TrendingUp, AlertCircle, CheckCircle, XCircle
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import PermissionGuard from "../components/PermissionGuard";

export default function AttendanceReports() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedEmployee, setSelectedEmployee] = useState("all");

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

  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ["allAttendanceRecords", selectedDate],
    queryFn: async () => {
      const startDate = startOfMonth(selectedDate);
      const endDate = endOfMonth(selectedDate);

      const records = await base44.entities.AttendanceRecord.list("-date");

      return records.filter(r => {
        const recordDate = new Date(r.date);
        return recordDate >= startDate && recordDate <= endDate;
      });
    },
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ["allIncidents"],
    queryFn: async () => {
      return await base44.entities.AttendanceIncident.list("-created_date");
    },
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      return await base44.entities.Holiday.list("-date");
    },
  });

  const isHoliday = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return holidays.some(h => h.date === dateStr && h.is_mandatory);
  };

  const departments = [...new Set(allEmployees.map(e => e.department_name))].filter(Boolean);

  const filteredEmployees = allEmployees.filter(emp => {
    if (employee?.role === "manager") {
      return emp.department_name === employee.department_name;
    }
    if (selectedDepartment !== "all") {
      return emp.department_name === selectedDepartment;
    }
    return true;
  });

  const filteredRecords = attendanceRecords.filter(record => {
    if (selectedEmployee !== "all") {
      return record.employee_id === selectedEmployee;
    }
    return filteredEmployees.some(e => e.id === record.employee_id);
  });

  const calculateEmployeeStats = (employeeId) => {
    const empRecords = filteredRecords.filter(r => r.employee_id === employeeId);
    const totalDays = empRecords.length;
    const presentDays = empRecords.filter(r => !r.is_absent).length;
    const lateDays = empRecords.filter(r => r.is_late).length;
    const absentDays = empRecords.filter(r => r.is_absent && !isHoliday(new Date(r.date))).length;
    const totalHours = empRecords.reduce((sum, r) => sum + (r.worked_hours || 0), 0);
    const totalLateMinutes = empRecords.reduce((sum, r) => sum + (r.late_minutes || 0), 0);
    const holidaysInPeriod = empRecords.filter(r => isHoliday(new Date(r.date))).length;

    return { totalDays, presentDays, lateDays, absentDays, totalHours, totalLateMinutes, holidaysInPeriod };
  };

  const departmentStats = departments.map(dept => {
    const deptEmployees = allEmployees.filter(e => e.department_name === dept);
    const deptRecords = filteredRecords.filter(r => 
      deptEmployees.some(e => e.id === r.employee_id)
    );
    
    const lateDays = deptRecords.filter(r => r.is_late).length;
    const absentDays = deptRecords.filter(r => r.is_absent).length;
    const avgAttendance = deptRecords.length > 0 
      ? ((deptRecords.filter(r => !r.is_absent).length / deptRecords.length) * 100).toFixed(1)
      : 0;

    return { dept, employees: deptEmployees.length, lateDays, absentDays, avgAttendance };
  });

  const pendingIncidents = incidents.filter(i => i.status === "Pendiente");

  const exportToCSV = () => {
    const headers = ["Empleado", "Fecha", "Entrada", "Salida", "Horas", "Estado", "Tardanza (min)"];
    const rows = filteredRecords.map(record => {
      const emp = allEmployees.find(e => e.id === record.employee_id);
      return [
        emp ? `${emp.first_name} ${emp.last_name}` : "N/A",
        format(new Date(record.date), "dd/MM/yyyy"),
        record.clock_in || "-",
        record.clock_out || "-",
        record.worked_hours?.toFixed(2) || "0",
        record.status,
        record.late_minutes || "0"
      ];
    });

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_asistencia_${format(selectedDate, "yyyy-MM")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success("Reporte exportado");
  };

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card><CardContent className="p-8"><p>Cargando...</p></CardContent></Card>
      </div>
    );
  }

  return (
    <PermissionGuard employee={employee} requiredRole="manager">
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              Reportes de Asistencia
            </h1>
            <p className="text-slate-600 text-lg">
              Análisis y seguimiento de la asistencia del equipo
            </p>
          </div>

          {/* Filters */}
          <Card className="border-0 shadow-lg mb-6">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-center gap-4">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(selectedDate, "MMMM yyyy", { locale: es })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      locale={es}
                    />
                  </PopoverContent>
                </Popover>

                {employee?.role === "admin" && (
                  <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Departamento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los departamentos</SelectItem>
                      {departments.map(dept => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Empleado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los empleados</SelectItem>
                    {filteredEmployees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button 
                  onClick={exportToCSV}
                  className="ml-auto bg-green-600 hover:bg-green-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 bg-blue-100 rounded-xl">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900 mb-1">
                  {filteredEmployees.length}
                </div>
                <p className="text-slate-600 text-sm">Empleados activos</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 bg-green-100 rounded-xl">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900 mb-1">
                  {filteredRecords.filter(r => !r.is_absent).length}
                </div>
                <p className="text-slate-600 text-sm">Asistencias</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 bg-yellow-100 rounded-xl">
                    <Clock className="w-6 h-6 text-yellow-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900 mb-1">
                  {filteredRecords.filter(r => r.is_late).length}
                </div>
                <p className="text-slate-600 text-sm">Tardanzas</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 bg-orange-100 rounded-xl">
                    <AlertCircle className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900 mb-1">
                  {pendingIncidents.length}
                </div>
                <p className="text-slate-600 text-sm">Justificaciones pendientes</p>
              </CardContent>
            </Card>
          </div>

          {/* Department Stats */}
          {employee?.role === "admin" && (
            <Card className="border-0 shadow-lg mb-8">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-xl font-bold">
                  Estadísticas por Departamento
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 font-semibold text-slate-700">Departamento</th>
                        <th className="text-center p-3 font-semibold text-slate-700">Empleados</th>
                        <th className="text-center p-3 font-semibold text-slate-700">% Asistencia</th>
                        <th className="text-center p-3 font-semibold text-slate-700">Tardanzas</th>
                        <th className="text-center p-3 font-semibold text-slate-700">Ausencias</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departmentStats.map((stat, index) => (
                        <tr key={index} className="border-b hover:bg-slate-50">
                          <td className="p-3 font-semibold">{stat.dept}</td>
                          <td className="p-3 text-center">{stat.employees}</td>
                          <td className="p-3 text-center">
                            <Badge className={
                              stat.avgAttendance >= 95 ? "bg-green-100 text-green-700" :
                              stat.avgAttendance >= 85 ? "bg-yellow-100 text-yellow-700" :
                              "bg-red-100 text-red-700"
                            }>
                              {stat.avgAttendance}%
                            </Badge>
                          </td>
                          <td className="p-3 text-center text-yellow-600 font-semibold">
                            {stat.lateDays}
                          </td>
                          <td className="p-3 text-center text-red-600 font-semibold">
                            {stat.absentDays}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Employee Details */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-xl font-bold">
                Detalle por Empleado
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {filteredEmployees.map(emp => {
                  const stats = calculateEmployeeStats(emp.id);
                  const attendanceRate = stats.totalDays > 0 
                    ? ((stats.presentDays / stats.totalDays) * 100).toFixed(1)
                    : 0;

                  return (
                    <div key={emp.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-bold text-slate-900 text-lg">
                            {emp.first_name} {emp.last_name}
                          </h4>
                          <p className="text-slate-600 text-sm">
                            {emp.position} • {emp.department_name}
                          </p>
                        </div>
                        <Badge className={
                          attendanceRate >= 95 ? "bg-green-100 text-green-700" :
                          attendanceRate >= 85 ? "bg-yellow-100 text-yellow-700" :
                          "bg-red-100 text-red-700"
                        }>
                          {attendanceRate}% asistencia
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
                        <div className="p-3 bg-slate-50 rounded-lg">
                          <p className="text-slate-600 text-xs mb-1">Días trabajados</p>
                          <p className="font-bold text-slate-900">{stats.presentDays}</p>
                        </div>
                        <div className="p-3 bg-yellow-50 rounded-lg">
                          <p className="text-slate-600 text-xs mb-1">Tardanzas</p>
                          <p className="font-bold text-yellow-700">{stats.lateDays}</p>
                        </div>
                        <div className="p-3 bg-red-50 rounded-lg">
                          <p className="text-slate-600 text-xs mb-1">Faltas</p>
                          <p className="font-bold text-red-700">{stats.absentDays}</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <p className="text-slate-600 text-xs mb-1">Total horas</p>
                          <p className="font-bold text-blue-700">{stats.totalHours.toFixed(2)}h</p>
                        </div>
                        <div className="p-3 bg-orange-50 rounded-lg">
                          <p className="text-slate-600 text-xs mb-1">Min. tardanza</p>
                          <p className="font-bold text-orange-700">{stats.totalLateMinutes}</p>
                        </div>
                        <div className="p-3 bg-purple-50 rounded-lg">
                          <p className="text-slate-600 text-xs mb-1">Feriados</p>
                          <p className="font-bold text-purple-700">{stats.holidaysInPeriod}</p>
                        </div>
                      </div>
                    </div>
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