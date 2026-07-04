import prisma from "../../config/prisma.js";
import { canAccessEmployee } from "../../middleware/authorization.js";

const getLimaDayBounds = (dateStr) => {
  const dateOnly = String(dateStr || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;

  const start = new Date(`${dateOnly}T05:00:00.000Z`);
  const end = new Date(start.getTime() + (24 * 60 * 60 * 1000) - 1);

  return { start, end };
};

export const getByEmployeeAndDate = async (req, res) => {
  try {
    const { employee_id, date } = req.query;

    if (!employee_id || !date) {
      return res.status(400).json({
        error: "employee_id y date son obligatorios",
      });
    }
    if (!canAccessEmployee(req, employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });

    const bounds = getLimaDayBounds(date);
    if (!bounds) {
      return res.status(400).json({
        error: "date debe tener formato YYYY-MM-DD",
      });
    }

    const logs = await prisma.attendance_logs.findMany({
      where: {
        employee_id,
        punch_time: {
          gte: bounds.start,
          lte: bounds.end,
        },
      },
      orderBy: {
        punch_time: "asc",
      },
    });

    res.json(logs);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message,
    });
  }
};

export default {
  getByEmployeeAndDate,
};
