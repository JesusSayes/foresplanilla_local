import { usePermissions } from "./usePermissions";

/**
 * Hook para filtrar datos según los permisos del usuario
 * Asegura que cada usuario solo vea los datos que le corresponden
 */
export const useDataFiltering = () => {
  const { employee, hasPermission, canAccessEmployee } = usePermissions();

  /**
   * Filtra una lista de empleados según los permisos del usuario actual
   */
  const filterEmployees = (employees) => {
    if (!employee) return [];

    // Super Admin y Admin ven todo
    if (employee.role === "super_admin" || employee.role === "admin") {
      return employees;
    }

    // HR Read-only ve todo pero sin editar
    if (employee.role === "hr_readonly") {
      return employees;
    }

    // Manager con equipo específico
    if (employee.managed_team_ids && employee.managed_team_ids.length > 0) {
      return employees.filter(emp => 
        employee.managed_team_ids.includes(emp.id) || emp.id === employee.id
      );
    }

    // Manager por departamento
    if (employee.role === "manager") {
      return employees.filter(emp => 
        emp.department_name === employee.department_name
      );
    }

    // Empleado normal solo ve sus propios datos
    return employees.filter(emp => emp.id === employee.id);
  };

  /**
   * Filtra solicitudes de vacaciones según permisos
   */
  const filterVacationRequests = (requests, employeesList) => {
    if (!employee) return [];

    // Super Admin y Admin ven todo
    if (employee.role === "super_admin" || employee.role === "admin") {
      return requests;
    }

    // HR Read-only ve todo
    if (employee.role === "hr_readonly") {
      return requests;
    }

    // Manager con equipo específico
    if (employee.managed_team_ids && employee.managed_team_ids.length > 0) {
      return requests.filter(req => 
        employee.managed_team_ids.includes(req.employee_id) || 
        req.employee_id === employee.id
      );
    }

    // Manager por departamento
    if (employee.role === "manager") {
      const deptEmployeeIds = employeesList
        .filter(emp => emp.department_name === employee.department_name)
        .map(emp => emp.id);
      return requests.filter(req => deptEmployeeIds.includes(req.employee_id));
    }

    // Empleado normal solo ve sus propias solicitudes
    return requests.filter(req => req.employee_id === employee.id);
  };

  /**
   * Filtra registros de asistencia según permisos
   */
  const filterAttendanceRecords = (records, employeesList) => {
    return filterVacationRequests(records, employeesList); // Misma lógica
  };

  /**
   * Filtra boletas de pago según permisos
   */
  const filterPayslips = (payslips) => {
    if (!employee) return [];

    // Super Admin y Admin ven todo
    if (employee.role === "super_admin" || employee.role === "admin") {
      return payslips;
    }

    // HR Read-only ve todo
    if (employee.role === "hr_readonly") {
      return payslips;
    }

    // Empleados y managers solo ven sus propias boletas
    return payslips.filter(slip => slip.employee_id === employee.id);
  };

  /**
   * Verifica si el usuario puede editar un empleado específico
   */
  const canEditEmployee = (targetEmployeeId) => {
    if (!hasPermission("employees.edit")) return false;
    
    // HR Read-only no puede editar nunca
    if (employee?.role === "hr_readonly") return false;
    
    return canAccessEmployee(targetEmployeeId);
  };

  /**
   * Verifica si el usuario puede ver un empleado específico
   */
  const canViewEmployee = (targetEmployeeId) => {
    if (!hasPermission("employees.view")) return false;
    return canAccessEmployee(targetEmployeeId);
  };

  return {
    filterEmployees,
    filterVacationRequests,
    filterAttendanceRecords,
    filterPayslips,
    canEditEmployee,
    canViewEmployee,
  };
};