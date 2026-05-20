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
import { 
  Clock, Calendar as CalendarIcon, AlertCircle, CheckCircle, 
  XCircle, TrendingUp, FileText, Upload, Filter, ChevronDown, History
} from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { parseDateLima, dateToStringLima, todayLima } from "@/lib/dateUtils";
import ClockInOutWidget from "../components/attendance/ClockInOutWidget";
import IncidentHistory from "../components/attendance/IncidentHistory";

export default function Attendance() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [dateRange, setDateRange] = useState("month");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showJustifyForm, setShowJustifyForm] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [justificationForm, setJustificationForm] = useState({
    incident_type: "Tardanza",
    justification: "",
    supporting_document_url: null,
  });
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

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

  const { data: workSchedule } = useQuery({
    queryKey: ["workSchedule", employee?.id, employee?.department_name],
    queryFn: async () => {
      if (!employee?.id) return null;
      
      // First try to find individual schedule
      const individualSchedules = await base44.entities.WorkSchedule.filter(
        { employee_id: employee.id, is_active: true },
        "-created_date",
        1
      );
      
      if (individualSchedules && individualSchedules.length > 0) {
        return individualSchedules[0];
      }
      
      // If not found, try department schedule
      if (employee.department_name) {
        const departmentSchedules = await base44.entities.WorkSchedule.filter(
          { department_name: employee.department_name, is_active: true },
          "-created_date",
          1
        );
        
        if (departmentSchedules && departmentSchedules.length > 0) {
          return departmentSchedules[0];
        }
      }
      
      return null;
    },
    enabled: !!employee?.id,
  });

  const { data: attendanceRecords = [], isLoading, refetch: refetchRecords } = useQuery({
    queryKey: ["attendanceRecords", employee?.id, dateRange, selectedDate],
    queryFn: async () => {
      if (!employee?.id) return [];
      
      let startDate, endDate;
      if (dateRange === "week") {
        startDate = startOfWeek(selectedDate, { weekStartsOn: 1 });
        endDate = endOfWeek(selectedDate, { weekStartsOn: 1 });
      } else {
        startDate = startOfMonth(selectedDate);
        endDate = endOfMonth(selectedDate);
      }

      const records = await base44.entities.AttendanceRecord.filter(
        { employee_id: employee.id },
        "-date"
      );

      return records.filter(r => {
        const recordDate = parseDateLima(r.date);
        return recordDate >= startDate && recordDate <= endDate;
      });
    },
    enabled: !!employee?.id,
  });

  const todayRecord = attendanceRecords.find(
    r => r.date === todayLima()
  );

  const { data: incidents = [] } = useQuery({
    queryKey: ["attendanceIncidents", employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      return await base44.entities.AttendanceIncident.filter(
        { employee_id: employee.id },
        "-created_date"
      );
    },
    enabled: !!employee?.id,
  });

  const createIncidentMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.AttendanceIncident.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["attendanceIncidents"]);
      toast.success("Justificación enviada correctamente");
      setShowJustifyForm(false);
      setSelectedRecord(null);
      resetForm();
    },
    onError: (error) => {
      toast.error("Error al enviar la justificación");
      console.error(error);
    },
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setJustificationForm({ ...justificationForm, supporting_document_url: file_url });
      toast.success("Archivo cargado exitosamente");
    } catch (error) {
      toast.error("Error al cargar el archivo");
      console.error(error);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmitJustification = () => {
    if (!justificationForm.justification.trim()) {
      toast.error("Por favor ingresa una justificación");
      return;
    }

    const incidentData = {
      employee_id: employee.id,
      attendance_record_id: selectedRecord?.id || null,
      incident_date: selectedRecord?.date || todayLima(),
      incident_type: justificationForm.incident_type,
      justification: justificationForm.justification,
      supporting_document_url: justificationForm.supporting_document_url,
      status: "Pendiente",
    };

    createIncidentMutation.mutate(incidentData);
  };

  const resetForm = () => {
    setJustificationForm({
      incident_type: "Tardanza",
      justification: "",
      supporting_document_url: null,
    });
  };

  const getStatusConfig = (status) => {
    const configs = {
      "Completo": { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle },
      "Incompleto": { color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: AlertCircle },
      "Ausente": { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
      "Justificado": { color: "bg-blue-100 text-blue-700 border-blue-200", icon: FileText },
    };
    return configs[status] || configs["Completo"];
  };

  const getIncidentStatusConfig = (status) => {
    const configs = {
      "Pendiente": { color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
      "Aprobada": { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle },
      "Rechazada": { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
    };
    return configs[status] || configs["Pendiente"];
  };

  const getScheduleForDay = (date) => {
    if (!workSchedule) return { start: "09:00", end: "18:00" };
    
    const dayOfWeek = format(parseDateLima(date), "EEEE", { locale: es }).toLowerCase();
    const dayMapping = {
      "lunes": { start: workSchedule.monday_start, end: workSchedule.monday_end },
      "martes": { start: workSchedule.tuesday_start, end: workSchedule.tuesday_end },
      "miércoles": { start: workSchedule.wednesday_start, end: workSchedule.wednesday_end },
      "jueves": { start: workSchedule.thursday_start, end: workSchedule.thursday_end },
      "viernes": { start: workSchedule.friday_start, end: workSchedule.friday_end },
      "sábado": { start: workSchedule.saturday_start, end: workSchedule.saturday_end },
      "domingo": { start: workSchedule.sunday_start, end: workSchedule.sunday_end },
    };
    
    return dayMapping[dayOfWeek] || { start: "09:00", end: "18:00" };
  };

  const calculateWorkedHours = (clockIn, clockOut, breakMinutes = 60) => {
    if (!clockIn || !clockOut) return 0;
    
    const [inHour, inMin] = clockIn.split(":").map(Number);
    const [outHour, outMin] = clockOut.split(":").map(Number);
    
    const inMinutes = inHour * 60 + inMin;
    const outMinutes = outHour * 60 + outMin;
    
    const totalMinutes = outMinutes - inMinutes - breakMinutes;
    return totalMinutes / 60;
  };

  const calculateStats = () => {
    const totalDays = attendanceRecords.length;
    const presentDays = attendanceRecords.filter(r => !r.is_absent).length;
    const lateDays = attendanceRecords.filter(r => r.is_late).length;
    const absentDays = attendanceRecords.filter(r => r.is_absent).length;
    const totalHours = attendanceRecords.reduce((sum, r) => sum + (r.worked_hours || 0), 0);
    const avgHours = totalDays > 0 ? totalHours / totalDays : 0;

    return { totalDays, presentDays, lateDays, absentDays, totalHours, avgHours };
  };

  const stats = calculateStats();

  const handleClockAction = async (data, isUpdate = false) => {
    if (isUpdate) {
      await base44.entities.AttendanceRecord.update(data.id, data);
    } else {
      await base44.entities.AttendanceRecord.create(data);
    }
    refetchRecords();
  };

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card><CardContent className="p-8"><p>Cargando...</p></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Mi Asistencia</h1>
          <p className="text-slate-600 text-lg">
            Consulta tus registros de entrada y salida
          </p>
        </div>

        {/* Stats Cards */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.presentDays}</span>
              <span className="text-sm text-slate-600">Días asistidos</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Clock className="w-5 h-5 text-yellow-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.lateDays}</span>
              <span className="text-sm text-slate-600">Tardanzas</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <XCircle className="w-5 h-5 text-red-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.absentDays}</span>
              <span className="text-sm text-slate-600">Ausencias</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.avgHours.toFixed(1)}h</span>
              <span className="text-sm text-slate-600">Promedio diario</span>
            </div>
          </div>
        </div>

        {/* Clock In/Out Widget */}
        <div className="mb-8">
          <ClockInOutWidget
            employee={employee}
            workSchedule={workSchedule}
            todayRecord={todayRecord}
            onClockAction={handleClockAction}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Attendance Records */}
          <div className="lg:col-span-2 space-y-6">
            {/* Filters */}
            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Filter className="w-5 h-5 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-700">Periodo:</span>
                  </div>
                  
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">Semana</SelectItem>
                      <SelectItem value="month">Mes</SelectItem>
                    </SelectContent>
                  </Select>

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

                  <div className="ml-auto">
                    <Button
                      onClick={() => setShowJustifyForm(true)}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Justificar Incidencia
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Work Schedule Info */}
            {workSchedule && (
              <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50 to-purple-50">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-100 rounded-xl">
                      <Clock className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-900 mb-2">
                        {workSchedule.schedule_name}
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        {workSchedule.monday_start && (
                          <div>
                            <span className="text-slate-600">Lun-Vie:</span>
                            <p className="font-semibold text-slate-900">
                              {workSchedule.monday_start} - {workSchedule.monday_end}
                            </p>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-600">Break:</span>
                          <p className="font-semibold text-slate-900">
                            {workSchedule.break_duration_minutes} min
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-600">Tolerancia:</span>
                          <p className="font-semibold text-slate-900">
                            {workSchedule.tolerance_minutes} min
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Records Table */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-xl font-bold">
                  Registro de Asistencia
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : attendanceRecords.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">No hay registros en este periodo</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {attendanceRecords.map((record) => {
                      const StatusIcon = getStatusConfig(record.status).icon;
                      const daySchedule = getScheduleForDay(record.date);
                      const expectedHours = calculateWorkedHours(
                        daySchedule.start, 
                        daySchedule.end, 
                        workSchedule?.break_duration_minutes || 60
                      );
                      
                      return (
                        <div 
                          key={record.id}
                          className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-semibold text-slate-900 mb-1">
                                {format(parseDateLima(record.date), "EEEE, dd 'de' MMMM", { locale: es })}
                              </h4>
                              <div className="flex gap-4 text-sm">
                                <div>
                                  <span className="text-slate-500 text-xs">Programado:</span>
                                  <p className="text-slate-600 font-medium">
                                    {daySchedule.start} - {daySchedule.end}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-slate-500 text-xs">Registrado:</span>
                                  <p className={`font-medium ${record.clock_in && record.clock_out ? 'text-slate-900' : 'text-red-600'}`}>
                                    {record.clock_in || "- -"} - {record.clock_out || "- -"}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <Badge className={getStatusConfig(record.status).color}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {record.status}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-3 gap-4 text-sm bg-slate-50 rounded-lg p-3">
                            <div>
                              <span className="text-slate-600 text-xs">Horas trabajadas</span>
                              <p className="font-semibold text-slate-900">
                                {record.worked_hours ? `${record.worked_hours.toFixed(2)}h` : "0h"}
                              </p>
                            </div>
                            <div>
                              <span className="text-slate-600 text-xs">Horas esperadas</span>
                              <p className="font-semibold text-slate-700">
                                {expectedHours.toFixed(2)}h
                              </p>
                            </div>
                            {record.is_late && (
                              <div>
                                <span className="text-slate-600 text-xs">Tardanza</span>
                                <p className="font-semibold text-orange-600">
                                  {record.late_minutes} min
                                </p>
                              </div>
                            )}
                          </div>

                          {record.notes && (
                            <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                              <span className="text-slate-600">📝 </span>
                              <span className="text-slate-900">{record.notes}</span>
                            </div>
                          )}

                          {(record.is_late || record.is_absent || record.status === "Incompleto") && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-3 text-indigo-600 hover:bg-indigo-50"
                              onClick={() => {
                                setSelectedRecord(record);
                                setShowJustifyForm(true);
                              }}
                            >
                              <FileText className="w-4 h-4 mr-2" />
                              Justificar
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Justifications Sidebar */}
          <div className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">
                    Mis Justificaciones
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowHistory(true)}
                  >
                    <History className="w-4 h-4 mr-2" />
                    Ver Historial
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {incidents.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600 text-sm">No hay justificaciones</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {incidents.slice(0, 5).map((incident) => {
                      const StatusIcon = getIncidentStatusConfig(incident.status).icon;
                      return (
                        <div 
                          key={incident.id}
                          className="p-4 border border-slate-200 rounded-lg"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-semibold text-slate-900 text-sm mb-1">
                                {incident.incident_type}
                              </h4>
                              <p className="text-xs text-slate-600">
                                {format(parseDateLima(incident.incident_date), "dd MMM yyyy", { locale: es })}
                              </p>
                            </div>
                            <Badge className={getIncidentStatusConfig(incident.status).color + " text-xs"}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {incident.status}
                            </Badge>
                          </div>
                          
                          <p className="text-sm text-slate-600 mb-2 line-clamp-2">
                            {incident.justification}
                          </p>

                          {incident.status === "Aprobada" && incident.review_comments && (
                            <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
                              <strong>Aprobada:</strong> {incident.review_comments}
                            </div>
                          )}

                          {incident.status === "Rechazada" && incident.review_comments && (
                            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                              <strong>Rechazada:</strong> {incident.review_comments}
                            </div>
                          )}

                          {incident.supporting_document_url && (
                            <a 
                              href={incident.supporting_document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-indigo-600 hover:underline mt-2 inline-block"
                            >
                              📎 Ver documento
                            </a>
                          )}
                        </div>
                      );
                    })}
                    {incidents.length > 5 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setShowHistory(true)}
                      >
                        Ver todas ({incidents.length})
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* History Modal */}
        {showHistory && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
            onClick={() => setShowHistory(false)}
          >
            <div 
              className="max-w-4xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <IncidentHistory 
                incidents={incidents} 
                isLoading={false}
                employeeName={`${employee.first_name} ${employee.last_name}`}
              />
              <Button
                onClick={() => setShowHistory(false)}
                className="w-full mt-4"
                variant="outline"
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}

        {/* Justification Modal */}
        {showJustifyForm && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
            onClick={() => {
              setShowJustifyForm(false);
              setSelectedRecord(null);
              resetForm();
            }}
          >
            <Card 
              className="max-w-2xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">
                    Justificar Incidencia
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => {
                      setShowJustifyForm(false);
                      setSelectedRecord(null);
                      resetForm();
                    }}
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  {selectedRecord && (
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-600 mb-1">
                        Fecha: <strong>{format(parseDateLima(selectedRecord.date), "dd 'de' MMMM, yyyy", { locale: es })}</strong>
                      </p>
                      {selectedRecord.is_late && (
                        <p className="text-sm text-orange-600">
                          Tardanza de {selectedRecord.late_minutes} minutos
                        </p>
                      )}
                      {selectedRecord.is_absent && (
                        <p className="text-sm text-red-600">
                          Ausencia registrada
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Tipo de Incidencia
                    </label>
                    <Select 
                      value={justificationForm.incident_type}
                      onValueChange={(value) => setJustificationForm({ ...justificationForm, incident_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Tardanza">Tardanza</SelectItem>
                        <SelectItem value="Falta">Falta</SelectItem>
                        <SelectItem value="Salida Temprana">Salida Temprana</SelectItem>
                        <SelectItem value="Olvido de Marcación">Olvido de Marcación</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Justificación
                    </label>
                    <Textarea
                      value={justificationForm.justification}
                      onChange={(e) => setJustificationForm({ ...justificationForm, justification: e.target.value })}
                      placeholder="Describe el motivo de la incidencia..."
                      rows={4}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Documento de Sustento (Opcional)
                    </label>
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:border-indigo-400 transition-colors">
                      <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <Input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFileUpload}
                        disabled={uploadingFile}
                        className="max-w-xs mx-auto"
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        PDF, JPG, PNG (Ej: certificado médico)
                      </p>
                    </div>
                    {uploadingFile && (
                      <p className="text-sm text-blue-600 mt-2 flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        Cargando archivo...
                      </p>
                    )}
                    {justificationForm.supporting_document_url && !uploadingFile && (
                      <p className="text-sm text-green-600 mt-2 flex items-center justify-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Archivo cargado correctamente
                      </p>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setShowJustifyForm(false);
                        setSelectedRecord(null);
                        resetForm();
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                      onClick={handleSubmitJustification}
                      disabled={createIncidentMutation.isPending}
                    >
                      {createIncidentMutation.isPending ? "Enviando..." : "Enviar Justificación"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}