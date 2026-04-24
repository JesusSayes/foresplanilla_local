import prisma from "../../config/prisma.js";

export const getByEmployeeAndDate = async (req, res) => {
  try {
    const { employee_id, date } = req.query;

    if (!employee_id || !date) {
      return res.status(400).json({
        error: "employee_id y date son obligatorios",
      });
    }

    const logs = await prisma.attendance_log.findMany({
      where: {
        employee_id,
        punch_date: new Date(date),
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
