import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Clock, Plus, Edit, Trash2, Users, User, Calendar, Search
} from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "../components/hooks/usePermissions";

export default function ScheduleManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    schedule_name: "",
    employee_id: null,
    department_name: "",
    departments: [],
    monday_start: "09:00",
    monday_end: "18:00",
    tuesday_start: "09:00",
    tuesday_end: "18:00",
    wednesday_start: "09:00",
    wednesday_end: "18:00",
    thursday_start: "09:00",
    thursday_end: "18:00",
    friday_start: "09:00",
    friday_end: "18:00",
    saturday_start: "",
    saturday_end: "",
    sunday_start: "",
    sunday_end: "",
    break_duration_minutes: 60,
    tolerance_minutes: 10,
    is_active: true,
  });

  const { hasAnyPermission, loading: permissionsLoading } = usePermissions();
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

  const { data: schedules = [] } = useQuery({
    queryKey: ["workSchedules"],
    queryFn: async () => await base44.entities.WorkSchedule.list("-created_date"),
  });

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      return await base44.entities.Employee.filter({ status: "Activo" });
    },
  });

  const createScheduleMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.WorkSchedule.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["workSchedules"]);
      toast.success("Horario creado correctamente");
      resetForm();
    },
    onError: () => toast.error("Error al crear el horario"),
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.WorkSchedule.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["workSchedules"]);
      toast.success("Horario actualizado correctamente");
      resetForm();
    },
    onError: () => toast.error("Error al actualizar el horario"),
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.WorkSchedule.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["workSchedules"]);
      toast.success("Horario eliminado correctamente");
    },
    onError: () => toast.error("Error al eliminar el horario"),
  });

  const handleCreate = () => {
    setEditingSchedule(null);
    setFormData({
      schedule_name: "",
      employee_id: null,
      department_name: "",
      departments: [],
      monday_start: "09:00",
      monday_end: "18:00",
      tuesday_start: "09:00",
      tuesday_end: "18:00",
      wednesday_start: "09:00",
      wednesday_end: "18:00",
      thursday_start: "09:00",
      thursday_end: "18:00",
      friday_start: "09:00",
      friday_end: "18:00",
      saturday_start: "",
      saturday_end: "",
      sunday_start: "",
      sunday_end: "",
      break_duration_minutes: 60,
      tolerance_minutes: 10,
      is_active: true,
    });
    setShowForm(true);
  };

  const handleEdit = (schedule) => {
    setEditingSchedule(schedule);
    setFormData({
      ...schedule,
      departments: schedule.departments || []
    });
    setShowForm(true);
  };

  const handleDelete = (schedule) => {
    if (confirm(`¿Eliminar el horario "${schedule.schedule_name}"?`)) {
      deleteScheduleMutation.mutate(schedule.id);
    }
  };

  const handleSubmit = () => {
    if (!formData.schedule_name) {
      toast.error("El nombre del horario es requerido");
      return;
    }

    if (!formData.employee_id && formData.departments.length === 0) {
      toast.error("Debe asignar a un empleado o al menos un departamento");
      return;
    }

    if (editingSchedule) {
      updateScheduleMutation.mutate({ id: editingSchedule.id, data: formData });
    } else {
      createScheduleMutation.mutate(formData);
    }
  };

  const resetForm = () => {
    setFormData({
      schedule_name: "",
      employee_id: null,
      department_name: "",
      departments: [],
      monday_start: "09:00",
      monday_end: "18:00",
      tuesday_start: "09:00",
      tuesday_end: "18:00",
      wednesday_start: "09:00",
      wednesday_end: "18:00",
      thursday_start: "09:00",
      thursday_end: "18:00",
      friday_start: "09:00",
      friday_end: "18:00",
      saturday_start: "",
      saturday_end: "",
      sunday_start: "",
      sunday_end: "",
      break_duration_minutes: 60,
      tolerance_minutes: 10,
      is_active: true,
    });
    setEditingSchedule(null);
    setShowForm(false);
  };

  const departments = [...new Set(allEmployees.map(e => e.department_name))].filter(Boolean);

  const individualSchedules = schedules.filter(s => s.employee_id);
  const departmentSchedules = schedules.filter(s => (s.departments?.length > 0 || s.department_name) && !s.employee_id);

  const getEmployeeName = (empId) => {
    const emp = allEmployees.find(e => e.id === empId);
    return emp ? `${emp.first_name} ${emp.last_name}` : "Empleado desconocido";
  };

  const filteredIndividual = individualSchedules.filter(s => {
    const empName = getEmployeeName(s.employee_id).toLowerCase();
    return empName.includes(searchTerm.toLowerCase()) || 
           s.schedule_name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const filteredDepartment = departmentSchedules.filter(s => {
    const depts = s.departments || [s.department_name];
    return depts.some(d => d?.toLowerCase().includes(searchTerm.toLowerCase())) ||
           s.schedule_name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (!employee || permissionsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasAccess = hasAnyPermission([
    "schedules.view", "schedules.manage", "schedules.create", "system.admin"
  ]);

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">No tienes permisos para gestionar horarios</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Gestión de Horarios
          </h1>
          <p className="text-slate-600 text-lg">
            Administra horarios de trabajo para empleados y departamentos
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <Clock className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {schedules.length}
              </div>
              <p className="text-slate-600 text-sm">Horarios totales</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <User className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {individualSchedules.length}
              </div>
              <p className="text-slate-600 text-sm">Horarios individuales</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-purple-100 rounded-xl">
                  <Users className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {departmentSchedules.length}
              </div>
              <p className="text-slate-600 text-sm">Horarios departamentales</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="individual" className="space-y-6">
          <div className="flex items-center justify-between">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="individual">Horarios Individuales</TabsTrigger>
              <TabsTrigger value="department">Horarios por Departamento</TabsTrigger>
            </TabsList>

            {hasAnyPermission(["schedules.create", "schedules.manage", "system.admin"]) && (
              <Button
                onClick={handleCreate}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Horario
              </Button>
            )}
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <Input
                  placeholder="Buscar horario..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <TabsContent value="individual" className="mt-0">
                {filteredIndividual.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">No hay horarios individuales</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredIndividual.map(schedule => (
                      <div key={schedule.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-bold text-slate-900 text-lg">
                                {schedule.schedule_name}
                              </h4>
                              {!schedule.is_active && (
                                <Badge className="bg-red-100 text-red-700">Inactivo</Badge>
                              )}
                            </div>
                            <div className="space-y-1 text-sm">
                              <p className="text-slate-600">
                                <strong>Empleado:</strong> {getEmployeeName(schedule.employee_id)}
                              </p>
                              <p className="text-slate-600">
                                <strong>Lun-Vie:</strong> {schedule.monday_start || "--"} - {schedule.monday_end || "--"}
                              </p>
                              <div className="flex gap-4 text-slate-600">
                                <span><strong>Break:</strong> {schedule.break_duration_minutes} min</span>
                                <span><strong>Tolerancia:</strong> {schedule.tolerance_minutes} min</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {hasAnyPermission(["schedules.edit", "schedules.manage", "system.admin"]) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEdit(schedule)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            {hasAnyPermission(["schedules.delete", "schedules.manage", "system.admin"]) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600"
                                onClick={() => handleDelete(schedule)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="department" className="mt-0">
                {filteredDepartment.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">No hay horarios departamentales</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredDepartment.map(schedule => {
                      const scheduleDepts = schedule.departments || [schedule.department_name];
                      return (
                        <div key={schedule.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <h4 className="font-bold text-slate-900 text-lg">
                                  {schedule.schedule_name}
                                </h4>
                                {scheduleDepts.filter(Boolean).map((dept, idx) => (
                                  <Badge key={idx} className="bg-purple-100 text-purple-700">
                                    {dept}
                                  </Badge>
                                ))}
                                {!schedule.is_active && (
                                  <Badge className="bg-red-100 text-red-700">Inactivo</Badge>
                                )}
                              </div>
                            <div className="space-y-1 text-sm">
                              <p className="text-slate-600">
                                <strong>Lun-Vie:</strong> {schedule.monday_start || "--"} - {schedule.monday_end || "--"}
                              </p>
                              {schedule.saturday_start && (
                                <p className="text-slate-600">
                                  <strong>Sábado:</strong> {schedule.saturday_start} - {schedule.saturday_end}
                                </p>
                              )}
                              <div className="flex gap-4 text-slate-600">
                                <span><strong>Break:</strong> {schedule.break_duration_minutes} min</span>
                                <span><strong>Tolerancia:</strong> {schedule.tolerance_minutes} min</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {hasAnyPermission(["schedules.edit", "schedules.manage", "system.admin"]) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEdit(schedule)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            {hasAnyPermission(["schedules.delete", "schedules.manage", "system.admin"]) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600"
                                onClick={() => handleDelete(schedule)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </CardContent>
          </Card>
        </Tabs>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto"
          onClick={resetForm}
        >
          <Card 
            className="max-w-4xl w-full my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  {editingSchedule ? "Editar Horario" : "Nuevo Horario"}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={resetForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 max-h-[70vh] overflow-y-auto">
              <div className="space-y-6">
                <div>
                  <Label>Nombre del Horario *</Label>
                  <Input
                    value={formData.schedule_name}
                    onChange={(e) => setFormData({ ...formData, schedule_name: e.target.value })}
                    placeholder="Ej: Horario Administrativo"
                  />
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Asignar a Empleado Individual</Label>
                    <Select 
                      value={formData.employee_id || ""} 
                      onValueChange={(val) => setFormData({ ...formData, employee_id: val || null, departments: [] })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar empleado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>Ninguno</SelectItem>
                        {allEmployees.map(emp => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.first_name} {emp.last_name} - {emp.employee_code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>O asignar a Departamentos (múltiples)</Label>
                    <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                      {departments.map(dept => (
                        <label key={dept} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-2 rounded">
                          <input
                            type="checkbox"
                            checked={formData.departments?.includes(dept)}
                            onChange={(e) => {
                              const newDepts = e.target.checked
                                ? [...(formData.departments || []), dept]
                                : formData.departments.filter(d => d !== dept);
                              setFormData({ ...formData, departments: newDepts, employee_id: null });
                            }}
                            className="w-4 h-4 rounded"
                          />
                          <span className="text-sm">{dept}</span>
                        </label>
                      ))}
                    </div>
                    {formData.departments?.length > 0 && (
                      <p className="text-xs text-slate-600 mt-2">
                        {formData.departments.length} departamento(s) seleccionado(s)
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900">Horario Semanal</h3>
                  
                  {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(day => {
                    const dayLabels = {
                      monday: "Lunes",
                      tuesday: "Martes",
                      wednesday: "Miércoles",
                      thursday: "Jueves",
                      friday: "Viernes",
                      saturday: "Sábado",
                      sunday: "Domingo"
                    };

                    return (
                      <div key={day} className="grid grid-cols-3 gap-4 items-center">
                        <Label className="font-semibold">{dayLabels[day]}</Label>
                        <div>
                          <Label className="text-xs text-slate-600">Entrada</Label>
                          <Input
                            type="time"
                            value={formData[`${day}_start`] || ""}
                            onChange={(e) => setFormData({ ...formData, [`${day}_start`]: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-600">Salida</Label>
                          <Input
                            type="time"
                            value={formData[`${day}_end`] || ""}
                            onChange={(e) => setFormData({ ...formData, [`${day}_end`]: e.target.value })}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Duración del Break (minutos)</Label>
                    <Input
                      type="number"
                      value={formData.break_duration_minutes}
                      onChange={(e) => setFormData({ ...formData, break_duration_minutes: parseInt(e.target.value) })}
                    />
                  </div>

                  <div>
                    <Label>Tolerancia (minutos)</Label>
                    <Input
                      type="number"
                      value={formData.tolerance_minutes}
                      onChange={(e) => setFormData({ ...formData, tolerance_minutes: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="is_active" className="text-sm">Horario activo</label>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button variant="outline" className="flex-1" onClick={resetForm}>
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                    onClick={handleSubmit}
                    disabled={createScheduleMutation.isPending || updateScheduleMutation.isPending}
                  >
                    {editingSchedule ? "Actualizar" : "Crear"} Horario
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}