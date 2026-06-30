import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Debug: lista un resumen de empleados (total, activos, primer registro).
 * Requiere el email de un empleado admin/super_admin.
 */
export async function debugListEmployee({ requestingEmail } = {}) {
  if (!requestingEmail) {
    throw new Error('requestingEmail es requerido');
  }

  const adminEmployee = await prisma.employee.findFirst({
    where: { work_email: requestingEmail },
  });

  if (!adminEmployee || !['admin', 'super_admin'].includes(adminEmployee.role)) {
    throw new Error('Acceso denegado');
  }

  const allEmployees = await prisma.employee.findMany({ orderBy: { created_date: 'desc' } });
  const active = allEmployees.filter(e => e.status === "Activo");

  return {
    total:       allEmployees.length,
    active:      active.length,
    firstId:     allEmployees[0]?.id,
    firstCode:   allEmployees[0]?.employee_code,
    firstStatus: allEmployees[0]?.status,
  };
}

if (process.argv[1].endsWith('debugListEmployee.js')) {
  const [,, requestingEmail] = process.argv;
  debugListEmployee({ requestingEmail })
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
