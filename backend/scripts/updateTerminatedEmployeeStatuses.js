import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function updateTerminatedEmployeeStatuses({ date = new Date() } = {}) {
  const todayInLima = date.toLocaleDateString("sv-SE", { timeZone: "America/Lima" });
  const todayStart = new Date(`${todayInLima}T00:00:00.000Z`);
  const result = await prisma.employee.updateMany({
    where: {
      status: { not: "Cesado" },
      // La fecha de cese es el último día laboral permitido.
      termination_date: { not: null, lt: todayStart },
    },
    data: {
      status: "Cesado",
      updated_date: new Date(),
    },
  });

  return { success: true, date: todayInLima, updated: result.count };
}

if (process.argv[1].endsWith("updateTerminatedEmployeeStatuses.js")) {
  updateTerminatedEmployeeStatuses()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
