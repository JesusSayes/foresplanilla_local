import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Clock, Calendar as CalendarIcon, Download, Users, 
  TrendingUp, AlertCircle, CheckCircle, XCircle, FileText, BarChart3
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import PermissionGuard from "../components/PermissionGuard";

export default function AttendanceReports() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState(endOfMonth(new Date()));
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [reportType, setReportType] = useState("general");

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
    queryKey: ["allAttendanceRecords", startDate, endDate],
    queryFn: async () => {
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
    const recordsWithClockIn = empRecords.filter(r => r.clock_in);
    
    const totalDays = recordsWithClockIn.length;
    const presentDays = recordsWithClockIn.filter(r => !r.is_absent && r.clock_in).length;
    const lateDays = recordsWithClockIn.filter(r => r.is_late && r.late_minutes > 0).length;
    const absentDays = empRecords.filter(r => r.is_absent && !isHoliday(new Date(r.date))).length;
    const totalHours = recordsWithClockIn.reduce((sum, r) => sum + (r.worked_hours || 0), 0);
    const totalLateMinutes = recordsWithClockIn.reduce((sum, r) => sum + (r.late_minutes || 0), 0);
    const holidaysInPeriod = empRecords.filter(r => isHoliday(new Date(r.date))).length;
    
    // Calcular horas extras (más de 8 horas por día)
    const overtimeHours = recordsWithClockIn.reduce((sum, r) => {
      const hours = r.worked_hours || 0;
      return sum + Math.max(0, hours - 8);
    }, 0);

    // Calcular días laborables esperados
    const allDaysInRange = eachDayOfInterval({ start: startDate, end: endDate });
    const workDays = allDaysInRange.filter(day => !isWeekend(day) && !isHoliday(day)).length;
    const expectedDays = workDays;

    return { 
      totalDays, 
      presentDays, 
      lateDays, 
      absentDays, 
      totalHours, 
      totalLateMinutes, 
      holidaysInPeriod,
      overtimeHours,
      expectedDays,
      attendanceRate: expectedDays > 0 ? ((presentDays / expectedDays) * 100).toFixed(1) : 0
    };
  };

  const departmentStats = departments.map(dept => {
    const deptEmployees = allEmployees.filter(e => e.department_name === dept);
    const deptRecords = filteredRecords.filter(r => 
      deptEmployees.some(e => e.id === r.employee_id)
    );
    
    // Solo contar registros con marcación
    const recordsWithClockIn = deptRecords.filter(r => r.clock_in);
    
    const lateDays = recordsWithClockIn.filter(r => r.is_late && r.late_minutes > 0).length;
    const absentDays = deptRecords.filter(r => r.is_absent).length;
    const avgAttendance = recordsWithClockIn.length > 0 
      ? ((recordsWithClockIn.filter(r => !r.is_absent && r.clock_in).length / recordsWithClockIn.length) * 100).toFixed(1)
      : 0;

    return { dept, employees: deptEmployees.length, lateDays, absentDays, avgAttendance };
  });

  const pendingIncidents = incidents.filter(i => i.status === "Pendiente");

  const exportToExcel = () => {
    const dataToExport = filteredEmployees.map(emp => {
      const stats = calculateEmployeeStats(emp.id);
      return {
        'Código': emp.employee_code,
        'Empleado': `${emp.first_name} ${emp.last_name}`,
        'Departamento': emp.department_name,
        'Cargo': emp.position,
        'Días Trabajados': stats.presentDays,
        'Días Esperados': stats.expectedDays,
        '% Asistencia': stats.attendanceRate,
        'Tardanzas': stats.lateDays,
        'Min. Tardanza Total': stats.totalLateMinutes,
        'Ausencias': stats.absentDays,
        'Horas Trabajadas': stats.totalHours.toFixed(2),
        'Horas Extras': stats.overtimeHours.toFixed(2),
        'Feriados': stats.holidaysInPeriod
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte Asistencia');
    
    const fileName = `Reporte_Asistencia_${format(startDate, "yyyy-MM-dd")}_a_${format(endDate, "yyyy-MM-dd")}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    toast.success('✓ Reporte Excel generado correctamente');
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Reporte de Asistencia', 14, 20);
    
    doc.setFontSize(11);
    doc.text(`Período: ${format(startDate, "dd/MM/yyyy")} - ${format(endDate, "dd/MM/yyyy")}`, 14, 30);
    doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 36);
    
    if (selectedDepartment !== "all") {
      doc.text(`Departamento: ${selectedDepartment}`, 14, 42);
    }

    const tableData = filteredEmployees.map(emp => {
      const stats = calculateEmployeeStats(emp.id);
      return [
        emp.employee_code,
        `${emp.first_name} ${emp.last_name}`,
        emp.department_name,
        stats.presentDays,
        `${stats.attendanceRate}%`,
        stats.lateDays,
        stats.absentDays,
        stats.totalHours.toFixed(1),
        stats.overtimeHours.toFixed(1)
      ];
    });

    doc.autoTable({
      startY: selectedDepartment !== "all" ? 48 : 42,
      head: [['Código', 'Empleado', 'Depto', 'Días', '%', 'Tard.', 'Aus.', 'Hs', 'Hs.Ext']],
      body: tableData,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] }
    });

    doc.save(`Reporte_Asistencia_${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}.pdf`);
    toast.success('✓ Reporte PDF generado correctamente');
  };

  // Datos para gráficos
  const dailyAttendanceData = eachDayOfInterval({ start: startDate, end: endDate })
    .filter(day => !isWeekend(day))
    .map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayRecords = filteredRecords.filter(r => r.date === dayStr);
      return {
        date: format(day, "dd/MM", { locale: es }),
        presentes: dayRecords.filter(r => r.clock_in && !r.is_absent).length,
        ausentes: dayRecords.filter(r => r.is_absent).length,
        tardanzas: dayRecords.filter(r => r.is_late).length
      };
    });

  const departmentChartData = departmentStats.map(stat => ({
    name: stat.dept,
    asistencia: parseFloat(stat.avgAttendance),
    tardanzas: stat.lateDays,
    ausencias: stat.absentDays
  }));

  const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

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
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">Desde:</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(startDate, "dd MMM yyyy", { locale: es })}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={(date) => date && setStartDate(date)}
                          locale={es}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">Hasta:</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(endDate, "dd MMM yyyy", { locale: es })}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={(date) => date && setEndDate(date)}
                          locale={es}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <Badge className="bg-blue-100 text-blue-700">
                    {differenceInDays(endDate, startDate) + 1} días
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-4">
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

                  <div className="ml-auto flex gap-2">
                    <Button 
                      onClick={exportToExcel}
                      variant="outline"
                      className="bg-green-600 text-white hover:bg-green-700"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Excel
                    </Button>
                    <Button 
                      onClick={exportToPDF}
                      variant="outline"
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      PDF
                    </Button>
                  </div>
                </div>
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

          {/* Tabs for different views */}
          <Tabs defaultValue="summary" className="space-y-6">
            <TabsList className="grid w-full max-w-3xl grid-cols-3">
              <TabsTrigger value="summary">Resumen</TabsTrigger>
              <TabsTrigger value="charts">Gráficos</TabsTrigger>
              <TabsTrigger value="details">Detalles</TabsTrigger>
            </TabsList>

            {/* Summary Tab */}
            <TabsContent value="summary" className="space-y-6">
              {employee?.role === "admin" && (
                <Card className="border-0 shadow-lg">
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

              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-slate-50/50">
                  <CardTitle className="text-xl font-bold">
                    Top Tardanzas y Ausencias
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-4">Más Tardanzas</h3>
                      <div className="space-y-2">
                        {filteredEmployees
                          .map(emp => ({ emp, stats: calculateEmployeeStats(emp.id) }))
                          .sort((a, b) => b.stats.lateDays - a.stats.lateDays)
                          .slice(0, 5)
                          .map(({ emp, stats }) => (
                            <div key={emp.id} className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
                              <span className="font-medium">{emp.first_name} {emp.last_name}</span>
                              <Badge className="bg-yellow-100 text-yellow-700">
                                {stats.lateDays} días ({stats.totalLateMinutes} min)
                              </Badge>
                            </div>
                          ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-4">Más Ausencias</h3>
                      <div className="space-y-2">
                        {filteredEmployees
                          .map(emp => ({ emp, stats: calculateEmployeeStats(emp.id) }))
                          .sort((a, b) => b.stats.absentDays - a.stats.absentDays)
                          .slice(0, 5)
                          .map(({ emp, stats }) => (
                            <div key={emp.id} className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                              <span className="font-medium">{emp.first_name} {emp.last_name}</span>
                              <Badge className="bg-red-100 text-red-700">
                                {stats.absentDays} días
                              </Badge>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-slate-50/50">
                  <CardTitle className="text-xl font-bold">
                    Horas Extras por Empleado
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-2">
                    {filteredEmployees
                      .map(emp => ({ emp, stats: calculateEmployeeStats(emp.id) }))
                      .filter(({ stats }) => stats.overtimeHours > 0)
                      .sort((a, b) => b.stats.overtimeHours - a.stats.overtimeHours)
                      .map(({ emp, stats }) => (
                        <div key={emp.id} className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                          <div>
                            <span className="font-medium">{emp.first_name} {emp.last_name}</span>
                            <p className="text-xs text-slate-600">{emp.department_name}</p>
                          </div>
                          <Badge className="bg-blue-100 text-blue-700">
                            {stats.overtimeHours.toFixed(2)} horas extra
                          </Badge>
                        </div>
                      ))}
                    {filteredEmployees.every(emp => calculateEmployeeStats(emp.id).overtimeHours === 0) && (
                      <p className="text-center text-slate-500 py-8">No hay horas extras registradas en este período</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Charts Tab */}
            <TabsContent value="charts" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-slate-50/50">
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Tendencia de Asistencia Diaria
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={dailyAttendanceData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="presentes" stroke="#10b981" strokeWidth={2} name="Presentes" />
                      <Line type="monotone" dataKey="tardanzas" stroke="#f59e0b" strokeWidth={2} name="Tardanzas" />
                      <Line type="monotone" dataKey="ausentes" stroke="#ef4444" strokeWidth={2} name="Ausentes" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {employee?.role === "admin" && (
                <Card className="border-0 shadow-lg">
                  <CardHeader className="border-b bg-slate-50/50">
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      Comparativa por Departamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={departmentChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="asistencia" fill="#10b981" name="% Asistencia" />
                        <Bar dataKey="tardanzas" fill="#f59e0b" name="Tardanzas" />
                        <Bar dataKey="ausencias" fill="#ef4444" name="Ausencias" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Details Tab */}
            <TabsContent value="details" className="space-y-6">
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
                              stats.attendanceRate >= 95 ? "bg-green-100 text-green-700" :
                              stats.attendanceRate >= 85 ? "bg-yellow-100 text-yellow-700" :
                              "bg-red-100 text-red-700"
                            }>
                              {stats.attendanceRate}% asistencia
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div className="p-3 bg-slate-50 rounded-lg">
                              <p className="text-slate-600 text-xs mb-1">Días trabajados</p>
                              <p className="font-bold text-slate-900">{stats.presentDays} / {stats.expectedDays}</p>
                            </div>
                            <div className="p-3 bg-yellow-50 rounded-lg">
                              <p className="text-slate-600 text-xs mb-1">Tardanzas</p>
                              <p className="font-bold text-yellow-700">{stats.lateDays} días</p>
                              <p className="text-xs text-yellow-600">{stats.totalLateMinutes} min</p>
                            </div>
                            <div className="p-3 bg-red-50 rounded-lg">
                              <p className="text-slate-600 text-xs mb-1">Ausencias</p>
                              <p className="font-bold text-red-700">{stats.absentDays} días</p>
                            </div>
                            <div className="p-3 bg-blue-50 rounded-lg">
                              <p className="text-slate-600 text-xs mb-1">Horas trabajadas</p>
                              <p className="font-bold text-blue-700">{stats.totalHours.toFixed(2)}h</p>
                            </div>
                            <div className="p-3 bg-purple-50 rounded-lg">
                              <p className="text-slate-600 text-xs mb-1">Horas extras</p>
                              <p className="font-bold text-purple-700">{stats.overtimeHours.toFixed(2)}h</p>
                            </div>
                            <div className="p-3 bg-green-50 rounded-lg">
                              <p className="text-slate-600 text-xs mb-1">Feriados</p>
                              <p className="font-bold text-green-700">{stats.holidaysInPeriod}</p>
                            </div>
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
      </div>
    </PermissionGuard>
  );
}