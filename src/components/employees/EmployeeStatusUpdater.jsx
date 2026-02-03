import { entitiesAPI } from '@/api/entitiesClient';
import { format } from "date-fns";

/**
 * Actualiza automáticamente el estado de empleados según su fecha de cese
 * Esta función debe ejecutarse diariamente (por ejemplo, al cargar el dashboard de RRHH)
 */
export const updateEmployeeStatuses = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = format(today, "yyyy-MM-dd");

    // Obtener todos los empleados activos con fecha de cese
    const employees = await entitiesAPI.Employee.list(); // GET /api/employees?sort=-created_date

    // Si el backend ya soporta filtros, se podría hacer:
    // const employees = await entitiesAPI.Employee.filter(
    //   { status: { $in: ["Activo", "Suspendido"] }, termination_date: { $ne: null } }
    // );

    let updatedCount = 0;

    for (const employee of employees) {
      // Solo procesar empleados Activos o Suspendidos con fecha de cese
      if (!employee.termination_date || employee.status === "Cesado") {
        continue;
      }

      const termDate = new Date(employee.termination_date);
      termDate.setHours(0, 0, 0, 0);

      // Si la fecha de cese es hoy o anterior, actualizar a Cesado
      if (termDate <= today) {
        await entitiesAPI.Employee.update(employee.id, { status: "Cesado" });

        // Registrar el cambio en el historial
        await entitiesAPI.EmployeeChangeLog.create({
          employee_id: employee.id,
          field_changed: "status",
          old_value: employee.status,
          new_value: "Cesado",
          change_type: "Cambio de Estado",
          changed_by: "Sistema Automático",
          change_date: new Date().toISOString(),
          notes: `Estado actualizado automáticamente por fecha de cese: ${employee.termination_date}`
        });

        updatedCount++;
      }
    }

    return {
      success: true,
      updatedCount,
      message: `${updatedCount} empleado(s) actualizado(s) a estado Cesado`
    };
  } catch (error) {
    console.error("Error actualizando estados de empleados:", error);
    return {
      success: false,
      error: error.message,
      updatedCount: 0
    };
  }
};
