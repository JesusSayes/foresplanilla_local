import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { entitiesAPI } from "@/api/entitiesClient";
import { computePermissionFlags } from "@/lib/permissionFlags";

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
  "attendance.approve_edits": "Aprobar/rechazar edición de registros de asistencia",
  "attendance.approve_incidents": "Aprobar/rechazar incidencias",
  "attendance.approve_compensations": "Aprobar compensaciones de tardanzas y horas extras",
  "attendance.view_reports": "Ver reportes de asistencia",
  "attendance.manage": "Gestión completa de asistencia",
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
  "payroll.view_amounts": "Ver montos en planillas",

  // Contabilidad
  "accounting.view": "Ver asientos contables",
  "accounting.manage": "Gestionar asientos contables",

  // Préstamos
  "loans.view": "Ver préstamos",
  "loans.manage": "Gestionar préstamos",

  // Contratos
  "contracts.view": "Ver contratos",
  "contracts.view_amounts": "Ver montos de contratos",
  "contracts.create": "Crear contratos",
  "contracts.edit": "Editar contratos",
  "contracts.delete": "Eliminar contratos",
  "contracts.approve": "Aprobar contratos",
  "contracts.sign": "Firmar contratos digitalmente",
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

  // Administración
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
  const [employeePermissionFlags, setEmployeePermissionFlags] = useState({
    can_view_all_employees: false,
    can_create_employees: false,
    can_edit_employees: false,
    can_delete_employees: false,
  });
  // fallbackSiteRestriction: undefined=cargando, null=todas, []|[...]=restricción
  const [fallbackSiteRestriction, setFallbackSiteRestriction] = useState(undefined);

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
          if (emp.role === "super_admin") {
            setPermissions(Object.keys(AVAILABLE_PERMISSIONS));
            setRoles([{ name: "Super Admin", permissions: Object.keys(AVAILABLE_PERMISSIONS), priority: 1000 }]);
            setEmployeePermissionFlags({
              can_view_all_employees: true,
              can_create_employees: true,
              can_edit_employees: true,
              can_delete_employees: true,
            });
            setFallbackSiteRestriction(null);
            setLoading(false);
            return;
          }

          // Obtener roles asignados al usuario
          // Buscar roles asignados al empleado
          const userRoles = await entitiesAPI.UserRole.filter({
            employee_id: emp.id
          });

          let effectivePermissions;
          if (userRoles.length > 0) {
            const roleIds = userRoles.map(ur => ur.role_id);
            const allRoles = await entitiesAPI.Role.list();
            const assignedRoles = allRoles.filter(r => roleIds.includes(r.id));

            setRoles(assignedRoles);
            setFallbackSiteRestriction(null); // los roles custom manejan la restricción

            // Combinar permisos de todos los roles
            const allPermissions = new Set();
            assignedRoles.forEach(role => {
              if (role.permissions) {
                role.permissions.forEach(p => allPermissions.add(p));
              }
            });

            effectivePermissions = [...allPermissions];
            setPermissions(effectivePermissions);
          } else {
            // Fallback al rol básico del empleado si no tiene roles asignados en UserRole
            effectivePermissions = getBasicPermissionsByRole(emp.role);
            setPermissions(effectivePermissions);
            // Calcular restricción de sede para roles legacy:
            // admin y super_admin: sin restricción
            // cualquier otro rol: restringido a su propia sede
            if (emp.role === "admin" || emp.role === "super_admin") {
              setFallbackSiteRestriction(null);
            } else {
              // Roles como manager, hr_readonly, empleado: solo su sede
              setFallbackSiteRestriction(emp.site ? [emp.site] : []);
            }
          }

          const permFlags = computePermissionFlags(effectivePermissions);
          setEmployeePermissionFlags(permFlags);
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
    // Si el usuario tiene roles asignados en UserRole, esos son la fuente de verdad
    if (roles.length > 0) {
      return permissions.includes(permission) || permissions.includes("system.admin");
    }
    // Fallback legacy (sin UserRole asignados): super_admin tiene todo
    if (employee?.role === "super_admin") return true;
    // Fallback legacy: usar permisos del rol básico (ya cargados en permissions)
    return permissions.includes(permission) || permissions.includes("system.admin");
  };

  const hasAnyPermission = (permissionList) => {
    return permissionList.some(p => hasPermission(p));
  };

  const hasAllPermissions = (permissionList) => {
    return permissionList.every(p => hasPermission(p));
  };

  const canAccessSite = (siteName) => {
    const accessible = getAccessibleSites();
    if (accessible === null) return true;
    return accessible.includes(siteName);
  };

  const getAccessibleSites = (permissionList = null) => {
    // Mientras carga, devolver undefined para que los componentes esperen
    if (loading) return undefined;

    // Super admin con roles custom asignados: respetar restricciones de esos roles
    // Super admin SIN roles custom: acceso total (fallback legacy)
    if (employee?.role === "super_admin" && roles.length === 0) return null;

    // Si el usuario tiene roles custom asignados en UserRole
    if (roles.length > 0) {
      // system.admin en los roles custom => acceso total
      if (permissions.includes("system.admin")) return null;

      const relevantRoles = permissionList
        ? roles.filter(role => (role.permissions || []).some(permission =>
            permission === "system.admin" || permissionList.includes(permission)
          ))
        : roles;
      if (permissionList && relevantRoles.length === 0) return [];

      const siteRestrictedRoles = relevantRoles.filter(r => r.site_restricted);
      // Ningún rol tiene restricción → acceso total
      if (siteRestrictedRoles.length === 0) return null;

      // Si tiene algún rol SIN restricción de sede, ve todas
      const hasUnrestrictedRole = relevantRoles.some(r => !r.site_restricted);
      if (hasUnrestrictedRole) return null;

      // Combinar sedes de TODOS los roles site_restricted
      const allowedSites = [...new Set(siteRestrictedRoles.flatMap(r => r.allowed_sites || []))];
      // Si ningún rol tiene sedes específicas, restringir a la sede propia
      if (allowedSites.length === 0) {
        return employee?.site ? [employee.site] : [];
      }
      return allowedSites;
    }

    // Fallback para usuarios con rol legacy (sin UserRole asignado)
    // fallbackSiteRestriction se calculó en el useEffect (undefined mientras carga)
    return fallbackSiteRestriction ?? null;
  };

  const canAccessDepartment = (departmentName) => {
    // Si tiene system.admin en sus permisos efectivos → acceso total
    if (hasPermission("system.admin")) return true;
    // Fallback legacy sin roles asignados: super_admin y admin ven todo
    if (roles.length === 0 && (employee?.role === "super_admin" || employee?.role === "admin")) return true;

    const hasDepartmentRestriction = roles.some(r => r.department_restricted);
    if (!hasDepartmentRestriction) return true;
    return employee?.department_name === departmentName;
  };

  const canViewFinancials = () => {
    if (permissions.includes("system.admin")) return true;
    return permissions.includes("employees.view_financials");
  };

  const canAccessEmployee = (targetEmployeeId) => {
    // El empleado puede ver sus propios datos
    if (employee?.id === targetEmployeeId) return true;

    // Si tiene system.admin en sus permisos efectivos → puede ver todo
    if (hasPermission("system.admin")) return true;

    // Fallback legacy sin roles asignados
    if (roles.length === 0 && (employee?.role === "super_admin" || employee?.role === "admin")) return true;

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
    // system.admin o fallback legacy admin/super_admin sin roles → ve todo
    if (hasPermission("system.admin") || (roles.length === 0 && (employee?.role === "super_admin" || employee?.role === "admin"))) {
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
    canViewFinancials,
    employeePermissionFlags,
  };
};

// Permisos básicos por rol antiguo (para compatibilidad)
export const getBasicPermissionsByRole = (role) => {
  const basicPermissions = {
    super_admin: Object.keys(AVAILABLE_PERMISSIONS),
    admin: [
      "system.admin", "system.settings",
      "employees.view", "employees.edit", "employees.create", "employees.delete", "employees.import", "employees.export", "employees.change_status",
      "attendance.view_all", "attendance.edit", "attendance.approve_edits", "attendance.approve_incidents", "attendance.manage", "attendance.export",
      "vacations.view_all", "vacations.approve", "vacations.manage", "vacations.calendar",
      "payroll.view_all", "payroll.view_amounts", "payroll.edit", "payroll.create", "payroll.delete", "payroll.calculate", "payroll.approve", "payroll.view_department",
      "certificates.view_all", "certificates.approve", "certificates.create", "certificates.request",
      "schedules.view", "schedules.edit", "schedules.create", "schedules.delete", "schedules.assign",
      "holidays.view", "holidays.manage", "holidays.create", "holidays.edit", "holidays.delete",
      "reports.view", "reports.export", "reports.attendance", "reports.payroll", "reports.vacations", "reports.employees",
      "roles.view", "roles.manage", "roles.assign",
      "cost_centers.view", "cost_centers.create", "cost_centers.edit", "cost_centers.assign", "cost_centers.view_amounts", "cost_centers.delete",
      "contracts.view", "contracts.view_amounts", "contracts.create", "contracts.edit", "contracts.delete", "contracts.sign",
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
