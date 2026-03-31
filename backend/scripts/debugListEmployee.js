import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Debug: lista un resumen de empleados (total, activos, primer registro).
 * Útil para verificar conectividad y datos básicos.
 */
export async function debugListEmployee() {
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
  debugListEmployee()
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
