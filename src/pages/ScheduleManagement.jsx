import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Clock, Plus, Edit, Trash2, Users, User, Calendar, Search, ChevronsUpDown, Check, X
} from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "../components/hooks/usePermissions";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";

export default function ScheduleManagement() {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;

  // Estado de formularios (combina ambos mundos)
  // const [showForm, setShowForm] = useState(false);
  // const [editingSchedule, setEditingSchedule] = useState(null);

  // Nuevos estados de main para plantillas / asignaciones
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingAssignment, setEditingAssignment] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);

  const [templateFormData, setTemplateFormData] = useState({
    schedule_name: "",
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
    exempt_from_clocking: false,
    overtime_authorized: false,
    is_active: true,
  });

  const [assignFormData, setAssignFormData] = useState({
    employee_id: null,
    departments: [],
  });

  const { hasAnyPermission, loading: permissionsLoading } = usePermissions();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (currentUser?.employee?.role === "admin" || currentUser?.employee?.role === "super_admin") {
      updateEmployeeStatuses().then(result => {
        if (result.success && result.updatedCount > 0) {
          console.log(`${result.updatedCount} empleado(s) actualizado(s) a estado Cesado automáticamente`);
        }
      });
    }
  }, [currentUser]);

  const { data: schedules = [] } = useQuery({
    queryKey: ["workSchedules"],
    queryFn: async () => await entitiesAPI.WorkSchedule.list("-created_date"),
  });

  // Separar templates (sin asignación) y asignaciones
  const templates = schedules.filter(s => !s.employee_id && !s.departments?.length && !s.department_name);
  const assignments = schedules.filter(s => s.employee_id || s.departments?.length > 0 || s.department_name);

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      return await entitiesAPI.Employee.filter({ status: "Activo" });
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data) => {
      return await entitiesAPI.WorkSchedule.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["workSchedules"]);
      toast.success("Plantilla de horario creada");
      resetTemplateForm();
    },
    onError: () => toast.error("Error al crear plantilla"),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await entitiesAPI.WorkSchedule.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["workSchedules"]);
      toast.success("Plantilla actualizada");
      resetTemplateForm();
    },
    onError: () => toast.error("Error al actualizar plantilla"),
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.WorkSchedule.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["workSchedules"]);
      toast.success("Horario asignado correctamente");
      resetAssignForm();
    },
    onError: () => toast.error("Error al asignar horario"),
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.WorkSchedule.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["workSchedules"]);
      toast.success("Asignación actualizada");
      resetAssignForm();
    },
    onError: () => toast.error("Error al actualizar asignación"),
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (id) => {
      return await entitiesAPI.WorkSchedule.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["workSchedules"]);
      toast.success("Horario eliminado correctamente");
    },
    onError: () => toast.error("Error al eliminar el horario"),
  });

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateFormData({
      schedule_name: "",
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
      exempt_from_clocking: false,
      overtime_authorized: false,
      is_active: true,
    });
    setShowTemplateForm(true);
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setTemplateFormData(template);
    setShowTemplateForm(true);
  };

  const handleCreateAssignment = () => {
    if (templates.length === 0) {
      toast.error("Primero crea una plantilla de horario");
      return;
    }
    setEditingAssignment(null);
    setAssignFormData({ employee_id: null, departments: [] });
    setSelectedTemplateId("");
    setTemplateSearch("");
    setEmployeeSearch("");
    setShowEmployeeDropdown(false);
    setShowTemplateDropdown(false);
    setShowAssignForm(true);
  };

  const handleEditAssignment = (assignment) => {
    setEditingAssignment(assignment);
    setAssignFormData({
      employee_id: assignment.employee_id || null,
      departments: assignment.departments || (assignment.department_name ? [assignment.department_name] : []),
    });
    setSelectedTemplateId(assignment.id);
    setTemplateSearch(`${assignment.schedule_name} (${assignment.monday_start} - ${assignment.monday_end})`);

    if (assignment.employee_id) {
      const emp = allEmployees.find(e => e.id === assignment.employee_id);
      if (emp) {
        setEmployeeSearch(`${emp.first_name} ${emp.last_name} - ${emp.employee_code}`);
      }
    } else {
      setEmployeeSearch("");
    }

    setShowEmployeeDropdown(false);
    setShowTemplateDropdown(false);
    setShowAssignForm(true);
  };

  const handleDeleteSchedule = (schedule) => {
    const isTemplate = templates.some(t => t.id === schedule.id);
    const message = isTemplate
      ? `¿Eliminar la plantilla "${schedule.schedule_name}"?`
      : `¿Eliminar la asignación del horario "${schedule.schedule_name}"?`;

    if (confirm(message)) {
      deleteScheduleMutation.mutate(schedule.id);
    }
  };

  const handleSubmitTemplate = () => {
    if (!templateFormData.schedule_name) {
      toast.error("El nombre del horario es requerido");
      return;
    }

    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data: templateFormData });
    } else {
      createTemplateMutation.mutate(templateFormData);
    }
  };

  const handleSubmitAssignment = () => {
    if (!assignFormData.employee_id && assignFormData.departments.length === 0) {
      toast.error("Debe asignar a un empleado o al menos un departamento");
      return;
    }

    if (!selectedTemplateId && !editingAssignment) {
      toast.error("Seleccione un horario plantilla");
      return;
    }

    if (editingAssignment) {
      const updatedData = {
        employee_id: assignFormData.employee_id,
        departments: assignFormData.departments,
      };
      updateAssignmentMutation.mutate({ id: editingAssignment.id, data: updatedData });
    } else {
      const template = templates.find(t => t.id === selectedTemplateId);
      if (!template) {
        toast.error("Plantilla no encontrada");
        return;
      }

      const newAssignment = {
        ...template,
        employee_id: assignFormData.employee_id,
        departments: assignFormData.departments,
      };
      delete newAssignment.id;
      delete newAssignment.created_date;
      delete newAssignment.updated_date;
      delete newAssignment.created_by;

      createAssignmentMutation.mutate(newAssignment);
    }
  };

  const resetTemplateForm = () => {
    setTemplateFormData({
      schedule_name: "",
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
      exempt_from_clocking: false,
      overtime_authorized: false,
      is_active: true,
    });
    setEditingTemplate(null);
    setShowTemplateForm(false);
  };

  const resetAssignForm = () => {
    setAssignFormData({ employee_id: null, departments: [] });
    setSelectedTemplateId("");
    setTemplateSearch("");
    setEmployeeSearch("");
    setShowEmployeeDropdown(false);
    setShowTemplateDropdown(false);
    setEditingAssignment(null);
    setShowAssignForm(false);
  };

  const departments = [...new Set(allEmployees.map(e => e.department_name))].filter(Boolean);

  const individualAssignments = assignments.filter(s => s.employee_id);
  const departmentAssignments = assignments.filter(s => (s.departments?.length > 0 || s.department_name) && !s.employee_id);

  // Empleados con y sin horario asignado
  const employeesWithSchedule = individualAssignments.map(s => s.employee_id);
  const employeesWithoutSchedule = allEmployees.filter(emp => !employeesWithSchedule.includes(emp.id));

  // Departamentos con y sin horario asignado
  const assignedDepartments = [...new Set(
    departmentAssignments.flatMap(s => s.departments || [s.department_name]).filter(Boolean)
  )];
  const departmentsWithoutSchedule = departments.filter(dept => !assignedDepartments.includes(dept));

  const getEmployeeName = (empId) => {
    const emp = allEmployees.find(e => e.id === empId);
    return emp ? `${emp.first_name} ${emp.last_name}` : "Empleado desconocido";
  };

  const filteredTemplates = templates.filter(t =>
    t.schedule_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredIndividual = individualAssignments.filter(s => {
    const empName = getEmployeeName(s.employee_id).toLowerCase();
    return empName.includes(searchTerm.toLowerCase()) ||
           s.schedule_name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const filteredDepartment = departmentAssignments.filter(s => {
    const depts = s.departments || [s.department_name];
    return depts.some(d => d?.toLowerCase().includes(searchTerm.toLowerCase())) ||
           s.schedule_name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Filtrar empleados SIN horario para el modal de asignación
  const filteredEmployeesWithoutSchedule = employeesWithoutSchedule.filter(emp => {
    const searchLower = employeeSearch.toLowerCase();
    return emp.first_name.toLowerCase().includes(searchLower) ||
           emp.last_name.toLowerCase().includes(searchLower) ||
           emp.employee_code.toLowerCase().includes(searchLower);
  });

  const filteredTemplatesForAssignment = templates.filter(template => {
    const searchLower = templateSearch.toLowerCase();
    return template.schedule_name.toLowerCase().includes(searchLower) ||
           `${template.monday_start} - ${template.monday_end}`.includes(searchLower);
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <Calendar className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {templates.length}
              </div>
              <p className="text-slate-600 text-sm">Plantillas de horario</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <Clock className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {assignments.length}
              </div>
              <p className="text-slate-600 text-sm">Asignaciones totales</p>
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
                {individualAssignments.length}
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
                {departmentAssignments.length}
              </div>
              <p className="text-slate-600 text-sm">Horarios departamentales</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="templates" className="space-y-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <TabsList className="grid w-full max-w-3xl grid-cols-5">
                <TabsTrigger value="templates" className="flex items-center gap-2">
                  <span>Plantillas</span>
                  <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-orange-500 rounded-full">
                    {filteredTemplates.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="individual" className="flex items-center gap-2">
                  <span>Asignados</span>
                  <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-orange-500 rounded-full">
                    {filteredIndividual.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="department" className="flex items-center gap-2">
                  <span>Departamentos</span>
                  <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-orange-500 rounded-full">
                    {filteredDepartment.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="unassigned-employees" className="flex items-center gap-2">
                  <span>Sin Horario</span>
                  <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-orange-500 rounded-full">
                    {employeesWithoutSchedule.filter(emp => {
                      const searchLower = searchTerm.toLowerCase();
                      return emp.first_name.toLowerCase().includes(searchLower) ||
                        emp.last_name.toLowerCase().includes(searchLower) ||
                        emp.employee_code.toLowerCase().includes(searchLower) ||
                        emp.department_name?.toLowerCase().includes(searchLower);
                    }).length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="unassigned-departments" className="flex items-center gap-2">
                  <span>Depts Sin Horario</span>
                  <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-orange-500 rounded-full">
                    {departmentsWithoutSchedule.filter(dept => 
                      dept.toLowerCase().includes(searchTerm.toLowerCase())
                    ).length}
                  </span>
                </TabsTrigger>
              </TabsList>

              {hasAnyPermission(["schedules.create", "schedules.manage", "system.admin"]) && (
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateTemplate}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Plantilla
                  </Button>
                  <Button
                    onClick={handleCreateAssignment}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Asignar Horario
                  </Button>
                </div>
              )}
            </div>
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <TabsContent value="templates" className="mt-0">
                {filteredTemplates.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600 mb-4">No hay plantillas de horario creadas</p>
                    <Button onClick={handleCreateTemplate} className="bg-green-600 hover:bg-green-700">
                      <Plus className="w-4 h-4 mr-2" />
                      Crear Primera Plantilla
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredTemplates.map(template => (
                      <div key={template.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-bold text-slate-900 text-lg">
                                {template.schedule_name}
                              </h4>
                              <Badge className="bg-green-100 text-green-700">Plantilla</Badge>
                              {!template.is_active && (
                                <Badge className="bg-red-100 text-red-700">Inactiva</Badge>
                              )}
                            </div>
                            <div className="space-y-1 text-sm">
                              <p className="text-slate-600">
                                <strong>Lun-Vie:</strong> {template.monday_start || "--"} - {template.monday_end || "--"}
                              </p>
                              {template.saturday_start && (
                                <p className="text-slate-600">
                                  <strong>Sábado:</strong> {template.saturday_start} - {template.saturday_end}
                                </p>
                              )}
                              <div className="flex gap-4 text-slate-600">
                                <span><strong>Break:</strong> {template.break_duration_minutes} min</span>
                                <span><strong>Tolerancia:</strong> {template.tolerance_minutes} min</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {hasAnyPermission(["schedules.edit", "schedules.manage", "system.admin"]) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditTemplate(template)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            {hasAnyPermission(["schedules.delete", "schedules.manage", "system.admin"]) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600"
                                onClick={() => handleDeleteSchedule(template)}
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
                                {getEmployeeName(schedule.employee_id)}
                              </h4>
                              {!schedule.is_active && (
                                <Badge className="bg-red-100 text-red-700">Inactivo</Badge>
                              )}
                              {schedule.exempt_from_clocking && (
                                <Badge className="bg-purple-100 text-purple-700">Exonerado marcación</Badge>
                              )}
                              {schedule.overtime_authorized && (
                                <Badge className="bg-blue-100 text-blue-700">HE autorizadas</Badge>
                              )}
                            </div>
                            <div className="space-y-1 text-sm">
                              <p className="text-slate-600">
                                <strong>Horario:</strong> {schedule.schedule_name}
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
                                onClick={() => handleEditAssignment(schedule)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            {hasAnyPermission(["schedules.delete", "schedules.manage", "system.admin"]) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600"
                                onClick={() => handleDeleteSchedule(schedule)}
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
                                  onClick={() => handleEditAssignment(schedule)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              )}
                              {hasAnyPermission(["schedules.delete", "schedules.manage", "system.admin"]) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600"
                                  onClick={() => handleDeleteSchedule(schedule)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                              </div>
                              </div>
                              </div>
                              );
                              })}
                              </div>
                              )}
                              </TabsContent>

                              <TabsContent value="unassigned-employees" className="mt-0">
                              {(() => {
                              const filtered = employeesWithoutSchedule.filter(emp => {
                              const searchLower = searchTerm.toLowerCase();
                              return emp.first_name.toLowerCase().includes(searchLower) ||
                              emp.last_name.toLowerCase().includes(searchLower) ||
                              emp.employee_code.toLowerCase().includes(searchLower) ||
                              emp.department_name?.toLowerCase().includes(searchLower);
                              });

                              return filtered.length === 0 ? (
                              <div className="text-center py-12">
                              <User className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                              <p className="text-slate-600">Todos los empleados tienen horario asignado</p>
                              </div>
                              ) : (
                              <div className="space-y-3">
                              {filtered.map(emp => (
                              <div key={emp.id} className="p-4 border border-amber-200 bg-amber-50/30 rounded-lg hover:shadow-md transition-all">
                              <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold">
                              {emp.first_name[0]}{emp.last_name[0]}
                              </div>
                              <div>
                              <h4 className="font-bold text-slate-900">
                                {emp.first_name} {emp.last_name}
                              </h4>
                              <p className="text-sm text-slate-600">
                                {emp.employee_code} • {emp.department_name || "Sin departamento"}
                              </p>
                              </div>
                              </div>
                              <div className="flex items-center gap-2">
                              <Badge className="bg-amber-100 text-amber-700 border-amber-300">
                              Sin Horario
                              </Badge>
                              {hasAnyPermission(["schedules.create", "schedules.manage", "system.admin"]) && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setAssignFormData({
                                    employee_id: emp.id,
                                    departments: [],
                                  });
                                  setEmployeeSearch(`${emp.first_name} ${emp.last_name} - ${emp.employee_code}`);
                                  setEditingAssignment(null);
                                  setShowAssignForm(true);
                                }}
                                className="bg-indigo-600 hover:bg-indigo-700"
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                Asignar Horario
                              </Button>
                              )}
                              </div>
                              </div>
                              </div>
                              ))}
                              </div>
                              );
                              })()}
                              </TabsContent>

                              <TabsContent value="unassigned-departments" className="mt-0">
                                {(() => {
                                  const filtered = departmentsWithoutSchedule.filter(dept =>
                                    dept.toLowerCase().includes(searchTerm.toLowerCase())
                                  );

                                  return filtered.length === 0 ? (
                              <div className="text-center py-12">
                              <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                              <p className="text-slate-600">Todos los departamentos tienen horario asignado</p>
                              </div>
                              ) : (
                              <div className="space-y-3">
                              {filtered.map(dept => {
                              const empCount = allEmployees.filter(e => e.department_name === dept).length;
                              return (
                              <div key={dept} className="p-4 border border-amber-200 bg-amber-50/30 rounded-lg hover:shadow-md transition-all">
                              <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                              <div className="p-3 bg-amber-100 rounded-xl">
                                <Users className="w-6 h-6 text-amber-600" />
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-900">{dept}</h4>
                                <p className="text-sm text-slate-600">{empCount} empleados</p>
                              </div>
                              </div>
                              <Badge className="bg-amber-100 text-amber-700 border-amber-300">
                              Sin Horario
                              </Badge>
                              </div>
                              </div>
                              );
                              })}
                              </div>
                              );
                              })()}
                              </TabsContent>
                              </CardContent>
                              </Card>
                              </Tabs>
                              </div>

      {/* Template Form Modal */}
      {showTemplateForm && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto"
          onClick={resetTemplateForm}
        >
          <Card
            className="max-w-4xl w-full my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b bg-green-50/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  {editingTemplate ? "Editar Plantilla de Horario" : "Nueva Plantilla de Horario"}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={resetTemplateForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 max-h-[70vh] overflow-y-auto">
              <div className="space-y-6">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>ℹ️ Plantilla de horario:</strong> Define el horario base que luego podrás asignar a empleados o departamentos
                  </p>
                </div>

                <div>
                  <Label>Nombre de la Plantilla *</Label>
                  <Input
                    value={templateFormData.schedule_name}
                    onChange={(e) => setTemplateFormData({ ...templateFormData, schedule_name: e.target.value })}
                    placeholder="Ej: Horario Administrativo, Horario Operativo, etc."
                  />
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Asignar a Empleado Individual</Label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
                        className="w-full flex items-center justify-between px-3 py-2 border border-slate-200 rounded-md bg-white hover:bg-slate-50 text-left"
                      >
                        <span className={formData.employee_id ? "text-slate-900" : "text-slate-500"}>
                          {formData.employee_id && employeeSearch ? employeeSearch : "Seleccionar empleado"}
                        </span>
                        <ChevronsUpDown className="w-4 h-4 text-slate-400" />
                      </button>

                      {showEmployeeDropdown && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg">
                          <div className="p-2 border-b">
                            <Input
                              placeholder="Buscar por nombre o código..."
                              value={employeeSearch}
                              onChange={(e) => setEmployeeSearch(e.target.value)}
                              autoFocus
                              className="h-8"
                            />
                          </div>
                          <div className="max-h-60 overflow-y-auto">
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-slate-50 text-sm text-slate-600 border-b"
                              onClick={() => {
                                setFormData({ ...formData, employee_id: null });
                                setEmployeeSearch("");
                                setShowEmployeeDropdown(false);
                              }}
                            >
                              Ninguno
                            </button>
                            {filteredEmployees.length > 0 ? (
                              filteredEmployees.map(emp => (
                                <button
                                  key={emp.id}
                                  type="button"
                                  className={`w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between ${
                                    formData.employee_id === emp.id ? 'bg-indigo-50' : ''
                                  }`}
                                  onClick={() => {
                                    setFormData({ ...formData, employee_id: emp.id, departments: [] });
                                    setEmployeeSearch(`${emp.first_name} ${emp.last_name} - ${emp.employee_code}`);
                                    setShowEmployeeDropdown(false);
                                  }}
                                >
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium text-slate-900">
                                      {emp.first_name} {emp.last_name}
                                    </span>
                                    <span className="text-xs text-slate-500">{emp.employee_code}</span>
                                  </div>
                                  {formData.employee_id === emp.id && (
                                    <Check className="w-4 h-4 text-indigo-600" />
                                  )}
                                </button>
                              ))
                            ) : (
                              <div className="px-3 py-4 text-sm text-slate-500 text-center">
                                No se encontraron empleados
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
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
                            value={templateFormData[`${day}_start`] || ""}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, [`${day}_start`]: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-600">Salida</Label>
                          <Input
                            type="time"
                            value={templateFormData[`${day}_end`] || ""}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, [`${day}_end`]: e.target.value })}
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
                      value={templateFormData.break_duration_minutes}
                      onChange={(e) => setTemplateFormData({ ...templateFormData, break_duration_minutes: parseInt(e.target.value) })}
                    />
                  </div>

                  <div>
                    <Label>Tolerancia (minutos)</Label>
                    <Input
                      type="number"
                      value={templateFormData.tolerance_minutes}
                      onChange={(e) => setTemplateFormData({ ...templateFormData, tolerance_minutes: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <h3 className="font-semibold text-slate-900 mb-2">Configuración Especial</h3>

                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="template_exempt"
                      checked={templateFormData.exempt_from_clocking}
                      onChange={(e) => setTemplateFormData({ ...templateFormData, exempt_from_clocking: e.target.checked })}
                      className="w-4 h-4 rounded mt-1"
                    />
                    <div className="flex-1">
                      <label htmlFor="template_exempt" className="text-sm font-medium text-slate-900 cursor-pointer">
                        Exonerado de marcación
                      </label>
                      <p className="text-xs text-slate-600 mt-1">
                        El sistema generará automáticamente marcaciones según el horario configurado
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="template_overtime"
                      checked={templateFormData.overtime_authorized}
                      onChange={(e) => setTemplateFormData({ ...templateFormData, overtime_authorized: e.target.checked })}
                      className="w-4 h-4 rounded mt-1"
                    />
                    <div className="flex-1">
                      <label htmlFor="template_overtime" className="text-sm font-medium text-slate-900 cursor-pointer">
                        Autorizado a realizar horas extras
                      </label>
                      <p className="text-xs text-slate-600 mt-1">
                        Solo el personal autorizado tendrá contabilizadas sus horas extras
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="template_active"
                    checked={templateFormData.is_active}
                    onChange={(e) => setTemplateFormData({ ...templateFormData, is_active: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="template_active" className="text-sm">Plantilla activa</label>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button variant="outline" className="flex-1" onClick={resetTemplateForm}>
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={handleSubmitTemplate}
                    disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
                  >
                    {editingTemplate ? "Actualizar" : "Crear"} Plantilla
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Assignment Form Modal */}
      {showAssignForm && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto"
          onClick={resetAssignForm}
        >
          <Card
            className="max-w-2xl w-full my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b bg-indigo-50/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  {editingAssignment ? "Reasignar Horario" : "Asignar Horario a Empleado/Departamento"}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={resetAssignForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>ℹ️ Asignación:</strong> Selecciona un horario plantilla y asígnalo a empleados o departamentos
                </p>
              </div>

              {!editingAssignment && (
                <div>
                  <Label>Seleccionar Plantilla de Horario *</Label>
                  <div className="relative">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
                        className="flex-1 flex items-center justify-between px-3 py-2 border border-slate-200 rounded-md bg-white hover:bg-slate-50 text-left"
                      >
                        <span className={selectedTemplateId ? "text-slate-900" : "text-slate-500"}>
                          {selectedTemplateId && templateSearch ? templateSearch : "Seleccionar plantilla"}
                        </span>
                        <ChevronsUpDown className="w-4 h-4 text-slate-400" />
                      </button>
                      {selectedTemplateId && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            setSelectedTemplateId("");
                            setTemplateSearch("");
                          }}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    {showTemplateDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg">
                        <div className="p-2 border-b">
                          <Input
                            placeholder="Buscar plantilla..."
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                            autoFocus
                            className="h-8"
                          />
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                          {filteredTemplatesForAssignment.length > 0 ? (
                            filteredTemplatesForAssignment.map(template => (
                              <button
                                key={template.id}
                                type="button"
                                className={`w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between ${
                                  selectedTemplateId === template.id ? 'bg-indigo-50' : ''
                                }`}
                                onClick={() => {
                                  setSelectedTemplateId(template.id);
                                  setTemplateSearch(`${template.schedule_name} (${template.monday_start} - ${template.monday_end})`);
                                  setShowTemplateDropdown(false);
                                }}
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-slate-900">
                                    {template.schedule_name}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {template.monday_start} - {template.monday_end}
                                  </span>
                                </div>
                                {selectedTemplateId === template.id && (
                                  <Check className="w-4 h-4 text-indigo-600" />
                                )}
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-4 text-sm text-slate-500 text-center">
                              No se encontraron plantillas
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <Label>Asignar a Empleado Individual</Label>
                <div className="relative">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
                      className="flex-1 flex items-center justify-between px-3 py-2 border border-slate-200 rounded-md bg-white hover:bg-slate-50 text-left"
                    >
                      <span className={assignFormData.employee_id ? "text-slate-900" : "text-slate-500"}>
                        {assignFormData.employee_id && employeeSearch ? employeeSearch : "Seleccionar empleado"}
                      </span>
                      <ChevronsUpDown className="w-4 h-4 text-slate-400" />
                    </button>
                    {assignFormData.employee_id && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setAssignFormData({ ...assignFormData, employee_id: null });
                          setEmployeeSearch("");
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {showEmployeeDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg">
                      <div className="p-2 border-b">
                        <Input
                          placeholder="Buscar por nombre o código..."
                          value={employeeSearch}
                          onChange={(e) => setEmployeeSearch(e.target.value)}
                          autoFocus
                          className="h-8"
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                       <button
                         type="button"
                         className="w-full px-3 py-2 text-left hover:bg-slate-50 text-sm text-slate-600 border-b"
                         onClick={() => {
                           setAssignFormData({ ...assignFormData, employee_id: null });
                           setEmployeeSearch("");
                           setShowEmployeeDropdown(false);
                         }}
                       >
                         Ninguno
                       </button>
                       {filteredEmployeesWithoutSchedule.length > 0 ? (
                         filteredEmployeesWithoutSchedule.map(emp => (
                           <button
                             key={emp.id}
                             type="button"
                             className={`w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between ${
                               assignFormData.employee_id === emp.id ? 'bg-indigo-50' : ''
                             }`}
                             onClick={() => {
                               setAssignFormData({ ...assignFormData, employee_id: emp.id, departments: [] });
                               setEmployeeSearch(`${emp.first_name} ${emp.last_name} - ${emp.employee_code}`);
                               setShowEmployeeDropdown(false);
                             }}
                           >
                             <div className="flex flex-col">
                               <span className="text-sm font-medium text-slate-900">
                                 {emp.first_name} {emp.last_name}
                               </span>
                               <span className="text-xs text-slate-500">{emp.employee_code} • {emp.department_name || "Sin depto"}</span>
                             </div>
                             {assignFormData.employee_id === emp.id && (
                               <Check className="w-4 h-4 text-indigo-600" />
                             )}
                           </button>
                         ))
                       ) : (
                         <div className="px-3 py-4 text-sm text-slate-500 text-center">
                           {employeeSearch ? "No se encontraron empleados" : "Todos los empleados tienen horario asignado"}
                         </div>
                       )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>O asignar a Departamentos (múltiples)</Label>
                  {assignFormData.departments?.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAssignFormData({ ...assignFormData, departments: [] })}
                      className="text-red-600 hover:text-red-700 h-7 text-xs"
                    >
                      Limpiar
                    </Button>
                  )}
                </div>
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                  {departmentsWithoutSchedule.map(dept => (
                    <label key={dept} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={assignFormData.departments?.includes(dept)}
                        onChange={(e) => {
                          const newDepts = e.target.checked
                            ? [...(assignFormData.departments || []), dept]
                            : assignFormData.departments.filter(d => d !== dept);
                          setAssignFormData({ ...assignFormData, departments: newDepts, employee_id: null });
                        }}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm">{dept}</span>
                    </label>
                  ))}
                  {departmentsWithoutSchedule.length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-2">
                      Todos los departamentos ya tienen horario asignado
                    </p>
                  )}
                </div>
                {assignFormData.departments?.length > 0 && (
                  <p className="text-xs text-slate-600 mt-2">
                    {assignFormData.departments.length} departamento(s) seleccionado(s)
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <Button variant="outline" className="flex-1" onClick={resetAssignForm}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSubmitAssignment}
                  disabled={createAssignmentMutation.isPending || updateAssignmentMutation.isPending}
                >
                  {editingAssignment ? "Actualizar" : "Asignar"} Horario
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
