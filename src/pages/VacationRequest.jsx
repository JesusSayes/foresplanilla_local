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
  Calendar as CalendarIcon, Plus, Clock, CheckCircle, 
  XCircle, AlertCircle, Upload, FileText, Trash2, Search, ChevronDown
} from "lucide-react";
import { format, differenceInBusinessDays, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

export default function VacationRequest() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [formData, setFormData] = useState({
    request_type: "Vacaciones",
    is_full_day: true,
    start_time: "09:00",
    end_time: "18:00",
    start_date: null,
    end_date: null,
    reason: "",
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

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      return await base44.entities.Employee.filter({ status: "Activo" });
    },
    enabled: employee?.role === "admin",
  });

  const targetEmployeeId = employee?.role === "admin" ? selectedEmployeeId : employee?.id;

  const { data: vacationBalance } = useQuery({
    queryKey: ["vacationBalance", targetEmployeeId],
    queryFn: async () => {
      if (!targetEmployeeId) return null;
      const balances = await base44.entities.VacationBalance.filter(
        { employee_id: targetEmployeeId, is_active: true },
        "-period_start",
        1
      );
      return balances[0];
    },
    enabled: !!targetEmployeeId,
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["vacationRequests", targetEmployeeId],
    queryFn: async () => {
      if (!targetEmployeeId) return [];
      return await base44.entities.VacationRequest.filter(
        { employee_id: targetEmployeeId },
        "-created_date"
      );
    },
    enabled: !!targetEmployeeId,
  });

  const createRequestMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.VacationRequest.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["vacationRequests"]);
      toast.success("Solicitud enviada exitosamente");
      setShowForm(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Error al crear la solicitud");
      console.error(error);
    },
  });

  const deleteRequestMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.VacationRequest.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["vacationRequests"]);
      toast.success("Solicitud cancelada");
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    const employeeIdToUse = employee.role === "admin" ? selectedEmployeeId : employee.id;

    if (employee.role === "admin" && !employeeIdToUse) {
      toast.error("Por favor selecciona un empleado");
      return;
    }

    if (!formData.start_date || !formData.end_date) {
      toast.error("Por favor selecciona las fechas");
      return;
    }

    if (!formData.reason.trim()) {
      toast.error("Por favor ingresa el motivo");
      return;
    }

    const totalDays = differenceInDays(formData.end_date, formData.start_date) + 1;
    const businessDays = differenceInBusinessDays(formData.end_date, formData.start_date) + 1;

    const requestData = {
      employee_id: employeeIdToUse,
      request_type: formData.request_type,
      start_date: format(formData.start_date, "yyyy-MM-dd"),
      end_date: format(formData.end_date, "yyyy-MM-dd"),
      total_days: totalDays,
      business_days: businessDays,
      reason: formData.reason,
      supporting_document_url: formData.supporting_document_url,
      status: "Pendiente",
    };

    createRequestMutation.mutate(requestData);
  };

  const resetForm = () => {
    setFormData({
      request_type: "Vacaciones",
      is_full_day: true,
      start_time: "09:00",
      end_time: "18:00",
      start_date: null,
      end_date: null,
      reason: "",
      supporting_document_url: null,
    });
    if (employee?.role !== "admin") {
      setSelectedEmployeeId(null);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, supporting_document_url: file_url });
      toast.success("Archivo cargado exitosamente");
    } catch (error) {
      toast.error("Error al cargar el archivo");
      console.error(error);
    }
  };

  const getStatusConfig = (status) => {
    const configs = {
      "Pendiente": {
        color: "bg-yellow-100 text-yellow-700 border-yellow-200",
        icon: Clock,
      },
      "Aprobada": {
        color: "bg-green-100 text-green-700 border-green-200",
        icon: CheckCircle,
      },
      "Rechazada": {
        color: "bg-red-100 text-red-700 border-red-200",
        icon: XCircle,
      },
      "Cancelada": {
        color: "bg-slate-100 text-slate-700 border-slate-200",
        icon: AlertCircle,
      },
    };
    return configs[status] || configs["Pendiente"];
  };

  const calculateDaysIfSelected = () => {
    if (!formData.start_date || !formData.end_date) return null;
    return {
      total: differenceInDays(formData.end_date, formData.start_date) + 1,
      business: differenceInBusinessDays(formData.end_date, formData.start_date) + 1,
    };
  };

  const selectedDays = calculateDaysIfSelected();

  const filteredEmployees = allEmployees.filter(emp => {
    const searchLower = employeeSearchTerm.toLowerCase();
    return emp.first_name.toLowerCase().includes(searchLower) ||
           emp.last_name.toLowerCase().includes(searchLower) ||
           emp.employee_code.toLowerCase().includes(searchLower);
  });

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
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Solicitudes de Vacaciones y Permisos
          </h1>
          <p className="text-slate-600 text-lg">
            Gestiona tus días de descanso y permisos
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Balance and Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Vacation Balance */}
            {vacationBalance && (
              <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
                <CardHeader>
                  <CardTitle className="text-xl font-bold text-slate-900">
                    Saldo de Vacaciones
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600 mb-1">
                        {vacationBalance.total_entitled_days}
                      </div>
                      <p className="text-slate-600 text-sm">Días de derecho</p>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-orange-600 mb-1">
                        {vacationBalance.days_taken}
                      </div>
                      <p className="text-slate-600 text-sm">Días tomados</p>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-emerald-600 mb-1">
                        {vacationBalance.days_pending}
                      </div>
                      <p className="text-slate-600 text-sm">Días disponibles</p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-600">Progreso de uso</span>
                      <span className="text-sm font-semibold text-slate-900">
                        {((vacationBalance.days_taken / vacationBalance.total_entitled_days) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3">
                      <div 
                        className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${Math.min((vacationBalance.days_taken / vacationBalance.total_entitled_days) * 100, 100)}%` 
                        }}
                      />
                    </div>
                  </div>

                  {vacationBalance.deadline && (
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-800">
                        <strong>Fecha límite:</strong> {format(new Date(vacationBalance.deadline), "dd 'de' MMMM, yyyy", { locale: es })}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Request Form */}
            {!showForm ? (
              <Card className="border-0 shadow-lg">
                <CardContent className="p-12 text-center">
                  <CalendarIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    Nueva Solicitud
                  </h3>
                  <p className="text-slate-600 mb-6">
                    Solicita vacaciones o permisos de manera fácil y rápida
                  </p>
                  <Button 
                    className="bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => setShowForm(true)}
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Crear Solicitud
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-bold">Nueva Solicitud</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => {
                        setShowForm(false);
                        resetForm();
                      }}
                    >
                      ✕
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {employee.role === "admin" ? (
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-2">
                          Empleado *
                        </label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
                            className="w-full flex items-center justify-between h-9 px-3 py-2 text-sm border border-input bg-transparent rounded-md shadow-sm hover:bg-accent transition-colors"
                          >
                            <span className={selectedEmployeeId ? "text-foreground" : "text-muted-foreground"}>
                              {selectedEmployeeId
                                ? (() => { const e = allEmployees.find(e => e.id === selectedEmployeeId); return e ? `${e.first_name} ${e.last_name} - ${e.employee_code}` : ""; })()
                                : "Seleccionar empleado"}
                            </span>
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          </button>
                          {showEmployeeDropdown && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg">
                              <div className="p-2 border-b">
                                <div className="relative">
                                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                  <Input
                                    placeholder="Buscar por nombre o código..."
                                    value={employeeSearchTerm}
                                    onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                                    className="h-8 pl-8"
                                    autoFocus
                                  />
                                </div>
                              </div>
                              <div className="max-h-52 overflow-y-auto">
                                {filteredEmployees.length === 0 ? (
                                  <div className="p-3 text-sm text-slate-500 text-center">No se encontraron empleados</div>
                                ) : (
                                  filteredEmployees.map((emp) => (
                                    <button
                                      key={emp.id}
                                      type="button"
                                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${selectedEmployeeId === emp.id ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-700"}`}
                                      onClick={() => {
                                        setSelectedEmployeeId(emp.id);
                                        setShowEmployeeDropdown(false);
                                        setEmployeeSearchTerm("");
                                      }}
                                    >
                                      {emp.first_name} {emp.last_name} - {emp.employee_code}
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        {showEmployeeDropdown && (
                          <div className="fixed inset-0 z-40" onClick={() => setShowEmployeeDropdown(false)} />
                        )}
                      </div>
                    ) : (
                      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                        <label className="block text-sm font-semibold text-slate-900 mb-1">
                          Empleado
                        </label>
                        <p className="text-slate-700">
                          {employee.first_name} {employee.last_name} - {employee.employee_code}
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Tipo de solicitud
                      </label>
                      <Select 
                        value={formData.request_type}
                        onValueChange={(value) => setFormData({ ...formData, request_type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Vacaciones">Vacaciones</SelectItem>
                          <SelectItem value="Permiso con goce">Permiso con goce</SelectItem>
                          <SelectItem value="Permiso sin goce">Permiso sin goce</SelectItem>
                          <SelectItem value="Licencia médica">Licencia médica</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-2">
                          Fecha de inicio
                        </label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="outline" 
                              className="w-full justify-start text-left"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.start_date 
                                ? format(formData.start_date, "dd MMM yyyy", { locale: es })
                                : "Seleccionar"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={formData.start_date}
                              onSelect={(date) => setFormData({ ...formData, start_date: date })}
                              locale={es}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-2">
                          Fecha de fin
                        </label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="outline" 
                              className="w-full justify-start text-left"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.end_date 
                                ? format(formData.end_date, "dd MMM yyyy", { locale: es })
                                : "Seleccionar"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={formData.end_date}
                              onSelect={(date) => setFormData({ ...formData, end_date: date })}
                              disabled={(date) => formData.start_date ? date < formData.start_date : false}
                              locale={es}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {selectedDays && (
                      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-indigo-900">
                            <strong>Total días:</strong> {selectedDays.total} días calendario
                          </span>
                          <span className="text-sm text-indigo-900">
                            <strong>Días hábiles:</strong> {selectedDays.business}
                          </span>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Motivo
                      </label>
                      <Textarea
                        value={formData.reason}
                        onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                        placeholder="Describe el motivo de tu solicitud..."
                        rows={4}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Documento de sustento (opcional)
                      </label>
                      <div className="flex gap-2">
                        <Input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={handleFileUpload}
                          className="flex-1"
                        />
                        {formData.supporting_document_url && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setFormData({ ...formData, supporting_document_url: null })}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        )}
                      </div>
                      {formData.supporting_document_url && (
                        <p className="text-sm text-green-600 mt-2">
                          ✓ Archivo cargado correctamente
                        </p>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <Button 
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setShowForm(false);
                          resetForm();
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button 
                        type="submit"
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                        disabled={createRequestMutation.isPending}
                      >
                        {createRequestMutation.isPending ? "Enviando..." : "Enviar Solicitud"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Requests History */}
          <div className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b">
                <CardTitle className="text-xl font-bold">
                  {employee.role === "admin" && selectedEmployeeId ? "Solicitudes del Empleado" : "Mis Solicitudes"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : requests.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600">No hay solicitudes</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {requests.map((request) => {
                      const StatusIcon = getStatusConfig(request.status).icon;
                      return (
                        <div 
                          key={request.id}
                          className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-semibold text-slate-900 mb-1">
                                {request.request_type}
                              </h4>
                              <p className="text-sm text-slate-600">
                                {format(new Date(request.start_date), "dd MMM", { locale: es })} - {format(new Date(request.end_date), "dd MMM yyyy", { locale: es })}
                              </p>
                            </div>
                            <Badge className={getStatusConfig(request.status).color}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {request.status}
                            </Badge>
                          </div>
                          
                          <div className="text-sm text-slate-600 mb-3">
                            <strong>{request.total_days}</strong> días ({request.business_days} hábiles)
                          </div>

                          {request.reason && (
                            <p className="text-sm text-slate-600 mb-3 line-clamp-2">
                              {request.reason}
                            </p>
                          )}

                          {request.status === "Rechazada" && request.rejection_reason && (
                            <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800 mb-3">
                              <strong>Motivo:</strong> {request.rejection_reason}
                            </div>
                          )}

                          {request.status === "Pendiente" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => {
                                if (confirm("¿Estás seguro de cancelar esta solicitud?")) {
                                  deleteRequestMutation.mutate(request.id);
                                }
                              }}
                            >
                              Cancelar solicitud
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
        </div>
      </div>
    </div>
  );
}