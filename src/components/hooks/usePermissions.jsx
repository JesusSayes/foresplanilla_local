import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

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
  
  // Asistencia
  "attendance.view_own": "Ver propia asistencia",
  "attendance.view_all": "Ver asistencia de todos",
  "attendance.view_department": "Ver asistencia del departamento",
  "attendance.edit": "Editar registros de asistencia",
  "attendance.approve_incidents": "Aprobar/rechazar incidencias",
  "attendance.manage": "Gestión completa de asistencia",
  "attendance.export": "Exportar reportes de asistencia",
  
  // Vacaciones
  "vacations.view_own": "Ver propias vacaciones",
  "vacations.view_all": "Ver vacaciones de todos",
  "vacations.view_department": "Ver vacaciones del departamento",
  "vacations.approve": "Aprobar solicitudes de vacaciones",
  "vacations.manage": "Gestión completa de vacaciones",
  "vacations.calendar": "Ver calendario de vacaciones",
  
  // Nómina
  "payroll.view_own": "Ver propias boletas",
  "payroll.view_all": "Ver todas las boletas",
  "payroll.edit": "Editar boletas",
  "payroll.create": "Crear boletas",
  "payroll.delete": "Eliminar boletas",
  "payroll.calculate": "Calcular nómina",
  "payroll.approve": "Aprobar nómina",
  
  // Certificados
  "certificates.view_own": "Ver propios certificados",
  "certificates.view_all": "Ver todos los certificados",
  "certificates.approve": "Aprobar certificados",
  "certificates.create": "Crear certificados",
  "certificates.request": "Solicitar certificados",
  
  // Horarios
  "schedules.view": "Ver horarios",
  "schedules.edit": "Editar horarios",
  "schedules.create": "Crear horarios",
  "schedules.delete": "Eliminar horarios",
  "schedules.assign": "Asignar horarios",
  
  // Feriados
  "holidays.view": "Ver feriados",
  "holidays.manage": "Gestionar feriados",
  "holidays.create": "Crear feriados",
  "holidays.edit": "Editar feriados",
  "holidays.delete": "Eliminar feriados",
  
  // Sedes
  "sites.view": "Ver sedes",
  "sites.create": "Crear sedes",
  "sites.edit": "Editar sedes",
  "sites.delete": "Eliminar sedes",
  "sites.manage": "Gestión completa de sedes",
  
  // Departamentos
  "departments.view": "Ver departamentos",
  "departments.create": "Crear departamentos",
  "departments.edit": "Editar departamentos",
  "departments.delete": "Eliminar departamentos",
  "departments.manage": "Gestión completa de departamentos",
  
  // Cargos/Posiciones
  "positions.view": "Ver cargos",
  "positions.create": "Crear cargos",
  "positions.edit": "Editar cargos",
  "positions.delete": "Eliminar cargos",
  "positions.manage": "Gestión completa de cargos",
  
  // Bancos
  "banks.view": "Ver bancos",
  "banks.create": "Crear bancos",
  "banks.edit": "Editar bancos",
  "banks.delete": "Eliminar bancos",
  
  // Reportes
  "reports.view": "Ver reportes",
  "reports.export": "Exportar reportes",
  "reports.attendance": "Ver reportes de asistencia",
  "reports.payroll": "Ver reportes de nómina",
  "reports.vacations": "Ver reportes de vacaciones",
  "reports.employees": "Ver reportes de empleados",
  
  // Administración
  "roles.view": "Ver roles",
  "roles.manage": "Gestionar roles y permisos",
  "roles.assign": "Asignar roles a usuarios",
  "system.admin": "Acceso administrativo completo",
  "system.settings": "Configurar ajustes del sistema",
};

export const usePermissions = () => {
  const [permissions, setPermissions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const user = await base44.auth.me();
        const employees = await base44.entities.Employee.filter({ 
          work_email: user.email 
        });
        
        if (employees && employees.length > 0) {
          const emp = employees[0];
          setEmployee(emp);

          // Obtener roles asignados al usuario
          const userRoles = await base44.entities.UserRole.filter({ 
            employee_id: emp.id 
          });

          if (userRoles.length > 0) {
            const roleIds = userRoles.map(ur => ur.role_id);
            const allRoles = await base44.entities.Role.list();
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
  }, []);

  const hasPermission = (permission) => {
    return permissions.includes(permission) || permissions.includes("system.admin");
  };

  const hasAnyPermission = (permissionList) => {
    return permissionList.some(p => hasPermission(p));
  };

  const hasAllPermissions = (permissionList) => {
    return permissionList.every(p => hasPermission(p));
  };

  const canAccessDepartment = (departmentName) => {
    const hasDepartmentRestriction = roles.some(r => r.department_restricted);
    if (!hasDepartmentRestriction) return true;
    return employee?.department_name === departmentName;
  };

  return {
    permissions,
    roles,
    employee,
    loading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccessDepartment,
  };
};

// Permisos básicos por rol antiguo (para compatibilidad)
const getBasicPermissionsByRole = (role) => {
  const basicPermissions = {
    admin: [
      "system.admin",
      "employees.view", "employees.edit", "employees.create", "employees.delete", "employees.import",
      "attendance.view_all", "attendance.edit", "attendance.approve_incidents", "attendance.manage",
      "vacations.view_all", "vacations.approve", "vacations.manage",
      "payroll.view_all", "payroll.edit", "payroll.create", "payroll.delete",
      "certificates.view_all", "certificates.approve", "certificates.create",
      "schedules.view", "schedules.edit", "schedules.create",
      "holidays.view", "holidays.manage",
      "reports.view", "reports.export",
      "roles.view", "roles.manage",
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