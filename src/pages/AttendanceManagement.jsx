import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Clock, Calendar as CalendarIcon, Edit, CheckCircle, XCircle, 
  AlertCircle, Users, Search, FileText, Download, Database, History, Eye, Printer
} from "lucide-react";
import * as XLSX from 'xlsx';
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import PermissionGuard from "../components/PermissionGuard";
import IncidentHistory from "../components/attendance/IncidentHistory";

export default function AttendanceManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSite, setSelectedSite] = useState("all");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [attendanceFilter, setAttendanceFilter] = useState("all");
  const [editingRecord, setEditingRecord] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [reviewingIncident, setReviewingIncident] = useState(null);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [reviewComments, setReviewComments] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [historyEmployeeId, setHistoryEmployeeId] = useState(null);
  const [dateFilterMode, setDateFilterMode] = useState("single"); // "single" o "range"
  
  // Filtros aplicados
  const [appliedDate, setAppliedDate] = useState(new Date());
  const [appliedStartDate, setAppliedStartDate] = useState(null);
  const [appliedEndDate, setAppliedEndDate] = useState(null);
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [appliedSite, setAppliedSite] = useState("all");
  const [appliedDepartment, setAppliedDepartment] = useState("all");
  const [appliedAttendanceFilter, setAppliedAttendanceFilter] = useState("all");

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

  const { data: todayRecords = [] } = useQuery({
    queryKey: ["todayAttendance", appliedDate, appliedStartDate, appliedEndDate],
    queryFn: async () => {
      // Si hay rango de fechas aplicado, obtener todos los registros del rango
      if (appliedStartDate && appliedEndDate) {
        const allRecords = await base44.entities.AttendanceRecord.list("-date");
        return allRecords.filter(r => {
          const recordDate = new Date(r.date);
          return recordDate >= appliedStartDate && recordDate <= appliedEndDate;
        });
      }
      
      // Si no hay rango, usar fecha aplicada
      const dateStr = format(appliedDate, "yyyy-MM-dd");
      const records = await base44.entities.AttendanceRecord.filter(
        { date: dateStr },
        "-created_date"
      );
      return records;
    },
  });

  const applyFilters = () => {
    if (dateFilterMode === "range") {
      if (!startDate || !endDate) {
        toast.error("Selecciona ambas fechas para el rango");
        return;
      }
      setAppliedStartDate(startDate);
      setAppliedEndDate(endDate);
      setAppliedDate(null);
    } else {
      setAppliedDate(selectedDate);
      setAppliedStartDate(null);
      setAppliedEndDate(null);
    }
    
    setAppliedSearchTerm(searchTerm);
    setAppliedSite(selectedSite);
    setAppliedDepartment(selectedDepartment);
    setAppliedAttendanceFilter(attendanceFilter);
    
    toast.success("✓ Filtros aplicados");
  };

  const { data: holidays = [] } = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      return await base44.entities.Holiday.list("-date");
    },
  });

  const { data: dbConnections = [] } = useQuery({
    queryKey: ["databaseConnections"],
    queryFn: async () => {
      const conns = await base44.entities.DatabaseConnection.list("-created_date");
      return conns.filter(c => c.is_active);
    },
  });

  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const allSites = await base44.entities.Site.list("name");
      return allSites.filter(s => s.is_active);
    },
  });

  const isHoliday = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return holidays.some(h => h.date === dateStr && h.is_mandatory);
  };

  const todayIsHoliday = isHoliday(selectedDate);
  const holidayInfo = holidays.find(h => h.date === format(selectedDate, "yyyy-MM-dd"));

  const { data: pendingIncidents = [] } = useQuery({
    queryKey: ["pendingIncidents"],
    queryFn: async () => {
      return await base44.entities.AttendanceIncident.filter(
        { status: "Pendiente" },
        "-created_date"
      );
    },
  });

  const { data: employeeIncidents = [] } = useQuery({
    queryKey: ["employeeIncidents", historyEmployeeId],
    queryFn: async () => {
      if (!historyEmployeeId) return [];
      return await base44.entities.AttendanceIncident.filter(
        { employee_id: historyEmployeeId },
        "-created_date"
      );
    },
    enabled: !!historyEmployeeId,
  });

  const updateRecordMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.AttendanceRecord.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["todayAttendance"]);
      toast.success("Registro actualizado correctamente");
      setShowEditModal(false);
      setEditingRecord(null);
    },
    onError: (error) => {
      toast.error("Error al actualizar el registro");
      console.error(error);
    },
  });

  const reviewIncidentMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.AttendanceIncident.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["pendingIncidents"]);
      toast.success("Justificación revisada correctamente");
      setShowIncidentModal(false);
      setReviewingIncident(null);
      setReviewComments("");
    },
    onError: (error) => {
      toast.error("Error al revisar la justificación");
      console.error(error);
    },
  });

  const importAttendanceMutation = useMutation({
    mutationFn: async (connectionId) => {
      const connection = dbConnections.find(c => c.id === connectionId);
      if (!connection) throw new Error("Conexión no encontrada");

      // Aquí iría la lógica real de importación desde la BD externa
      // Por ahora simulamos la importación
      toast.info("Iniciando importación desde base de datos externa...");
      
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ 
            success: true, 
            imported: 45, 
            errors: 2,
            message: "Importación completada"
          });
        }, 2000);
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries(["todayAttendance"]);
      toast.success(`✓ ${result.imported} marcaciones importadas. ${result.errors} errores.`);
    },
    onError: () => {
      toast.error("Error al importar marcaciones");
    },
  });

  const handleEditRecord = (record) => {
    setEditingRecord({
      ...record,
      clock_in: record.clock_in || "",
      clock_out: record.clock_out || "",
      notes: record.notes || "",
      status: record.status || "Incompleto",
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!editingRecord) return;

    const clockIn = editingRecord.clock_in;
    const clockOut = editingRecord.clock_out;
    const scheduledStart = editingRecord.scheduled_start || "09:00";

    let workedHours = 0;
    let lateMinutes = 0;
    let isLate = false;

    if (clockIn && clockOut) {
      const [inHour, inMin] = clockIn.split(":").map(Number);
      const [outHour, outMin] = clockOut.split(":").map(Number);
      
      // Calcular horas trabajadas (descontando 60 minutos de break)
      const totalMinutes = (outHour * 60 + outMin) - (inHour * 60 + inMin) - 60;
      workedHours = Math.max(0, totalMinutes / 60);

      // Calcular tardanza
      const [schedHour, schedMin] = scheduledStart.split(":").map(Number);
      const scheduledMinutes = schedHour * 60 + schedMin;
      const actualMinutes = inHour * 60 + inMin;
      
      lateMinutes = Math.max(0, actualMinutes - scheduledMinutes);
      isLate = lateMinutes > 0;
    }

    const updatedData = {
      clock_in: clockIn || null,
      clock_out: clockOut || null,
      worked_hours: workedHours,
      is_late: isLate,
      late_minutes: lateMinutes,
      notes: editingRecord.notes,
      status: editingRecord.status,
      is_absent: editingRecord.status === "Ausente",
    };

    updateRecordMutation.mutate({ id: editingRecord.id, data: updatedData });
  };

  const handleApproveIncident = (incident) => {
    reviewIncidentMutation.mutate({
      id: incident.id,
      data: {
        status: "Aprobada",
        reviewed_by: `${employee.first_name} ${employee.last_name}`,
        review_date: format(new Date(), "yyyy-MM-dd"),
        review_comments: reviewComments || "Aprobada",
      }
    });
  };

  const handleRejectIncident = (incident) => {
    if (!reviewComments.trim()) {
      toast.error("Debes ingresar un motivo de rechazo");
      return;
    }
    reviewIncidentMutation.mutate({
      id: incident.id,
      data: {
        status: "Rechazada",
        reviewed_by: `${employee.first_name} ${employee.last_name}`,
        review_date: format(new Date(), "yyyy-MM-dd"),
        review_comments: reviewComments,
      }
    });
  };

  const departments = [...new Set(allEmployees.map(e => e.department_name))].filter(Boolean);

  const filteredEmployees = allEmployees.filter(emp => {
    const matchesSearch = emp.first_name.toLowerCase().includes(appliedSearchTerm.toLowerCase()) ||
                          emp.last_name.toLowerCase().includes(appliedSearchTerm.toLowerCase()) ||
                          emp.employee_code.toLowerCase().includes(appliedSearchTerm.toLowerCase());
    const matchesDept = appliedDepartment === "all" || emp.department_name === appliedDepartment;
    const matchesSite = appliedSite === "all" || emp.site === appliedSite || (appliedSite === "sin_sede" && !emp.site);
    return matchesSearch && matchesDept && matchesSite;
  });

  const employeesWithRecords = filteredEmployees.map(emp => {
    const record = todayRecords.find(r => r.employee_id === emp.id);
    return { ...emp, record };
  }).filter(emp => {
    // Aplicar filtros de asistencia aplicados
    if (appliedAttendanceFilter === "all") return true;
    if (appliedAttendanceFilter === "sin_entrada") return !emp.record || !emp.record.clock_in;
    if (appliedAttendanceFilter === "sin_salida") return emp.record && emp.record.clock_in && !emp.record.clock_out;
    if (appliedAttendanceFilter === "con_tardanza") return emp.record && emp.record.is_late;
    return true;
  });

  const handleExportToExcel = () => {
    const dataToExport = employeesWithRecords.map(emp => ({
      'Código': emp.employee_code,
      'Nombres': emp.first_name,
      'Apellidos': emp.last_name,
      'Cargo': emp.position,
      'Departamento': emp.department_name,
      'Sede': emp.site || 'Sin sede',
      'Entrada': emp.record?.clock_in || '--:--',
      'Salida': emp.record?.clock_out || '--:--',
      'Horas Trabajadas': emp.record?.worked_hours?.toFixed(2) || '0.00',
      'Tardanza (min)': emp.record?.late_minutes || 0,
      'Estado': emp.record?.status || 'Sin marcar'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
    
    const filterText = appliedAttendanceFilter === "all" ? "Todos" :
                      appliedAttendanceFilter === "sin_entrada" ? "Sin_Entrada" :
                      appliedAttendanceFilter === "sin_salida" ? "Sin_Salida" :
                      appliedAttendanceFilter === "con_tardanza" ? "Con_Tardanza" : "Filtrado";
    
    const dateText = appliedStartDate && appliedEndDate 
      ? `${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}`
      : format(appliedDate, "yyyy-MM-dd");
    
    const fileName = `Asistencia_${dateText}_${filterText}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    toast.success('✓ Archivo Excel generado correctamente');
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Por favor, permite las ventanas emergentes para imprimir');
      return;
    }

    const filterText = appliedAttendanceFilter === "all" ? "Todos los empleados" :
                      appliedAttendanceFilter === "sin_entrada" ? "Sin marcar entrada" :
                      appliedAttendanceFilter === "sin_salida" ? "Sin marcar salida" :
                      appliedAttendanceFilter === "con_tardanza" ? "Con tardanza" : "Filtrado";

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Reporte de Asistencia</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            padding: 20px;
            font-size: 12px;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 15px;
          }
          .header h1 { margin: 5px 0; font-size: 24px; }
          .header p { margin: 3px 0; color: #666; }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px;
          }
          th, td { 
            border: 1px solid #ddd; 
            padding: 8px; 
            text-align: left;
          }
          th { 
            background-color: #4f46e5; 
            color: white;
            font-weight: bold;
          }
          tr:nth-child(even) { background-color: #f9fafb; }
          .late { color: #ea580c; font-weight: bold; }
          .absent { color: #dc2626; font-weight: bold; }
          .complete { color: #16a34a; font-weight: bold; }
          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 11px;
            color: #666;
          }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Reporte de Asistencia</h1>
          <p><strong>Fecha:</strong> ${appliedStartDate && appliedEndDate 
            ? `${format(appliedStartDate, "dd/MM/yyyy")} - ${format(appliedEndDate, "dd/MM/yyyy")}`
            : format(appliedDate, "dd 'de' MMMM, yyyy", { locale: es })
          }</p>
          <p><strong>Filtro aplicado:</strong> ${filterText}</p>
          <p><strong>Total de empleados:</strong> ${employeesWithRecords.length}</p>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Empleado</th>
              <th>Cargo</th>
              <th>Departamento</th>
              <th>Entrada</th>
              <th>Salida</th>
              <th>Horas</th>
              <th>Tardanza</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${employeesWithRecords.map(emp => `
              <tr>
                <td>${emp.employee_code}</td>
                <td>${emp.first_name} ${emp.last_name}</td>
                <td>${emp.position}</td>
                <td>${emp.department_name}</td>
                <td>${emp.record?.clock_in || '--:--'}</td>
                <td>${emp.record?.clock_out || '--:--'}</td>
                <td>${emp.record?.worked_hours?.toFixed(2) || '0.00'}h</td>
                <td class="${emp.record?.is_late ? 'late' : ''}">${emp.record?.late_minutes || 0} min</td>
                <td class="${emp.record?.status === 'Completo' ? 'complete' : emp.record?.status === 'Ausente' ? 'absent' : ''}">${emp.record?.status || 'Sin marcar'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="footer">
          <p>Generado el ${format(new Date(), "dd/MM/yyyy 'a las' HH:mm")} - Sistema de Recursos Humanos</p>
        </div>
        
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  const getStatusConfig = (status, hasClockIn) => {
    if (!hasClockIn) {
      return { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle, text: "Sin marcar" };
    }
    const configs = {
      "Completo": { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle, text: "Completo" },
      "Incompleto": { color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock, text: "En curso" },
      "Ausente": { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle, text: "Ausente" },
      "Justificado": { color: "bg-blue-100 text-blue-700 border-blue-200", icon: FileText, text: "Justificado" },
    };
    return configs[status] || configs["Incompleto"];
  };

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card><CardContent className="p-8"><p>Cargando...</p></CardContent></Card>
      </div>
    );
  }

  return (
    <PermissionGuard employee={employee} requiredRole="admin">
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8 flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">
                Gestión de Asistencia
              </h1>
              <p className="text-slate-600 text-lg">
                Control y verificación de asistencia del personal
              </p>
            </div>
            {dbConnections.length > 0 && (
              <div className="flex gap-2">
                <Select onValueChange={(id) => importAttendanceMutation.mutate(id)}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Importar desde BD externa" />
                  </SelectTrigger>
                  <SelectContent>
                    {dbConnections.map(conn => (
                      <SelectItem key={conn.id} value={conn.id}>
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4" />
                          {conn.connection_name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  variant="outline"
                  onClick={() => window.location.href = "/DatabaseConfig"}
                >
                  <Database className="w-4 h-4 mr-2" />
                  Configurar
                </Button>
              </div>
            )}
          </div>

          {/* Holiday Banner */}
          {todayIsHoliday && (
            <Card className="border-0 shadow-lg bg-gradient-to-r from-orange-500 to-red-500 text-white mb-6">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-xl">
                    <CalendarIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-1">
                      🎉 Día Feriado: {holidayInfo?.name}
                    </h3>
                    <p className="text-orange-100">
                      Este es un día no laborable. No se contabiliza como falta para los empleados.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats - Compact Horizontal Layout */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-100 rounded-xl shrink-0">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-2xl font-bold text-slate-900 leading-tight">
                      {allEmployees.length}
                    </div>
                    <p className="text-slate-600 text-xs truncate">Total empleados</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-green-100 rounded-xl shrink-0">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-2xl font-bold text-slate-900 leading-tight">
                      {todayRecords.filter(r => r.clock_in).length}
                    </div>
                    <p className="text-slate-600 text-xs truncate">Han marcado hoy</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-yellow-100 rounded-xl shrink-0">
                    <Clock className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-2xl font-bold text-slate-900 leading-tight">
                      {todayRecords.filter(r => r.is_late).length}
                    </div>
                    <p className="text-slate-600 text-xs truncate">Tardanzas hoy</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-orange-100 rounded-xl shrink-0">
                    <AlertCircle className="w-5 h-5 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-2xl font-bold text-slate-900 leading-tight">
                      {pendingIncidents.length}
                    </div>
                    <p className="text-slate-600 text-xs truncate">Justif. pendientes</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <Tabs defaultValue="attendance" className="space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="attendance">Asistencia del Día</TabsTrigger>
              <TabsTrigger value="incidents">Justificaciones</TabsTrigger>
            </TabsList>

            {/* Attendance Tab */}
            <TabsContent value="attendance" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {/* Primera fila: Filtros de fecha */}
                    <div className="flex flex-wrap items-center gap-4">
                      {!startDate && !endDate ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-700">Fecha:</span>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {format(selectedDate, "dd MMM yyyy", { locale: es })}
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
                          </div>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setDateFilterMode("range");
                              setStartDate(new Date());
                              setEndDate(new Date());
                            }}
                          >
                            📅 Usar rango de fechas
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-700">Desde:</span>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {startDate ? format(startDate, "dd MMM yyyy", { locale: es }) : "Seleccionar"}
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
                                  {endDate ? format(endDate, "dd MMM yyyy", { locale: es }) : "Seleccionar"}
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
                            {startDate && endDate ? Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1 : 0} días
                          </Badge>
                          
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setStartDate(null);
                              setEndDate(null);
                              setDateFilterMode("single");
                            }}
                            className="text-red-600 hover:text-red-700"
                          >
                            Usar fecha única
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Segunda fila: Filtros generales */}
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex-1 min-w-64">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                          <Input
                            placeholder="Buscar empleado..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </div>

                      <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Departamento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {departments.map(dept => (
                            <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={selectedSite} onValueChange={setSelectedSite}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Sede" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          <SelectItem value="sin_sede">Sin sede</SelectItem>
                          {sites.map(site => (
                            <SelectItem key={site.id} value={site.name}>{site.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={attendanceFilter} onValueChange={setAttendanceFilter}>
                        <SelectTrigger className="w-52">
                          <SelectValue placeholder="Filtro de asistencia" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="sin_entrada">
                            <div className="flex items-center gap-2">
                              <XCircle className="w-4 h-4 text-red-600" />
                              Sin marcar entrada
                            </div>
                          </SelectItem>
                          <SelectItem value="sin_salida">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-yellow-600" />
                              Sin marcar salida
                            </div>
                          </SelectItem>
                          <SelectItem value="con_tardanza">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-orange-600" />
                              Con tardanza
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        onClick={applyFilters}
                        className="bg-indigo-600 hover:bg-indigo-700"
                      >
                        <Search className="w-4 h-4 mr-2" />
                        Buscar
                      </Button>

                      <Button
                        onClick={handleExportToExcel}
                        variant="outline"
                        className="bg-green-600 text-white hover:bg-green-700"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Exportar Excel
                      </Button>

                      <Button
                        onClick={handlePrint}
                        variant="outline"
                      >
                        <Printer className="w-4 h-4 mr-2" />
                        Imprimir
                      </Button>
                    </div>
                  </div>

                  {employeesWithRecords.length > 0 && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-900">
                        <strong>Mostrando {employeesWithRecords.length} empleados</strong>
                        {appliedAttendanceFilter !== "all" && (
                          <span className="ml-2">
                            - Filtro: {
                              appliedAttendanceFilter === "sin_entrada" ? "Sin marcar entrada" :
                              appliedAttendanceFilter === "sin_salida" ? "Sin marcar salida" :
                              appliedAttendanceFilter === "con_tardanza" ? "Con tardanza" : ""
                            }
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {employeesWithRecords.map(emp => {
                      const statusConfig = getStatusConfig(emp.record?.status, emp.record?.clock_in);
                      const StatusIcon = statusConfig.icon;

                      return (
                        <div 
                          key={emp.id}
                          className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                                {emp.first_name[0]}{emp.last_name[0]}
                              </div>
                              
                              <div className="flex-1">
                                <h4 className="font-bold text-slate-900">
                                  {emp.first_name} {emp.last_name}
                                </h4>
                                <p className="text-sm text-slate-600">
                                  {emp.employee_code} • {emp.position} • {emp.department_name}
                                </p>
                              </div>

                              <div className="grid grid-cols-4 gap-4 text-sm">
                                <div className="text-center">
                                  <p className="text-xs text-slate-600 mb-1">Entrada</p>
                                  <p className="font-semibold text-slate-900">
                                    {emp.record?.clock_in || "--:--"}
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-slate-600 mb-1">Salida</p>
                                  <p className="font-semibold text-slate-900">
                                    {emp.record?.clock_out || "--:--"}
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-slate-600 mb-1">Horas</p>
                                  <p className="font-semibold text-slate-900">
                                    {emp.record?.worked_hours?.toFixed(2) || "0.00"}h
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-slate-600 mb-1">Tardanza</p>
                                  <p className={`font-semibold ${emp.record?.late_minutes > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                    {emp.record?.late_minutes || 0} min
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <Badge className={statusConfig.color}>
                                  <StatusIcon className="w-3 h-3 mr-1" />
                                  {statusConfig.text}
                                </Badge>

                                {emp.record?.is_late && (
                                  <Badge className="bg-orange-100 text-orange-700">
                                    +{emp.record.late_minutes} min
                                  </Badge>
                                )}

                                {emp.record && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEditRecord(emp.record)}
                                  >
                                    <Edit className="w-4 h-4 mr-1" />
                                    Editar
                                  </Button>
                                )}

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setHistoryEmployeeId(emp.id);
                                    setShowHistory(true);
                                  }}
                                  title="Ver historial de incidencias"
                                >
                                  <History className="w-4 h-4" />
                                </Button>
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

            {/* Incidents Tab */}
            <TabsContent value="incidents" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-slate-50/50">
                  <CardTitle className="text-xl font-bold">
                    Justificaciones Pendientes de Aprobación
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {pendingIncidents.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
                      <p className="text-slate-600">No hay justificaciones pendientes</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pendingIncidents.map(incident => {
                        const emp = allEmployees.find(e => e.id === incident.employee_id);
                        return (
                          <div 
                            key={incident.id}
                            className="p-4 border border-slate-200 rounded-lg"
                          >
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex-1">
                                <h4 className="font-bold text-slate-900 mb-1">
                                  {emp ? `${emp.first_name} ${emp.last_name}` : "Empleado desconocido"}
                                </h4>
                                <p className="text-sm text-slate-600 mb-2">
                                  {emp?.employee_code} • {emp?.position}
                                </p>
                                <div className="flex gap-4 text-sm">
                                  <Badge className="bg-orange-100 text-orange-700">
                                    {incident.incident_type}
                                  </Badge>
                                  <span className="text-slate-600">
                                    📅 {format(new Date(incident.incident_date), "dd MMM yyyy", { locale: es })}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="p-3 bg-slate-50 rounded-lg mb-4">
                              <p className="text-sm font-semibold text-slate-900 mb-1">
                                Justificación:
                              </p>
                              <p className="text-sm text-slate-700">
                                {incident.justification}
                              </p>
                            </div>

                            {incident.supporting_document_url && (
                              <div className="mb-4">
                                <a
                                  href={incident.supporting_document_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline bg-indigo-50 px-3 py-2 rounded-lg"
                                >
                                  <Download className="w-4 h-4" />
                                  Ver documento adjunto
                                </a>
                              </div>
                            )}

                            <div className="flex gap-3">
                              <Button
                                className="flex-1 bg-green-600 hover:bg-green-700"
                                onClick={() => {
                                  setReviewingIncident(incident);
                                  setShowIncidentModal(true);
                                }}
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Aprobar
                              </Button>
                              <Button
                                variant="outline"
                                className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                                onClick={() => {
                                  setReviewingIncident(incident);
                                  setShowIncidentModal(true);
                                }}
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Rechazar
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Edit Record Modal */}
        {showEditModal && editingRecord && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
            onClick={() => setShowEditModal(false)}
          >
            <Card 
              className="max-w-2xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">
                    Editar Registro de Asistencia
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => setShowEditModal(false)}
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600">
                      Fecha: <strong>{format(new Date(editingRecord.date), "dd 'de' MMMM, yyyy", { locale: es })}</strong>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Hora de Entrada
                      </label>
                      <Input
                        type="time"
                        value={editingRecord.clock_in}
                        onChange={(e) => setEditingRecord({ ...editingRecord, clock_in: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Hora de Salida
                      </label>
                      <Input
                        type="time"
                        value={editingRecord.clock_out}
                        onChange={(e) => setEditingRecord({ ...editingRecord, clock_out: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Estado
                    </label>
                    <Select 
                      value={editingRecord.status}
                      onValueChange={(value) => setEditingRecord({ ...editingRecord, status: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Completo">Completo</SelectItem>
                        <SelectItem value="Incompleto">Incompleto</SelectItem>
                        <SelectItem value="Ausente">Ausente</SelectItem>
                        <SelectItem value="Justificado">Justificado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Notas
                    </label>
                    <Textarea
                      value={editingRecord.notes}
                      onChange={(e) => setEditingRecord({ ...editingRecord, notes: e.target.value })}
                      placeholder="Observaciones adicionales..."
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowEditModal(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                      onClick={handleSaveEdit}
                      disabled={updateRecordMutation.isPending}
                    >
                      {updateRecordMutation.isPending ? "Guardando..." : "Guardar Cambios"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Review Incident Modal */}
        {showIncidentModal && reviewingIncident && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
            onClick={() => {
              setShowIncidentModal(false);
              setReviewComments("");
            }}
          >
            <Card 
              className="max-w-2xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">
                    Revisar Justificación
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => {
                      setShowIncidentModal(false);
                      setReviewComments("");
                    }}
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600 mb-2">
                      <strong>Tipo:</strong> {reviewingIncident.incident_type}
                    </p>
                    <p className="text-sm text-slate-600 mb-2">
                      <strong>Fecha:</strong> {format(new Date(reviewingIncident.incident_date), "dd 'de' MMMM, yyyy", { locale: es })}
                    </p>
                    <p className="text-sm text-slate-700">
                      <strong>Justificación:</strong><br />
                      {reviewingIncident.justification}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Comentarios de Revisión
                    </label>
                    <Textarea
                      value={reviewComments}
                      onChange={(e) => setReviewComments(e.target.value)}
                      placeholder="Ingresa comentarios sobre la decisión..."
                      rows={3}
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      * Requerido para rechazar una justificación
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => handleApproveIncident(reviewingIncident)}
                      disabled={reviewIncidentMutation.isPending}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Aprobar
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => handleRejectIncident(reviewingIncident)}
                      disabled={reviewIncidentMutation.isPending}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Rechazar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* History Modal */}
      {showHistory && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
          onClick={() => {
            setShowHistory(false);
            setHistoryEmployeeId(null);
          }}
        >
          <div 
            className="max-w-4xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <IncidentHistory 
              incidents={employeeIncidents} 
              isLoading={false}
              employeeName={historyEmployeeId ? allEmployees.find(e => e.id === historyEmployeeId)?.first_name + ' ' + allEmployees.find(e => e.id === historyEmployeeId)?.last_name : ""}
            />
            <Button
              onClick={() => {
                setShowHistory(false);
                setHistoryEmployeeId(null);
              }}
              className="w-full mt-4"
              variant="outline"
            >
              Cerrar
            </Button>
          </div>
        </div>
      )}
      </PermissionGuard>
      );
      }