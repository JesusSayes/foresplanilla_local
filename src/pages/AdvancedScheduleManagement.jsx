import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Clock, Plus, Trash2, Edit2, Users, Calendar as CalendarIcon,
  RefreshCw, Copy, CheckCircle
} from "lucide-react";
import { toast } from "sonner";
import ScheduleCalendarView from "../components/schedule/ScheduleCalendarView";
import WeeklyScheduleEditor from "../components/schedule/WeeklyScheduleEditor";
import ScheduleAssignmentManager from "../components/schedule/ScheduleAssignmentManager";

export default function AdvancedScheduleManagement() {
  const [employee, setEmployee] = useState(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [activeTab, setActiveTab] = useState("templates");
  
  const [templateFormData, setTemplateFormData] = useState({
    template_name: "",
    schedule_type: "Fijo",
    description: "",
    weekly_schedule: {
      monday: { start: "09:00", end: "18:00", enabled: true },
      tuesday: { start: "09:00", end: "18:00", enabled: true },
      wednesday: { start: "09:00", end: "18:00", enabled: true },
      thursday: { start: "09:00", end: "18:00", enabled: true },
      friday: { start: "09:00", end: "18:00", enabled: true },
      saturday: { start: "", end: "", enabled: false },
      sunday: { start: "", end: "", enabled: false }
    },
    rotation_pattern: [],
    flexible_rules: {
      core_hours_start: "10:00",
      core_hours_end: "16:00",
      earliest_start: "07:00",
      latest_end: "22:00"
    },
    min_hours_per_day: 8,
    max_hours_per_day: 10,
    min_hours_per_week: 40,
    max_hours_per_week: 48,
    break_duration_minutes: 60,
    tolerance_minutes_in: 10,
    tolerance_minutes_out: 10,
    overtime_after_minutes: 60,
    is_active: true
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadEmployee = async () => {
      try {
        const user = await base44.auth.me();
        const employees = await base44.entities.Employee.filter({ 
          work_email: user.email 
        });
        
        if (employees && employees.length > 0) {
          setEmployee(employees[0]);
        }
      } catch (error) {
        console.error("Error loading employee:", error);
      }
    };

    loadEmployee();
  }, []);

  const { data: templates = [] } = useQuery({
    queryKey: ["scheduleTemplates"],
    queryFn: async () => {
      return await base44.entities.WorkScheduleTemplate.list("-created_date");
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["scheduleAssignments"],
    queryFn: async () => {
      return await base44.entities.ScheduleAssignment.list("-created_date");
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data) => {
      if (editingTemplate) {
        return await base44.entities.WorkScheduleTemplate.update(editingTemplate.id, data);
      }
      return await base44.entities.WorkScheduleTemplate.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["scheduleTemplates"]);
      toast.success(editingTemplate ? "Template actualizado" : "Template creado correctamente");
      resetTemplateForm();
    },
    onError: () => {
      toast.error("Error al guardar el template");
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.WorkScheduleTemplate.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["scheduleTemplates"]);
      toast.success("Template eliminado");
    },
  });

  const duplicateTemplateMutation = useMutation({
    mutationFn: async (template) => {
      const newTemplate = {
        ...template,
        template_name: `${template.template_name} (Copia)`,
        id: undefined,
        created_date: undefined,
        updated_date: undefined
      };
      return await base44.entities.WorkScheduleTemplate.create(newTemplate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["scheduleTemplates"]);
      toast.success("Template duplicado correctamente");
    },
  });

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setTemplateFormData({
      template_name: template.template_name,
      schedule_type: template.schedule_type,
      description: template.description || "",
      weekly_schedule: template.weekly_schedule || templateFormData.weekly_schedule,
      rotation_pattern: template.rotation_pattern || [],
      flexible_rules: template.flexible_rules || templateFormData.flexible_rules,
      min_hours_per_day: template.min_hours_per_day || 8,
      max_hours_per_day: template.max_hours_per_day || 10,
      min_hours_per_week: template.min_hours_per_week || 40,
      max_hours_per_week: template.max_hours_per_week || 48,
      break_duration_minutes: template.break_duration_minutes || 60,
      tolerance_minutes_in: template.tolerance_minutes_in || 10,
      tolerance_minutes_out: template.tolerance_minutes_out || 10,
      overtime_after_minutes: template.overtime_after_minutes || 60,
      is_active: template.is_active
    });
    setShowTemplateForm(true);
  };

  const handleSubmitTemplate = () => {
    if (!templateFormData.template_name) {
      toast.error("El nombre del template es obligatorio");
      return;
    }
    createTemplateMutation.mutate(templateFormData);
  };

  const resetTemplateForm = () => {
    setTemplateFormData({
      template_name: "",
      schedule_type: "Fijo",
      description: "",
      weekly_schedule: {
        monday: { start: "09:00", end: "18:00", enabled: true },
        tuesday: { start: "09:00", end: "18:00", enabled: true },
        wednesday: { start: "09:00", end: "18:00", enabled: true },
        thursday: { start: "09:00", end: "18:00", enabled: true },
        friday: { start: "09:00", end: "18:00", enabled: true },
        saturday: { start: "", end: "", enabled: false },
        sunday: { start: "", end: "", enabled: false }
      },
      rotation_pattern: [],
      flexible_rules: {
        core_hours_start: "10:00",
        core_hours_end: "16:00",
        earliest_start: "07:00",
        latest_end: "22:00"
      },
      min_hours_per_day: 8,
      max_hours_per_day: 10,
      min_hours_per_week: 40,
      max_hours_per_week: 48,
      break_duration_minutes: 60,
      tolerance_minutes_in: 10,
      tolerance_minutes_out: 10,
      overtime_after_minutes: 60,
      is_active: true
    });
    setEditingTemplate(null);
    setShowTemplateForm(false);
  };

  if (!employee || employee.role !== "admin") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">Solo administradores pueden gestionar horarios</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = {
    templates: templates.length,
    activeTemplates: templates.filter(t => t.is_active).length,
    assignments: assignments.length,
    activeAssignments: assignments.filter(a => a.is_active).length
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Gestión Avanzada de Horarios
          </h1>
          <p className="text-slate-600 text-lg">
            Define templates de horarios y asigna a empleados o departamentos
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <Clock className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.templates}</div>
              <p className="text-slate-600 text-sm">Templates Totales</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.activeTemplates}</div>
              <p className="text-slate-600 text-sm">Templates Activos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.assignments}</div>
              <p className="text-slate-600 text-sm">Asignaciones Totales</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-purple-100 rounded-xl">
                  <CalendarIcon className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.activeAssignments}</div>
              <p className="text-slate-600 text-sm">Asignaciones Activas</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="templates">Templates de Horario</TabsTrigger>
            <TabsTrigger value="assignments">Asignaciones</TabsTrigger>
            <TabsTrigger value="calendar">Calendario</TabsTrigger>
          </TabsList>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-6">
            <div className="flex justify-end mb-4">
              <Button onClick={() => setShowTemplateForm(true)} className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-5 h-5 mr-2" />
                Nuevo Template
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {templates.map(template => (
                <Card key={template.id} className="border-0 shadow-lg hover:shadow-xl transition-all">
                  <CardHeader className="border-b bg-gradient-to-r from-indigo-50 to-purple-50">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{template.template_name}</CardTitle>
                        <p className="text-xs text-slate-600 mt-1">{template.schedule_type}</p>
                      </div>
                      <Badge className={template.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                        {template.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-2 text-sm">
                      {template.description && <p className="text-slate-600">{template.description}</p>}
                      <div className="flex gap-4 mt-3">
                        <div>
                          <p className="text-xs text-slate-500">Horas/día</p>
                          <p className="font-semibold">{template.min_hours_per_day}h - {template.max_hours_per_day}h</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Tolerancia</p>
                          <p className="font-semibold">±{template.tolerance_minutes_in}min</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Descanso</p>
                          <p className="font-semibold">{template.break_duration_minutes}min</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4 pt-4 border-t">
                      <Button size="sm" variant="outline" onClick={() => handleEditTemplate(template)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => duplicateTemplateMutation.mutate(template)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600"
                        onClick={() => {
                          if (confirm("¿Eliminar este template?")) {
                            deleteTemplateMutation.mutate(template.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Assignments Tab */}
          <TabsContent value="assignments" className="space-y-6">
            <ScheduleAssignmentManager templates={templates} />
          </TabsContent>

          {/* Calendar Tab */}
          <TabsContent value="calendar" className="space-y-6">
            <ScheduleCalendarView />
          </TabsContent>
        </Tabs>
      </div>

      {/* Template Form Modal */}
      {showTemplateForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto" onClick={resetTemplateForm}>
          <Card className="max-w-4xl w-full my-8" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle>{editingTemplate ? "Editar Template" : "Nuevo Template de Horario"}</CardTitle>
                <Button variant="ghost" size="icon" onClick={resetTemplateForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-900">Información Básica</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nombre del Template *</Label>
                    <Input
                      value={templateFormData.template_name}
                      onChange={(e) => setTemplateFormData({...templateFormData, template_name: e.target.value})}
                      placeholder="Horario Administrativo"
                    />
                  </div>
                  <div>
                    <Label>Tipo de Horario *</Label>
                    <Select value={templateFormData.schedule_type} onValueChange={(v) => setTemplateFormData({...templateFormData, schedule_type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Fijo">Fijo</SelectItem>
                        <SelectItem value="Rotativo">Rotativo</SelectItem>
                        <SelectItem value="Flexible">Flexible</SelectItem>
                        <SelectItem value="Por Turnos">Por Turnos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Descripción</Label>
                  <Textarea
                    value={templateFormData.description}
                    onChange={(e) => setTemplateFormData({...templateFormData, description: e.target.value})}
                    rows={2}
                    placeholder="Horario estándar de oficina..."
                  />
                </div>
              </div>

              {/* Weekly Schedule */}
              {templateFormData.schedule_type === "Fijo" && (
                <div className="pt-4 border-t">
                  <h3 className="font-semibold text-slate-900 mb-3">Horario Semanal</h3>
                  <WeeklyScheduleEditor
                    schedule={templateFormData.weekly_schedule}
                    onChange={(schedule) => setTemplateFormData({...templateFormData, weekly_schedule: schedule})}
                  />
                </div>
              )}

              {/* Flexible Rules */}
              {templateFormData.schedule_type === "Flexible" && (
                <div className="pt-4 border-t">
                  <h3 className="font-semibold text-slate-900 mb-3">Reglas de Horario Flexible</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Horario Nuclear Inicio</Label>
                      <Input
                        type="time"
                        value={templateFormData.flexible_rules.core_hours_start}
                        onChange={(e) => setTemplateFormData({
                          ...templateFormData,
                          flexible_rules: {...templateFormData.flexible_rules, core_hours_start: e.target.value}
                        })}
                      />
                    </div>
                    <div>
                      <Label>Horario Nuclear Fin</Label>
                      <Input
                        type="time"
                        value={templateFormData.flexible_rules.core_hours_end}
                        onChange={(e) => setTemplateFormData({
                          ...templateFormData,
                          flexible_rules: {...templateFormData.flexible_rules, core_hours_end: e.target.value}
                        })}
                      />
                    </div>
                    <div>
                      <Label>Entrada Más Temprana</Label>
                      <Input
                        type="time"
                        value={templateFormData.flexible_rules.earliest_start}
                        onChange={(e) => setTemplateFormData({
                          ...templateFormData,
                          flexible_rules: {...templateFormData.flexible_rules, earliest_start: e.target.value}
                        })}
                      />
                    </div>
                    <div>
                      <Label>Salida Más Tarde</Label>
                      <Input
                        type="time"
                        value={templateFormData.flexible_rules.latest_end}
                        onChange={(e) => setTemplateFormData({
                          ...templateFormData,
                          flexible_rules: {...templateFormData.flexible_rules, latest_end: e.target.value}
                        })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Rules */}
              <div className="pt-4 border-t space-y-4">
                <h3 className="font-semibold text-slate-900">Reglas y Límites</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <Label>Min Horas/Día</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={templateFormData.min_hours_per_day}
                      onChange={(e) => setTemplateFormData({...templateFormData, min_hours_per_day: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Max Horas/Día</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={templateFormData.max_hours_per_day}
                      onChange={(e) => setTemplateFormData({...templateFormData, max_hours_per_day: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Min Horas/Semana</Label>
                    <Input
                      type="number"
                      value={templateFormData.min_hours_per_week}
                      onChange={(e) => setTemplateFormData({...templateFormData, min_hours_per_week: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Max Horas/Semana</Label>
                    <Input
                      type="number"
                      value={templateFormData.max_hours_per_week}
                      onChange={(e) => setTemplateFormData({...templateFormData, max_hours_per_week: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <Label>Descanso (min)</Label>
                    <Input
                      type="number"
                      value={templateFormData.break_duration_minutes}
                      onChange={(e) => setTemplateFormData({...templateFormData, break_duration_minutes: parseInt(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Tolerancia Entrada (min)</Label>
                    <Input
                      type="number"
                      value={templateFormData.tolerance_minutes_in}
                      onChange={(e) => setTemplateFormData({...templateFormData, tolerance_minutes_in: parseInt(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Tolerancia Salida (min)</Label>
                    <Input
                      type="number"
                      value={templateFormData.tolerance_minutes_out}
                      onChange={(e) => setTemplateFormData({...templateFormData, tolerance_minutes_out: parseInt(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>H.Extra después de (min)</Label>
                    <Input
                      type="number"
                      value={templateFormData.overtime_after_minutes}
                      onChange={(e) => setTemplateFormData({...templateFormData, overtime_after_minutes: parseInt(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={templateFormData.is_active}
                    onChange={(e) => setTemplateFormData({...templateFormData, is_active: e.target.checked})}
                    className="w-4 h-4 rounded"
                  />
                  <Label>Template Activo</Label>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={resetTemplateForm}>Cancelar</Button>
                <Button onClick={handleSubmitTemplate} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                  {createTemplateMutation.isPending ? "Guardando..." : "Guardar Template"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}