import prisma from '../../config/prisma.js';

export const correctVacationWeekends = async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!['admin', 'super_admin'].includes(req.access?.employee?.role)) {
    return res.status(403).json({ error: 'Solo administradores pueden ejecutar esta corrección' });
  }
  try {
    const where = { status: 'Vacaciones' };
    if (req.accessibleEmployeeIds !== null) where.employee_id = { in: req.accessibleEmployeeIds || [] };
    const result = await prisma.$transaction(async tx => {
      const records = await tx.attendance_record.findMany({ where, select: { id: true, date: true } });
      const ids = records.filter(record => [0, 6].includes(new Date(record.date).getUTCDay())).map(record => record.id);
      let corrected = 0;
      // Lotes acotados para no superar el límite de parámetros de PostgreSQL.
      for (let i = 0; i < ids.length; i += 500) {
        const updated = await tx.attendance_record.updateMany({
          where: { ...where, id: { in: ids.slice(i, i + 500) } },
          data: {
            worked_hours: 0, regular_hours: 0, overtime_hours_25: 0, overtime_hours_35: 0,
            is_late: false, late_minutes: 0, is_absent: false,
            scheduled_start: '', scheduled_end: '', updated_date: new Date(),
          },
        });
        corrected += updated.count;
      }
      return { success: true, corrected, totalVacationRecords: records.length, weekendRecords: ids.length };
    }, { timeout: 60000 });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
