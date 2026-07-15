import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from '@/api/entitiesClient';
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AVAILABLE_PERMISSIONS } from "../components/hooks/usePermissions";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";

export default function SystemRoleInitializer() {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;
  const [existingRoles, setExistingRoles] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const initializeData = async () => {
      if (currentUser?.employee?.role === "admin" || currentUser?.employee?.role === "super_admin") {
        try {
          const result = await updateEmployeeStatuses();
          if (result.success && result.updatedCount > 0) {
            console.log(`${result.updatedCount} empleado(s) actualizado(s) a estado Cesado automáticamente`);
          }
        } catch (error) {
          console.error('Error actualizando estados:', error);
        }
      }

      try {
        const roles = await entitiesAPI.Role.list();
        setExistingRoles(roles);
      } catch (error) {
        console.error('Error cargando roles:', error);
      }
    };

    initializeData();
  }, [currentUser]);

  const SYSTEM_ROLES = [
    {
      name: "Super Admin",
      description: "Acceso total a todas las funcionalidades del sistema sin restricciones",
      permissions: Object.keys(AVAILABLE_PERMISSIONS),
      is_system_role: true,
      department_restricted: false,
      team_restricted: false,
      priority: 1000,
    },
    {
      name: "Administrador",
      description: "Administrador general con acceso completo a gestión de empleados, nómina y configuraciones",
      permissions: [
        "system.admin",
        "employees.view", "employees.edit", "employees.create", "employees.delete", "employees.import", "employees.export",
        "attendance.view_all", "attendance.edit", "attendance.approve_incidents", "attendance.manage", "attendance.export",
        "vacations.view_all", "vacations.approve", "vacations.manage", "vacations.calendar",
        "payroll.view_all", "payroll.edit", "payroll.create", "payroll.delete", "payroll.calculate", "payroll.approve",
        "certificates.view_all", "certificates.approve", "certificates.create",
        "schedules.view", "schedules.edit", "schedules.create", "schedules.delete", "schedules.assign",
        "holidays.view", "holidays.manage", "holidays.create", "holidays.edit", "holidays.delete",
        "sites.manage", "departments.manage", "positions.manage",
        "reports.view", "reports.export", "reports.attendance", "reports.payroll", "reports.vacations",
        "roles.view", "roles.manage", "roles.assign",
        "notifications.view_own", "notifications.view_all", "notifications.view_center", "notifications.manage_config",
      ],
      is_system_role: true,
      department_restricted: false,
      team_restricted: false,
      priority: 900,
    },
    {
      name: "RRHH Solo Lectura",
      description: "Acceso de solo lectura a todos los datos de RRHH sin capacidad de edición",
      permissions: [
        "employees.view", "employees.export",
        "attendance.view_all", "attendance.export",
        "vacations.view_all", "vacations.calendar",
        "payroll.view_all",
        "certificates.view_all",
        "schedules.view",
        "holidays.view",
        "sites.view", "departments.view", "positions.view", "banks.view",
        "reports.view", "reports.export", "reports.attendance", "reports.payroll", "reports.vacations", "reports.employees",
        "notifications.view_own", "notifications.view_all", "notifications.view_center",
      ],
      is_system_role: true,
      department_restricted: false,
      team_restricted: false,
      priority: 500,
    },
    {
      name: "Manager Departamental",
      description: "Gestión de equipo limitado a su departamento",
      permissions: [
        "employees.view",
        "attendance.view_department", "attendance.approve_incidents",
        "vacations.view_department", "vacations.approve", "vacations.calendar",
        "payroll.view_own",
        "certificates.view_own", "certificates.request",
        "schedules.view",
        "holidays.view",
        "reports.view", "reports.export",
        "notifications.view_own", "notifications.view_center",
      ],
      is_system_role: true,
      department_restricted: true,
      team_restricted: false,
      priority: 400,
    },
    {
      name: "Manager de Equipo",
      description: "Gestión de un equipo específico de empleados asignados",
      permissions: [
        "employees.view",
        "attendance.view_department", "attendance.approve_incidents",
        "vacations.view_department", "vacations.approve", "vacations.calendar",
        "payroll.view_own",
        "certificates.view_own", "certificates.request",
        "schedules.view",
        "holidays.view",
        "reports.view",
        "notifications.view_own", "notifications.view_center",
      ],
      is_system_role: true,
      department_restricted: false,
      team_restricted: true,
      priority: 350,
    },
    {
      name: "Empleado",
      description: "Acceso básico a funcionalidades propias del empleado",
      permissions: [
        "attendance.view_own",
        "vacations.view_own",
        "payroll.view_own",
        "certificates.view_own", "certificates.request",
        "schedules.view",
        "holidays.view",
        "notifications.view_own", "notifications.view_center",
      ],
      is_system_role: true,
      department_restricted: false,
      team_restricted: false,
      priority: 100,
    },
  ];

  const initializeRolesMutation = useMutation({
    mutationFn: async () => {
      const createdRoles = [];

      for (const roleData of SYSTEM_ROLES) {
        // Verificar si el rol ya existe
        const exists = existingRoles.find(r => r.name === roleData.name);

        if (!exists) {
          const newRole = await entitiesAPI.Role.create(roleData);
          createdRoles.push(newRole);
        }
      }

      return createdRoles;
    },
    onSuccess: (createdRoles) => {
      queryClient.invalidateQueries(["roles"]);
      setInitialized(true);
      toast.success(`${createdRoles.length} roles del sistema inicializados correctamente`);
    },
    onError: () => {
      toast.error("Error al inicializar roles del sistema");
    },
  });

  if (!employee || (employee.role !== "super_admin" && employee.role !== "admin")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">Solo Super Admins y Admins pueden inicializar roles</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Inicializador de Roles del Sistema
          </h1>
          <p className="text-slate-600 text-lg">
            Crea los roles predeterminados del sistema de RRHH
          </p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b bg-gradient-to-r from-indigo-50 to-purple-50">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Shield className="w-6 h-6 text-indigo-600" />
              Roles del Sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4 mb-6">
              {SYSTEM_ROLES.map((role, idx) => {
                const exists = existingRoles.find(r => r.name === role.name);

                return (
                  <div key={idx} className="p-4 border border-slate-200 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="font-bold text-slate-900">{role.name}</h4>
                          {exists && (
                            <Badge className="bg-green-100 text-green-700">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Ya existe
                            </Badge>
                          )}
                          {role.department_restricted && (
                            <Badge className="bg-blue-100 text-blue-700">Departamental</Badge>
                          )}
                          {role.team_restricted && (
                            <Badge className="bg-purple-100 text-purple-700">Por Equipo</Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 mb-2">{role.description}</p>
                        <p className="text-xs text-slate-500">
                          {role.permissions.length} permisos asignados
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-900">
                <strong>Nota:</strong> Los roles que ya existen no serán modificados.
                Solo se crearán los roles que aún no están en el sistema.
              </p>
            </div>

            {initialized ? (
              <div className="text-center py-6">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  ¡Roles Inicializados!
                </h3>
                <p className="text-slate-600 mb-4">
                  Los roles del sistema han sido creados correctamente
                </p>
                <Button
                  onClick={() => window.location.href = "/RoleManagement"}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  Ir a Gestión de Roles
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => initializeRolesMutation.mutate()}
                disabled={initializeRolesMutation.isPending}
                className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-base"
              >
                {initializeRolesMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Inicializando...
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5 mr-2" />
                    Inicializar Roles del Sistema
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
