import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Users, Building, UserCheck } from "lucide-react";
import { toast } from "sonner";

export default function ScheduleAssignmentManager({ templates }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    template_id: "",
    assignment_type: "Individual",
    employee_id: "",
    department_name: "",
    group_name: "",
    valid_from: new Date().toISOString().split("T")[0],
    valid_until: "",
    rotation_start_date: "",
    is_active: true,
    notes: ""
  });

  const queryClient = useQueryClient();

  const { data: assignments = [] } = useQuery({
    queryKey: ["scheduleAssignments"],
    queryFn: async () => {
      return await base44.entities.ScheduleAssignment.list("-created_date");
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      return await base44.entities.Employee.filter({ status: "Activo" });
    },
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async (data) => {
      if (data.assignment_type === "Individual") {
        return await base44.entities.ScheduleAssignment.create(data);
      } else if (data.assignment_type === "Departamento") {
        // Asignar a todos los empleados del departamento
        const deptEmployees = employees.filter(e => e.department_name === data.department_name);
        const promises = deptEmployees.map(emp =>
          base44.entities.ScheduleAssignment.create({
            ...data,
            assignment_type: "Individual",
            employee_id: emp.id
          })
        );
        return await Promise.all(promises);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["scheduleAssignments"]);
      toast.success("Asignación creada correctamente");
      resetForm();
    },
    onError: () => {
      toast.error("Error al crear la asignación");
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.ScheduleAssignment.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["scheduleAssignments"]);
      toast.success("Asignación eliminada");
    },
  });

  const handleSubmit = () => {
    if (!formData.template_id || !formData.valid_from) {
      toast.error("Complete los campos obligatorios");
      return;
    }

    if (formData.assignment_type === "Individual" && !formData.employee_id) {
      toast.error("Seleccione un empleado");
      return;
    }

    if (formData.assignment_type === "Departamento" && !formData.department_name) {
      toast.error("Seleccione un departamento");
      return;
    }

    createAssignmentMutation.mutate(formData);
  };

  const resetForm = () => {
    setFormData({
      template_id: "",
      assignment_type: "Individual",
      employee_id: "",
      department_name: "",
      group_name: "",
      valid_from: new Date().toISOString().split("T")[0],
      valid_until: "",
      rotation_start_date: "",
      is_active: true,
      notes: ""
    });
    setShowForm(false);
  };

  const departments = [...new Set(employees.map(e => e.department_name))].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-5 h-5 mr-2" />
          Nueva Asignación
        </Button>
      </div>

      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="space-y-3">
            {assignments.map(assignment => {
              const template = templates.find(t => t.id === assignment.template_id);
              const employee = employees.find(e => e.id === assignment.employee_id);
              
              return (
                <div key={assignment.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        {assignment.assignment_type === "Individual" ? (
                          <UserCheck className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Building className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-slate-900">
                            {assignment.assignment_type === "Individual" && employee
                              ? `${employee.first_name} ${employee.last_name}`
                              : assignment.department_name || assignment.group_name}
                          </h4>
                          <Badge variant="outline">{assignment.assignment_type}</Badge>
                        </div>
                        <p className="text-sm text-slate-600">
                          {template?.template_name} ({template?.schedule_type})
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Desde: {assignment.valid_from} {assignment.valid_until && `• Hasta: ${assignment.valid_until}`}
                        </p>
                      </div>
                      <Badge className={assignment.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                        {assignment.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600"
                        onClick={() => {
                          if (confirm("¿Eliminar esta asignación?")) {
                            deleteAssignmentMutation.mutate(assignment.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={resetForm}>
          <Card className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle>Nueva Asignación de Horario</CardTitle>
                <Button variant="ghost" size="icon" onClick={resetForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Template de Horario *</Label>
                  <Select value={formData.template_id} onValueChange={(v) => setFormData({...formData, template_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar template" /></SelectTrigger>
                    <SelectContent>
                      {templates.filter(t => t.is_active).map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.template_name} ({t.schedule_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de Asignación *</Label>
                  <Select value={formData.assignment_type} onValueChange={(v) => setFormData({...formData, assignment_type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Individual">Individual</SelectItem>
                      <SelectItem value="Departamento">Departamento</SelectItem>
                      <SelectItem value="Grupo">Grupo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.assignment_type === "Individual" && (
                <div>
                  <Label>Empleado *</Label>
                  <Select value={formData.employee_id} onValueChange={(v) => setFormData({...formData, employee_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar empleado" /></SelectTrigger>
                    <SelectContent>
                      {employees.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.first_name} {emp.last_name} - {emp.employee_code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {formData.assignment_type === "Departamento" && (
                <div>
                  <Label>Departamento *</Label>
                  <Select value={formData.department_name} onValueChange={(v) => setFormData({...formData, department_name: v})}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar departamento" /></SelectTrigger>
                    <SelectContent>
                      {departments.map(dept => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">
                    Se asignará a todos los empleados del departamento
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Válido Desde *</Label>
                  <Input
                    type="date"
                    value={formData.valid_from}
                    onChange={(e) => setFormData({...formData, valid_from: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Válido Hasta</Label>
                  <Input
                    type="date"
                    value={formData.valid_until}
                    onChange={(e) => setFormData({...formData, valid_until: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <Label>Notas</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={2}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                  className="w-4 h-4 rounded"
                />
                <Label>Asignación Activa</Label>
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={resetForm}>Cancelar</Button>
                <Button onClick={handleSubmit} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  {createAssignmentMutation.isPending ? "Guardando..." : "Guardar Asignación"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}