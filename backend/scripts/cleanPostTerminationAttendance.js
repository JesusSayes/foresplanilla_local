import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function cleanPostTerminationAttendance({ apply = false } = {}) {
  const shouldApply = apply === true || apply === "true";
  const invalidRecords = await prisma.attendance_record.findMany({
    where: {
      employee_id: {
        in: (await prisma.employee.findMany({
          where: { termination_date: { not: null } },
          select: { id: true },
        })).map(employee => employee.id),
      },
    },
    select: {
      id: true,
      employee_id: true,
      date: true,
    },
  });

  const terminationDates = new Map(
    (await prisma.employee.findMany({
      where: { termination_date: { not: null } },
      select: { id: true, termination_date: true },
    })).map(employee => [
      employee.id,
      employee.termination_date.toISOString().slice(0, 10),
    ])
  );

  const recordsToDelete = invalidRecords.filter(record =>
    record.date.toISOString().slice(0, 10) > terminationDates.get(record.employee_id)
  );

  let deleted = 0;
  if (shouldApply && recordsToDelete.length > 0) {
    const ids = recordsToDelete.map(record => record.id);
    const batchSize = 500;

    for (let index = 0; index < ids.length; index += batchSize) {
      const batchIds = ids.slice(index, index + batchSize);
      await prisma.$transaction(async tx => {
        await tx.$executeRaw(
          Prisma.sql`
            INSERT INTO attendance_record_backup (
              employee_id, date, clock_in, clock_out, scheduled_start, scheduled_end,
              worked_hours, is_late, late_minutes, is_absent, status, notes, id,
              created_date, updated_date, created_by_id, created_by, is_sample,
              regular_hours, overtime_hours_25, overtime_hours_35, overtime_authorized
            )
            SELECT
              employee_id, date, clock_in, clock_out, scheduled_start, scheduled_end,
              worked_hours, is_late, late_minutes, is_absent, status, notes, id,
              created_date, updated_date, created_by_id, created_by, is_sample,
              regular_hours, overtime_hours_25, overtime_hours_35, overtime_authorized
            FROM attendance_record
            WHERE id IN (${Prisma.join(batchIds)})
          `
        );
        const result = await tx.attendance_record.deleteMany({
          where: { id: { in: batchIds } },
        });
        deleted += result.count;
      });
    }
  }

  return {
    apply: shouldApply,
    affected: recordsToDelete.length,
    backed_up: deleted,
    deleted,
    sample: recordsToDelete.slice(0, 20),
  };
}

if (process.argv[1].endsWith("cleanPostTerminationAttendance.js")) {
  const apply = process.argv.includes("--apply=true");
  cleanPostTerminationAttendance({ apply })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
