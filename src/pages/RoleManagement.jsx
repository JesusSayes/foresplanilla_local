import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield, Plus, Edit, Trash2, Users, CheckSquare,
  Search, UserPlus, X
} from "lucide-react";
import { toast } from "sonner";
import { AVAILABLE_PERMISSIONS } from "../components/hooks/usePermissions";
import PermissionGuard from "../components/PermissionGuard";
import PermissionMatrix from "../components/roles/PermissionMatrix";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";

export default function RoleManagement() {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleFormData, setRoleFormData] = useState({
    name: "",
    description: "",
    permissions: [],
    department_restricted: false,
  });
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

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

  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      return await entitiesAPI.Role.list("-created_date");
    },
  });

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      return await entitiesAPI.Employee.filter({ status: "Activo" });
    },
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ["userRoles"],
    queryFn: async () => {
      return await entitiesAPI.UserRole.list("-created_date");
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: async (data) => {
      return await entitiesAPI.Role.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["roles"]);
      toast.success("Rol creado correctamente");
      resetRoleForm();
    },
    onError: () => {
      toast.error("Error al crear el rol");
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await entitiesAPI.Role.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["roles"]);
      toast.success("Rol actualizado correctamente");
      resetRoleForm();
    },
    onError: () => {
      toast.error("Error al actualizar el rol");
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id) => {
      return await entitiesAPI.Role.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["roles"]);
      toast.success("Rol eliminado correctamente");
    },
    onError: () => {
      toast.error("Error al eliminar el rol");
    },
  });

  const assignRolesMutation = useMutation({
    mutationFn: async ({ employeeId, roleIds }) => {
      // Eliminar asignaciones existentes
      const existing = userRoles.filter(ur => ur.employee_id === employeeId);
      await Promise.all(existing.map(ur => entitiesAPI.UserRole.delete(ur.id)));

      // Crear nuevas asignaciones
      const assignments = roleIds.map(roleId => ({
        employee_id: employeeId,
        role_id: roleId,
        assigned_by: employee.work_email,
        assigned_date: new Date().toISOString().split('T')[0],
      }));

      await Promise.all(assignments.map(a => entitiesAPI.UserRole.create(a)));

      // Actualizar el campo role en Employee para mantener compatibilidad
      const emp = allEmployees.find(e => e.id === employeeId);
      if (emp && roleIds.length > 0) {
        const primaryRole = roles.find(r => r.id === roleIds[0]);
        if (primaryRole) {
          // Mapear el nombre del rol al campo legacy 'role'
          let legacyRole = "empleado";
          if (primaryRole.name.toLowerCase().includes("admin") || primaryRole.name.toLowerCase().includes("administrador")) {
            legacyRole = "admin";
          } else if (primaryRole.name.toLowerCase().includes("manager") || primaryRole.name.toLowerCase().includes("gerente")) {
            legacyRole = "manager";
          }
          await entitiesAPI.Employee.update(employeeId, { role: legacyRole });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["userRoles"]);
      queryClient.invalidateQueries(["allEmployees"]);
      toast.success("Roles asignados correctamente");
      setShowAssignModal(false);
      setSelectedEmployee(null);
      setSelectedRoles([]);
    },
    onError: () => {
      toast.error("Error al asignar roles");
    },
  });

  const handleSubmitRole = () => {
    if (!roleFormData.name) {
      toast.error("El nombre del rol es requerido");
      return;
    }

    if (editingRole) {
      updateRoleMutation.mutate({ id: editingRole.id, data: roleFormData });
    } else {
      createRoleMutation.mutate(roleFormData);
    }
  };

  const handleEditRole = (role) => {
    setEditingRole(role);
    setRoleFormData({
      name: role.name,
      description: role.description || "",
      permissions: role.permissions || [],
      department_restricted: role.department_restricted || false,
    });
    setShowRoleForm(true);
  };

  const handleDeleteRole = (role) => {
    if (role.is_system_role) {
      toast.error("No se pueden eliminar roles del sistema");
      return;
    }
    if (confirm(`¿Eliminar el rol "${role.name}"?`)) {
      deleteRoleMutation.mutate(role.id);
    }
  };

  const resetRoleForm = () => {
    setRoleFormData({
      name: "",
      description: "",
      permissions: [],
      department_restricted: false,
    });
    setEditingRole(null);
    setShowRoleForm(false);
  };

  const handlePermissionsChange = (newPermissions) => {
    setRoleFormData({ ...roleFormData, permissions: newPermissions });
  };

  const handleAssignRoles = (emp) => {
    const empRoles = userRoles
      .filter(ur => ur.employee_id === emp.id)
      .map(ur => ur.role_id);
    setSelectedEmployee(emp);
    setSelectedRoles(empRoles);
    setShowAssignModal(true);
  };

  const toggleRoleSelection = (roleId) => {
    setSelectedRoles(prev =>
      prev.includes(roleId)
        ? prev.filter(id => id !== roleId)
        : [...prev, roleId]
    );
  };

  const getEmployeeRoles = (empId) => {
    const empRoleIds = userRoles
      .filter(ur => ur.employee_id === empId)
      .map(ur => ur.role_id);
    return roles.filter(r => empRoleIds.includes(r.id));
  };

  const filteredEmployees = allEmployees.filter(emp =>
    emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const permissionCategories = {
    "Empleados": [
      "employees.view", "employees.edit", "employees.create", "employees.delete",
      "employees.import", "employees.export", "employees.change_status"
    ],
    "Asistencia": [
      "attendance.view_own", "attendance.view_all", "attendance.view_department",
      "attendance.edit", "attendance.approve_incidents", "attendance.manage", "attendance.export"
    ],
    "Vacaciones": [
      "vacations.view_own", "vacations.view_all", "vacations.view_department",
      "vacations.approve", "vacations.manage", "vacations.calendar"
    ],
    "Nómina": [
      "payroll.view_own", "payroll.view_all", "payroll.edit", "payroll.create",
      "payroll.delete", "payroll.calculate", "payroll.approve"
    ],
    "Certificados": [
      "certificates.view_own", "certificates.view_all", "certificates.approve",
      "certificates.create", "certificates.request"
    ],
    "Horarios": [
      "schedules.view", "schedules.edit", "schedules.create", "schedules.delete", "schedules.assign"
    ],
    "Feriados": [
      "holidays.view", "holidays.manage", "holidays.create", "holidays.edit", "holidays.delete"
    ],
    "Sedes": [
      "sites.view", "sites.create", "sites.edit", "sites.delete", "sites.manage"
    ],
    "Departamentos": [
      "departments.view", "departments.create", "departments.edit", "departments.delete", "departments.manage"
    ],
    "Cargos/Posiciones": [
      "positions.view", "positions.create", "positions.edit", "positions.delete", "positions.manage"
    ],
    "Bancos": [
      "banks.view", "banks.create", "banks.edit", "banks.delete"
    ],
    "Reportes": [
      "reports.view", "reports.export", "reports.attendance", "reports.payroll",
      "reports.vacations", "reports.employees"
    ],
    "Centros de Costo": [
      "cost_centers.view", "cost_centers.create", "cost_centers.edit", "cost_centers.delete",
      "cost_centers.assign", "cost_centers.view_amounts"
    ],
    "Planillas": [
      "payroll.view_own", "payroll.view_all", "payroll.view_department", "payroll.view_amounts",
      "payroll.edit", "payroll.create", "payroll.delete", "payroll.calculate", "payroll.approve"
    ],
    "Contratos": [
      "contracts.view", "contracts.view_amounts", "contracts.create", "contracts.edit", "contracts.delete"
    ],
    "Administración": [
      "roles.view", "roles.manage", "roles.assign", "system.admin", "system.settings"
    ],
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
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              Gestión de Roles y Permisos
            </h1>
            <p className="text-slate-600 text-lg">
              Administra roles personalizados y asigna permisos granulares
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 bg-indigo-100 rounded-xl">
                    <Shield className="w-6 h-6 text-indigo-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900 mb-1">
                  {roles.length}
                </div>
                <p className="text-slate-600 text-sm">Roles definidos</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 bg-blue-100 rounded-xl">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900 mb-1">
                  {allEmployees.length}
                </div>
                <p className="text-slate-600 text-sm">Empleados activos</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 bg-green-100 rounded-xl">
                    <CheckSquare className="w-6 h-6 text-green-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900 mb-1">
                  {Object.keys(AVAILABLE_PERMISSIONS).length}
                </div>
                <p className="text-slate-600 text-sm">Permisos disponibles</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="roles" className="space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="roles">Roles</TabsTrigger>
              <TabsTrigger value="assignments">Asignaciones</TabsTrigger>
            </TabsList>

            <TabsContent value="roles" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-bold">Roles del Sistema</CardTitle>
                    <Button
                      onClick={() => setShowRoleForm(true)}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nuevo Rol
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {roles.map(role => (
                      <div key={role.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-bold text-slate-900 text-lg">
                                {role.name}
                              </h4>
                              {role.is_system_role && (
                                <Badge className="bg-purple-100 text-purple-700">Sistema</Badge>
                              )}
                              {role.department_restricted && (
                                <Badge className="bg-blue-100 text-blue-700">Departamental</Badge>
                              )}
                            </div>
                            <p className="text-sm text-slate-600 mb-3">
                              {role.description || "Sin descripción"}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {role.permissions?.slice(0, 5).map(p => (
                                <Badge key={p} variant="outline" className="text-xs">
                                  {AVAILABLE_PERMISSIONS[p] || p}
                                </Badge>
                              ))}
                              {role.permissions?.length > 5 && (
                                <Badge variant="outline" className="text-xs">
                                  +{role.permissions.length - 5} más
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditRole(role)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            {!role.is_system_role && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:bg-red-50"
                                onClick={() => handleDeleteRole(role)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="assignments" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl font-bold">Asignar Roles a Empleados</CardTitle>
                      <p className="text-sm text-slate-600 mt-1">
                        Los roles se sincronizan automáticamente con los usuarios corporativos
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="mb-6">
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

                  <div className="space-y-3">
                    {filteredEmployees.map(emp => {
                      const empRoles = getEmployeeRoles(emp.id);
                      return (
                        <div key={emp.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
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
                              <div className="flex flex-wrap gap-2 items-center">
                                {empRoles.length > 0 ? (
                                  empRoles.map(role => (
                                    <Badge key={role.id} className="bg-indigo-100 text-indigo-700">
                                      {role.name}
                                    </Badge>
                                  ))
                                ) : (
                                  <Badge variant="outline" className="text-slate-500">
                                    Sin roles asignados
                                  </Badge>
                                )}
                                {emp.role && emp.role !== "empleado" && (
                                  <Badge className="bg-slate-100 text-slate-600 text-xs">
                                    Legacy: {emp.role}
                                  </Badge>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAssignRoles(emp)}
                              >
                                <UserPlus className="w-4 h-4 mr-2" />
                                Asignar
                              </Button>
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

        {/* Role Form Modal */}
        {showRoleForm && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
            onClick={resetRoleForm}
          >
            <Card
              className="max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">
                    {editingRole ? "Editar Rol" : "Nuevo Rol"}
                  </CardTitle>
                  <Button variant="ghost" size="icon" onClick={resetRoleForm}>✕</Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Nombre del Rol *
                    </label>
                    <Input
                      placeholder="Ej: Revisor de Asistencia"
                      value={roleFormData.name}
                      onChange={(e) => setRoleFormData({ ...roleFormData, name: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Descripción
                    </label>
                    <Textarea
                      placeholder="Describe las responsabilidades de este rol..."
                      value={roleFormData.description}
                      onChange={(e) => setRoleFormData({ ...roleFormData, description: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="dept_restricted"
                      checked={roleFormData.department_restricted}
                      onChange={(e) => setRoleFormData({ ...roleFormData, department_restricted: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    <label htmlFor="dept_restricted" className="text-sm text-slate-700">
                      Restringido a su departamento (solo ve datos de su propio departamento)
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-3">
                      Permisos ({roleFormData.permissions.length} seleccionados)
                    </label>
                    <PermissionMatrix
                      permissions={roleFormData.permissions}
                      onChange={handlePermissionsChange}
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={resetRoleForm}>
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                      onClick={handleSubmitRole}
                      disabled={createRoleMutation.isPending || updateRoleMutation.isPending}
                    >
                      {editingRole ? "Actualizar" : "Crear Rol"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Assign Roles Modal */}
        {showAssignModal && selectedEmployee && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
            onClick={() => {
              setShowAssignModal(false);
              setSelectedEmployee(null);
              setSelectedRoles([]);
            }}
          >
            <Card
              className="max-w-2xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold">Asignar Roles</CardTitle>
                    <p className="text-sm text-slate-600 mt-1">
                      {selectedEmployee.first_name} {selectedEmployee.last_name}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setShowAssignModal(false);
                      setSelectedEmployee(null);
                      setSelectedRoles([]);
                    }}
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Selecciona uno o más roles para asignar al empleado:
                  </p>
                  {roles.map(role => (
                    <label
                      key={role.id}
                      className="flex items-start gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role.id)}
                        onChange={() => toggleRoleSelection(role.id)}
                        className="w-5 h-5 rounded mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-slate-900">{role.name}</h4>
                          {role.is_system_role && (
                            <Badge className="bg-purple-100 text-purple-700 text-xs">Sistema</Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-600">{role.description}</p>
                      </div>
                    </label>
                  ))}

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setShowAssignModal(false);
                        setSelectedEmployee(null);
                        setSelectedRoles([]);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                      onClick={() => assignRolesMutation.mutate({
                        employeeId: selectedEmployee.id,
                        roleIds: selectedRoles,
                      })}
                      disabled={assignRolesMutation.isPending}
                    >
                      {assignRolesMutation.isPending ? "Guardando..." : "Guardar Asignación"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
