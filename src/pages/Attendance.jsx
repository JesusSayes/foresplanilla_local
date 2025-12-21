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
  XCircle, TrendingUp, FileText, Upload, Filter, ChevronDown
} from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, differenceInMinutes, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

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

  const { data: attendanceRecords = [], isLoading } = useQuery({
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
        const recordDate = new Date(r.date);
        return recordDate >= startDate && recordDate <= endDate;
      });
    },
    enabled: !!employee?.id,
  });

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

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setJustificationForm({ ...justificationForm, supporting_document_url: file_url });
      toast.success("Archivo cargado exitosamente");
    } catch (error) {
      toast.error("Error al cargar el archivo");
      console.error(error);
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
      incident_date: selectedRecord?.date || format(new Date(), "yyyy-MM-dd"),
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.presentDays}
              </div>
              <p className="text-slate-600 text-sm">Días asistidos</p>
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
                {stats.lateDays}
              </div>
              <p className="text-slate-600 text-sm">Tardanzas</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-red-100 rounded-xl">
                  <XCircle className="w-6 h-6 text-red-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.absentDays}
              </div>
              <p className="text-slate-600 text-sm">Ausencias</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <TrendingUp className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.avgHours.toFixed(1)}h
              </div>
              <p className="text-slate-600 text-sm">Promedio diario</p>
            </CardContent>
          </Card>
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
                      return (
                        <div 
                          key={record.id}
                          className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-semibold text-slate-900 mb-1">
                                {format(new Date(record.date), "EEEE, dd 'de' MMMM", { locale: es })}
                              </h4>
                              <div className="flex gap-4 text-sm text-slate-600">
                                <span>
                                  <strong>Entrada:</strong> {record.clock_in || "No registrada"}
                                </span>
                                <span>
                                  <strong>Salida:</strong> {record.clock_out || "No registrada"}
                                </span>
                              </div>
                            </div>
                            <Badge className={getStatusConfig(record.status).color}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {record.status}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-slate-600">Horas trabajadas</span>
                              <p className="font-semibold text-slate-900">
                                {record.worked_hours ? `${record.worked_hours.toFixed(2)}h` : "N/A"}
                              </p>
                            </div>
                            {record.is_late && (
                              <div>
                                <span className="text-slate-600">Tardanza</span>
                                <p className="font-semibold text-orange-600">
                                  {record.late_minutes} min
                                </p>
                              </div>
                            )}
                            {record.notes && (
                              <div className="col-span-3">
                                <span className="text-slate-600">Observaciones: </span>
                                <span className="text-slate-900">{record.notes}</span>
                              </div>
                            )}
                          </div>

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
                <CardTitle className="text-xl font-bold">
                  Mis Justificaciones
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {incidents.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600 text-sm">No hay justificaciones</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {incidents.map((incident) => {
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
                                {format(new Date(incident.incident_date), "dd MMM yyyy", { locale: es })}
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

                          {incident.status === "Rechazada" && incident.review_comments && (
                            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                              <strong>Motivo:</strong> {incident.review_comments}
                            </div>
                          )}

                          {incident.supporting_document_url && (
                            <a 
                              href={incident.supporting_document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-indigo-600 hover:underline mt-2 inline-block"
                            >
                              Ver documento adjunto
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

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
                        Fecha: <strong>{format(new Date(selectedRecord.date), "dd 'de' MMMM, yyyy", { locale: es })}</strong>
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
                      Documento de Sustento
                    </label>
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFileUpload}
                    />
                    {justificationForm.supporting_document_url && (
                      <p className="text-sm text-green-600 mt-2">
                        ✓ Archivo cargado correctamente
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