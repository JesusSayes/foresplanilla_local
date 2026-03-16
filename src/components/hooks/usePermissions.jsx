import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { entitiesAPI } from "@/api/entitiesClient";

// Lista completa de permisos disponibles en el sistema
export const AVAILABLE_PERMISSIONS = {
  // Empleados
  "employees.view": "Ver empleados",
  "employees.edit": "Editar empleados",
  "employees.create": "Crear empleados",
  "employees.delete": "Eliminar empleados",
  "employees.import": "Importar empleados masivamente",
  "employees.export": "Exportar datos de empleados",
  "employees.change_status": "Cambiar estado de empleados",
  "employees.view_financials": "Ver información financiera de empleados",

  // Asistencia
  "attendance.view_own": "Ver propia asistencia",
  "attendance.view_all": "Ver asistencia de todos",
  "attendance.view_department": "Ver asistencia del departamento",
  "attendance.edit": "Editar registros de asistencia",
  "attendance.approve_incidents": "Aprobar/rechazar incidencias",
  "attendance.manage_schedules": "Gestionar horarios de trabajo",
  "attendance.view_reports": "Ver reportes de asistencia",
  "attendance.export": "Exportar datos de asistencia",

  // Vacaciones
  "vacations.view_own": "Ver propias vacaciones",
  "vacations.view_all": "Ver vacaciones de todos",
  "vacations.view_department": "Ver vacaciones del departamento",
  "vacations.request": "Solicitar vacaciones",
  "vacations.approve": "Aprobar/rechazar solicitudes",
  "vacations.manage_balances": "Gestionar saldos de vacaciones",
  "vacations.view_calendar": "Ver calendario de vacaciones",

  // Planilla
  "payroll.view_own": "Ver propia planilla",
  "payroll.view_all": "Ver planilla de todos",
  "payroll.view_department": "Ver planilla del departamento",
  "payroll.process": "Procesar planilla",
  "payroll.edit": "Editar conceptos de planilla",
  "payroll.approve": "Aprobar planilla",
  "payroll.export": "Exportar datos de planilla",
  "payroll.manage_concepts": "Gestionar conceptos de planilla",

  // Contratos
  "contracts.view": "Ver contratos",
  "contracts.create": "Crear contratos",
  "contracts.edit": "Editar contratos",
  "contracts.delete": "Eliminar contratos",
  "contracts.approve": "Aprobar contratos",
  "contracts.manage_templates": "Gestionar plantillas de contratos",
  "contracts.manage_renewals": "Gestionar renovaciones automáticas",

  // Certificados
  "certificates.view_own": "Ver propios certificados",
  "certificates.view_all": "Ver certificados de todos",
  "certificates.generate": "Generar certificados",
  "certificates.approve": "Aprobar certificados",

  // Reportes
  "reports.view": "Ver reportes",
  "reports.export": "Exportar reportes",
  "reports.advanced": "Acceso a reportes avanzados",
  "reports.attendance": "Ver reportes de asistencia",
  "reports.payroll": "Ver reportes de nómina",
  "reports.vacations": "Ver reportes de vacaciones",
  "reports.employees": "Ver reportes de empleados",

  // Centros de Costo
  "cost_centers.view": "Ver centros de costo",
  "cost_centers.create": "Crear centros de costo",
  "cost_centers.edit": "Editar centros de costo",
  "cost_centers.delete": "Eliminar centros de costo",
  "cost_centers.assign": "Asignar centros de costo",
  "cost_centers.view_amounts": "Ver montos de centros de costo",

  // Planillas
  "payroll.view_amounts": "Ver montos en planillas",
  "payroll.view_department": "Ver planillas del departamento",

  // Contratos
  "contracts.view": "Ver contratos",
  "contracts.view_amounts": "Ver montos de contratos",
  "contracts.create": "Crear contratos",
  "contracts.edit": "Editar contratos",
  "contracts.delete": "Eliminar contratos",

  // Configuración
  "settings.company": "Configurar información de empresa",
  "settings.master_data": "Gestionar datos maestros",
  "settings.cost_centers": "Gestionar centros de costo",
  "settings.holidays": "Gestionar feriados",
  "settings.notifications": "Configurar notificaciones",
  "settings.integrations": "Configurar integraciones",

  // Usuarios y Roles
  "users.view": "Ver usuarios",
  "users.create": "Crear usuarios",
  "users.edit": "Editar usuarios",
  "users.delete": "Eliminar usuarios",
  "users.manage_access": "Gestionar accesos de usuarios",
  "roles.view": "Ver roles",
  "roles.create": "Crear roles",
  "roles.edit": "Editar roles",
  "roles.delete": "Eliminar roles",
  "roles.manage": "Gestionar roles y permisos",
  "roles.assign": "Asignar roles a usuarios",

  // Administración
  "system.admin": "Acceso administrativo completo",
  "system.settings": "Configurar ajustes del sistema",
};

export const usePermissions = () => {
  const { user, isLoadingAuth } = useAuth();
  const [permissions, setPermissions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        if (isLoadingAuth || !user) {
          setLoading(false);
          return;
        }

        // Usar datos del empleado del contexto si están disponibles
        let emp = user.employee;

        if (!emp) {
          // Fallback: buscar empleado por email
          const employees = await entitiesAPI.Employee.filter({
            work_email: user.email
          });

          if (employees && employees.length > 0) {
            emp = employees[0];
          }
        }

        if (emp) {
          setEmployee(emp);

          // Super Admin tiene acceso total inmediato
          if (emp.role === "super_admin" || emp.role === "admin") {
            setPermissions(Object.keys(AVAILABLE_PERMISSIONS));
            setRoles([{ name: "Super Admin", permissions: Object.keys(AVAILABLE_PERMISSIONS), priority: 1000 }]);
            setLoading(false);
            return;
          }

          // Obtener roles asignados al usuario
          // Buscar roles asignados al empleado
          const userRoles = await entitiesAPI.UserRole.filter({
            employee_id: emp.id
          });

          if (userRoles.length > 0) {
            const roleIds = userRoles.map(ur => ur.role_id);
            const allRoles = await entitiesAPI.Role.list();
            const assignedRoles = allRoles.filter(r => roleIds.includes(r.id));

            setRoles(assignedRoles);

            // Combinar permisos de todos los roles
            const allPermissions = new Set();
            assignedRoles.forEach(role => {
              if (role.permissions) {
                role.permissions.forEach(p => allPermissions.add(p));
              }
            });

            setPermissions([...allPermissions]);
          } else {
            // Fallback al rol básico del empleado si no tiene roles asignados
            const basicPermissions = getBasicPermissionsByRole(emp.role);
            setPermissions(basicPermissions);
          }
        }
      } catch (error) {
        console.error("Error loading permissions:", error);
      } finally {
        setLoading(false);
      }
    };

    loadPermissions();
  }, [user, isLoadingAuth]);

  const hasPermission = (permission) => {
    // Super Admin siempre tiene todos los permisos
    if (employee?.role === "super_admin" || employee?.role === "admin") return true;
    return permissions.includes(permission) || permissions.includes("system.admin");
  };

  const hasAnyPermission = (permissionList) => {
    return permissionList.some(p => hasPermission(p));
  };

  const hasAllPermissions = (permissionList) => {
    return permissionList.every(p => hasPermission(p));
  };

  const canAccessSite = (siteName) => {
    if (employee?.role === "super_admin" || employee?.role === "admin") return true;
    if (hasPermission("system.admin")) return true;
    const siteRestrictedRoles = roles.filter(r => r.site_restricted);
    if (siteRestrictedRoles.length === 0) return true;
    const allowedSites = siteRestrictedRoles.flatMap(r => r.allowed_sites || []);
    return allowedSites.length === 0 || allowedSites.includes(siteName);
  };

  const getAccessibleSites = () => {
    if (employee?.role === "super_admin" || employee?.role === "admin") return null; // null = todas
    if (hasPermission("system.admin")) return null;
    const siteRestrictedRoles = roles.filter(r => r.site_restricted);
    if (siteRestrictedRoles.length === 0) return null;
    const allowedSites = siteRestrictedRoles.flatMap(r => r.allowed_sites || []);
    return allowedSites.length > 0 ? allowedSites : null;
  };

  const canAccessDepartment = (departmentName) => {
    // Super Admin y Admin pueden ver todo
    if (employee?.role === "super_admin" || employee?.role === "admin") return true;

    const hasDepartmentRestriction = roles.some(r => r.department_restricted);
    if (!hasDepartmentRestriction) return true;
    return employee?.department_name === departmentName;
  };

  const canAccessEmployee = (targetEmployeeId) => {
    // El empleado puede ver sus propios datos
    if (employee?.id === targetEmployeeId) return true;

    // Super Admin puede ver todo
    if (employee?.role === "super_admin") return true;

    // Admin puede ver todo
    if (employee?.role === "admin") return true;

    // Managers con equipo específico
    if (employee?.managed_team_ids && employee.managed_team_ids.includes(targetEmployeeId)) {
      return true;
    }

    // Managers con acceso por departamento
    const hasTeamRestriction = roles.some(r => r.team_restricted);
    if (!hasTeamRestriction) {
      return canAccessDepartment(employee?.department_name);
    }

    return false;
  };

  const getAccessibleEmployeeIds = async () => {
    // Super Admin ve todo
    if (employee?.role === "super_admin" || employee?.role === "admin") {
      const allEmployees = await entitiesAPI.Employee.list();
      return allEmployees.map(e => e.id);
    }

    // Manager con equipo específico
    if (employee?.managed_team_ids && employee.managed_team_ids.length > 0) {
      return employee.managed_team_ids;
    }

    // Manager por departamento
    if (employee?.department_name) {
      const deptEmployees = await entitiesAPI.Employee.filter({
        department_name: employee.department_name
      });
      return deptEmployees.map(e => e.id);
    }

    // Empleado normal solo ve sus propios datos
    return [employee?.id];
  };

  return {
    permissions,
    roles,
    employee,
    loading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccessSite,
    getAccessibleSites,
    canAccessDepartment,
    canAccessEmployee,
    getAccessibleEmployeeIds,
  };
};

// Permisos básicos por rol antiguo (para compatibilidad)
const getBasicPermissionsByRole = (role) => {
  const basicPermissions = {
    super_admin: Object.keys(AVAILABLE_PERMISSIONS),
    admin: [
      "system.admin", "system.settings",
      "employees.view", "employees.edit", "employees.create", "employees.delete", "employees.import", "employees.export", "employees.change_status",
      "attendance.view_all", "attendance.edit", "attendance.approve_incidents", "attendance.manage", "attendance.export",
      "vacations.view_all", "vacations.approve", "vacations.manage", "vacations.calendar",
      "payroll.view_all", "payroll.view_amounts", "payroll.edit", "payroll.create", "payroll.delete", "payroll.calculate", "payroll.approve", "payroll.view_department",
      "certificates.view_all", "certificates.approve", "certificates.create", "certificates.request",
      "schedules.view", "schedules.edit", "schedules.create", "schedules.delete", "schedules.assign",
      "holidays.view", "holidays.manage", "holidays.create", "holidays.edit", "holidays.delete",
      "reports.view", "reports.export", "reports.attendance", "reports.payroll", "reports.vacations", "reports.employees",
      "roles.view", "roles.manage", "roles.assign",
      "cost_centers.view", "cost_centers.create", "cost_centers.edit", "cost_centers.assign", "cost_centers.view_amounts", "cost_centers.delete",
      "contracts.view", "contracts.view_amounts", "contracts.create", "contracts.edit", "contracts.delete",
      "sites.view", "sites.create", "sites.edit", "sites.delete", "sites.manage",
      "departments.view", "departments.create", "departments.edit", "departments.delete", "departments.manage",
      "positions.view", "positions.create", "positions.edit", "positions.delete", "positions.manage",
      "banks.view", "banks.create", "banks.edit", "banks.delete",
    ],
    hr_readonly: [
      "employees.view",
      "attendance.view_all",
      "vacations.view_all",
      "payroll.view_all",
      "certificates.view_all",
      "schedules.view",
      "holidays.view",
      "reports.view", "reports.export",
    ],
    manager: [
      "employees.view",
      "attendance.view_department", "attendance.approve_incidents",
      "vacations.view_department", "vacations.approve",
      "payroll.view_own",
      "certificates.view_own",
      "schedules.view",
      "holidays.view",
      "reports.view", "reports.export",
    ],
    empleado: [
      "attendance.view_own",
      "vacations.view_own",
      "payroll.view_own",
      "certificates.view_own",
      "schedules.view",
      "holidays.view",
    ],
  };

  return basicPermissions[role] || basicPermissions.empleado;
};
