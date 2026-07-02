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
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Clock, Plus, Edit, Trash2, Users, User, Calendar, Search, ChevronsUpDown, Check, X, CalendarIcon, CalendarDays
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { usePermissions } from "../components/hooks/usePermissions";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";
import EmployeeScheduleCalendar from "../components/schedules/EmployeeScheduleCalendar";

export default function ScheduleManagement() {
  const { user: currentUser } = useAuth();
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [calendarEmployee, setCalendarEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSite, setFilterSite] = useState("all");
  const [filterActive, setFilterActive] = useState("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);

  const [templateFormData, setTemplateFormData] = useState({
    schedule_name: "",
    site: "",
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
    effective_from: new Date(),
    effective_to: null,
  });

  const {
    hasAnyPermission,
    getAccessibleSites,
    employee: permissionEmployee,
    loading: permissionsLoading,
  } = usePermissions();
  const effectiveEmployee = currentUser?.employee || permissionEmployee || null;
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
    queryKey: ["scheduleAccessibleEmployees", currentUser?.employee?.id],
    queryFn: async () => {
      const employees = await entitiesAPI.Employee.accessible([
        "schedules.view",
        "schedules.create",
        "schedules.edit",
        "schedules.assign",
        "schedules.delete",
      ]);
      return employees.filter(employee => employee.status === "Activo");
    },
  });

  const { data: allSites = [] } = useQuery({
    queryKey: ["allSites"],
    queryFn: async () => await entitiesAPI.Site.list(),
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
      return await entitiesAPI.WorkSchedule.create(data);
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
      return await entitiesAPI.WorkSchedule.update(id, data);
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
      site: "",
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
    setAssignFormData({ employee_id: null, departments: [], effective_from: new Date(), effective_to: null });
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
      effective_from: assignment.effective_from ? new Date(assignment.effective_from.split('T')[0] + "T00:00:00") : new Date(),
      effective_to: assignment.effective_to ? new Date(assignment.effective_to.split('T')[0] + "T00:00:00") : null,
    });

    // Buscar la plantilla que corresponde a esta asignación por nombre
    // Los horarios individuales tienen formato "{plantilla} - {nombre empleado}", se usa startsWith
    const currentTemplate = templates.find(t =>
      assignment.schedule_name === t.schedule_name ||
      assignment.schedule_name?.startsWith(t.schedule_name)
    );
    if (currentTemplate) {
      setSelectedTemplateId(currentTemplate.id);
      setTemplateSearch(`${currentTemplate.schedule_name} (${currentTemplate.monday_start} - ${currentTemplate.monday_end})`);
    } else {
      setSelectedTemplateId("");
      setTemplateSearch(assignment.schedule_name || "");
    }

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

    if (!assignFormData.effective_from) {
      toast.error("La fecha de inicio de vigencia es obligatoria");
      return;
    }

    const today = format(new Date(), "yyyy-MM-dd");
    const effectiveFromStr = format(assignFormData.effective_from, "yyyy-MM-dd");
    const effectiveToStr = assignFormData.effective_to
      ? format(assignFormData.effective_to, "yyyy-MM-dd")
      : null;
    // Si la fecha de fin ya pasó, el horario queda inactivo
    const isExpired = effectiveToStr !== null && effectiveToStr < today;

    if (editingAssignment) {
      if (selectedTemplateId) {
        const template = templates.find(t => t.id === selectedTemplateId);
        if (!template) { toast.error("Plantilla no encontrada"); return; }
        const updatedData = {
          ...template,
          employee_id: assignFormData.employee_id,
          departments: assignFormData.departments,
          effective_from: effectiveFromStr,
          effective_to: effectiveToStr,
          is_active: true,
        };
        delete updatedData.id;
        delete updatedData.created_date;
        delete updatedData.updated_date;
        delete updatedData.created_by;
        updateAssignmentMutation.mutate({ id: editingAssignment.id, data: updatedData });
      } else {
        updateAssignmentMutation.mutate({ id: editingAssignment.id, data: {
          employee_id: assignFormData.employee_id,
          departments: assignFormData.departments,
          effective_from: effectiveFromStr,
          effective_to: effectiveToStr,
          is_active: true,
        }});
      }
      if (isExpired) toast.info("Horario histórico registrado (período vencido).");
    } else {
      const template = templates.find(t => t.id === selectedTemplateId);
      if (!template) { toast.error("Plantilla no encontrada"); return; }
      const newAssignment = {
        ...template,
        employee_id: assignFormData.employee_id,
        departments: assignFormData.departments,
        effective_from: effectiveFromStr,
        effective_to: effectiveToStr,
        is_active: true,
      };
      delete newAssignment.id;
      delete newAssignment.created_date;
      delete newAssignment.updated_date;
      delete newAssignment.created_by;
      createAssignmentMutation.mutate(newAssignment);
      if (isExpired) toast.info("Horario histórico registrado (período vencido).");
    }
  };

  const resetTemplateForm = () => {
    setTemplateFormData({
      schedule_name: "",
      site: "",
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
    setAssignFormData({ employee_id: null, departments: [], effective_from: new Date(), effective_to: null });
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

  // Filtrar plantillas según sedes accesibles del usuario
  // getAccessibleSites() devuelve: undefined (cargando), null (todas), array (restringido)
  const accessibleSites = getAccessibleSites();

  // Comparación normalizada para evitar problemas de mayúsculas/espacios
  const normalizeSite = (site) => (site || "").trim().toLowerCase();

  const siteMatch = (templateSite, siteList) => {
    const normalized = normalizeSite(templateSite);
    if (!normalized) return true; // plantilla sin sede → siempre visible
    return siteList.some(s => normalizeSite(s) === normalized);
  };

  // null = acceso total, undefined = aún cargando (mostrar todo mientras carga)
  const siteFilteredTemplates = (accessibleSites === null || accessibleSites === undefined)
    ? templates
    : templates.filter(t => siteMatch(t.site, accessibleSites));

  const filteredTemplates = siteFilteredTemplates.filter(t => {
    if (!t.schedule_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterSite !== "all") {
      if (filterSite === "__none__" && normalizeSite(t.site)) return false;
      if (filterSite !== "__none__" && normalizeSite(t.site) !== normalizeSite(filterSite)) return false;
    }
    if (filterActive === "active" && t.is_active === false) return false;
    if (filterActive === "inactive" && t.is_active !== false) return false;
    return true;
  });

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

  // En modo edición mostrar todos los empleados; en creación solo los sin horario
  const employeePoolForAssign = editingAssignment ? allEmployees : employeesWithoutSchedule;
  const filteredEmployeesWithoutSchedule = employeePoolForAssign.filter(emp => {
    const searchLower = employeeSearch.toLowerCase();
    return emp.first_name.toLowerCase().includes(searchLower) ||
           emp.last_name.toLowerCase().includes(searchLower) ||
           emp.employee_code.toLowerCase().includes(searchLower);
  });

  // En el modal de asignación mostrar TODAS las plantillas accesibles por sede (sin filtro de estado)
  const allAccessibleTemplates = (accessibleSites === null || accessibleSites === undefined)
    ? templates
    : templates.filter(t => siteMatch(t.site, accessibleSites));

  const filteredTemplatesForAssignment = allAccessibleTemplates.filter(template => {
    const searchLower = templateSearch.toLowerCase();
    return template.schedule_name.toLowerCase().includes(searchLower) ||
           `${template.monday_start} - ${template.monday_end}`.includes(searchLower);
  });

  if (permissionsLoading || !effectiveEmployee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasAccess = hasAnyPermission([
    "schedules.view", "schedules.create", "schedules.edit", "schedules.assign", "schedules.delete", "system.admin"
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

        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Calendar className="w-5 h-5 text-green-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{templates.length}</span>
              <span className="text-sm text-slate-600">Plantillas</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Clock className="w-5 h-5 text-indigo-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{assignments.length}</span>
              <span className="text-sm text-slate-600">Asignaciones</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <User className="w-5 h-5 text-blue-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{individualAssignments.length}</span>
              <span className="text-sm text-slate-600">Individuales</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Users className="w-5 h-5 text-purple-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{departmentAssignments.length}</span>
              <span className="text-sm text-slate-600">Departamentos</span>
            </div>
          </div>
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

              {hasAnyPermission(["schedules.create", "schedules.assign", "system.admin"]) && (
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
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <Input
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={filterSite} onValueChange={setFilterSite}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filtrar por sede" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las sedes</SelectItem>
                    <SelectItem value="__none__">Sin sede</SelectItem>
                    {(accessibleSites === null || accessibleSites === undefined ? allSites : allSites.filter(s => siteMatch(s.name, accessibleSites)))
                      .filter(s => s.is_active !== false)
                      .map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterActive} onValueChange={setFilterActive}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="active">Solo activas</SelectItem>
                    <SelectItem value="inactive">Solo inactivas</SelectItem>
                  </SelectContent>
                </Select>
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
                              {template.site && (
                                <Badge className="bg-indigo-100 text-indigo-700">{template.site}</Badge>
                              )}
                              {!template.is_active && (
                                <Badge className="bg-red-100 text-red-700">Inactiva</Badge>
                              )}
                              {["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].some(d =>
                                template[`${d}_start`] && template[`${d}_end`] && template[`${d}_start`] > template[`${d}_end`]
                              ) && (
                                <Badge className="bg-purple-100 text-purple-700">🌙 Nocturno</Badge>
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
                            {hasAnyPermission(["schedules.edit", "schedules.assign", "system.admin"]) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditTemplate(template)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            {hasAnyPermission(["schedules.delete", "system.admin"]) && (
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
                      {(() => {
                        const todayStr = format(new Date(), "yyyy-MM-dd");
                        return filteredIndividual.map(schedule => {
                          const from = schedule.effective_from || "0000-01-01";
                          const to = schedule.effective_to || "9999-12-31";
                          const isVigente = from <= todayStr && to >= todayStr && schedule.is_active !== false;
                          const isVencido = to < todayStr;
                          return (
                      <div key={schedule.id} className={`p-4 border rounded-lg hover:shadow-md transition-all ${isVigente ? "border-green-300 bg-green-50/30" : isVencido ? "border-slate-200 bg-slate-50/50 opacity-70" : "border-slate-200"}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <h4 className="font-bold text-slate-900 text-lg">
                                {getEmployeeName(schedule.employee_id)}
                              </h4>
                              {isVigente && <Badge className="bg-green-100 text-green-700 border border-green-300">✓ Vigente hoy</Badge>}
                              {isVencido && <Badge className="bg-slate-200 text-slate-600">Vencido</Badge>}
                              {!schedule.is_active && !isVencido && (
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
                             <div className="flex gap-4 text-slate-500 text-xs mt-1">
                               {schedule.effective_from && <span><strong>Desde:</strong> {schedule.effective_from}</span>}
                               {schedule.effective_to
                                 ? <span><strong>Hasta:</strong> {schedule.effective_to}</span>
                                 : <span className="text-green-600"><strong>Hasta:</strong> sin límite</span>}
                             </div>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-3 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                              onClick={() => setCalendarEmployee(allEmployees.find(e => String(e.id) === String(schedule.employee_id)) || { id: schedule.employee_id, first_name: getEmployeeName(schedule.employee_id), last_name: "", employee_code: "", department_name: "" })}
                              title="Ver calendario de horarios"
                            >
                              <CalendarDays className="w-4 h-4" />
                            </Button>
                            {hasAnyPermission(["schedules.edit", "schedules.assign", "schedules.manage", "system.admin"]) && (
                              <Button size="sm" variant="outline" onClick={() => handleEditAssignment(schedule)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            {effectiveEmployee?.role === "super_admin" && (
                              <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDeleteSchedule(schedule)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                          );
                        });
                      })()}
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
                              {hasAnyPermission(["schedules.edit", "schedules.assign", "system.admin"]) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditAssignment(schedule)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              )}
                              {hasAnyPermission(["schedules.delete", "system.admin"]) && (
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
                              {hasAnyPermission(["schedules.create", "schedules.assign", "system.admin"]) && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setAssignFormData({
                                   employee_id: emp.id,
                                   departments: [],
                                   effective_from: new Date(),
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

      {/* Employee Schedule Calendar Modal */}
      {calendarEmployee && (
        <EmployeeScheduleCalendar
          employee={calendarEmployee}
          schedules={individualAssignments.filter(s => String(s.employee_id) === String(calendarEmployee.id))}
          templates={templates}
          onAssign={(day) => {
            setCalendarEmployee(null);
            setAssignFormData({
              employee_id: calendarEmployee.id,
              departments: [],
              effective_from: day || new Date(),
              effective_to: null,
            });
            setEmployeeSearch(`${calendarEmployee.first_name} ${calendarEmployee.last_name} - ${calendarEmployee.employee_code}`);
            setEditingAssignment(null);
            setSelectedTemplateId("");
            setTemplateSearch("");
            setShowAssignForm(true);
          }}
          onEdit={(schedule) => {
            setCalendarEmployee(null);
            handleEditAssignment(schedule);
          }}
          onClose={() => setCalendarEmployee(null)}
        />
      )}

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

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nombre de la Plantilla *</Label>
                    <Input
                      value={templateFormData.schedule_name}
                      onChange={(e) => setTemplateFormData({ ...templateFormData, schedule_name: e.target.value })}
                      placeholder="Ej: Horario Administrativo, Horario Operativo, etc."
                    />
                  </div>
                  <div>
                    <Label>Sede</Label>
                    <Select
                      value={templateFormData.site || ""}
                      onValueChange={(v) => setTemplateFormData({ ...templateFormData, site: v === "__none__" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar sede..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin sede específica</SelectItem>
                        {allSites.filter(s => s.is_active !== false).map(s => (
                          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                        <span className={assignFormData.employee_id ? "text-slate-900" : "text-slate-500"}>
                          {assignFormData.employee_id && employeeSearch ? employeeSearch : "Seleccionar empleado"}
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
                                    <span className="text-xs text-slate-500">{emp.employee_code}</span>
                                  </div>
                                  {assignFormData.employee_id === emp.id && (
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
                    </div>
                    {assignFormData.departments?.length > 0 && (
                      <p className="text-xs text-slate-600 mt-2">
                        {assignFormData.departments.length} departamento(s) seleccionado(s)
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

                  {["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].some(d =>
                    templateFormData[`${d}_start`] && templateFormData[`${d}_end`] &&
                    templateFormData[`${d}_start`] > templateFormData[`${d}_end`]
                  ) && (
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <p className="text-sm text-purple-800">
                        <strong>🌙 Turno nocturno detectado:</strong> La hora de salida es menor que la de entrada, indicando un turno que cruza la medianoche. El sistema calculará las horas trabajadas correctamente.
                      </p>
                    </div>
                  )}
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
                          No se encontraron empleados
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
                  {(editingAssignment ? departments : departmentsWithoutSchedule).map(dept => (
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
                  {(editingAssignment ? departments : departmentsWithoutSchedule).length === 0 && (
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

              {/* Vigente desde */}
              <div>
                <Label className="font-semibold text-slate-800 mb-2 block">
                  Vigente desde <span className="text-red-500">*</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start bg-green-50 border-green-200 hover:bg-green-100">
                      <CalendarIcon className="mr-2 h-4 w-4 text-green-700" />
                      <span className="text-green-700">
                        {assignFormData.effective_from
                          ? format(assignFormData.effective_from, "dd 'de' MMMM yyyy", { locale: es })
                          : "Seleccionar fecha..."}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarPicker
                      mode="single"
                      selected={assignFormData.effective_from}
                      onSelect={d => d && setAssignFormData({ ...assignFormData, effective_from: d })}
                      locale={es}
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-slate-500 mt-1">
                  El horario aplicará a partir de esta fecha. Campo obligatorio.
                </p>
              </div>

              {/* Vigente hasta (opcional) */}
              <div>
                <Label className="font-semibold text-slate-800 mb-2 block">
                  Vigente hasta <span className="font-normal text-slate-400">(opcional — dejar vacío = sin fecha de fin)</span>
                </Label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="flex-1 justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                        <span className={assignFormData.effective_to ? "text-slate-800" : "text-slate-400"}>
                          {assignFormData.effective_to
                            ? format(assignFormData.effective_to, "dd 'de' MMMM yyyy", { locale: es })
                            : "Sin fecha de fin"}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarPicker
                        mode="single"
                        selected={assignFormData.effective_to}
                        onSelect={d => setAssignFormData({ ...assignFormData, effective_to: d || null })}
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>
                  {assignFormData.effective_to && (
                    <Button variant="outline" size="icon" onClick={() => setAssignFormData({ ...assignFormData, effective_to: null })}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {assignFormData.effective_to && format(assignFormData.effective_to, "yyyy-MM-dd") < format(new Date(), "yyyy-MM-dd") && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ La fecha de fin ya pasó. El horario se registrará como histórico (vencido) y será visible en el calendario.</p>
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
