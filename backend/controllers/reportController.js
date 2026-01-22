import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getEmployeeReport = async (req, res) => {
  try {
    const { status, department, position } = req.query;

    const where = {};
    if (status) where.status = status;
    if (department) where.department_name = department;
    if (position) where.position = position;

    const employees = await prisma.employee.findMany({
      where,
      select: {
        id: true,
        employee_code: true,
        first_name: true,
        last_name: true,
        document_number: true,
        position: true,
        department_name: true,
        status: true,
        hire_date: true,
        base_salary: true
      }
    });

    res.json(employees);
  } catch (error) {
    console.error('Error al generar reporte de empleados:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
};

export const getAttendanceReport = async (req, res) => {
  try {
    const { start_date, end_date, employee_id } = req.query;

    const where = {};
    if (start_date && end_date) {
      where.date = {
        gte: new Date(start_date),
        lte: new Date(end_date)
      };
    }
    if (employee_id) where.employee_id = employee_id;

    const records = await prisma.attendance_record.findMany({
      where,
      orderBy: { date: 'desc' }
    });

    res.json(records);
  } catch (error) {
    console.error('Error al generar reporte de asistencia:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
};

export const getVacationReport = async (req, res) => {
  try {
    const { employee_id, year } = req.query;

    const where = {};
    if (employee_id) where.employee_id = employee_id;
    if (year) {
      const startDate = new Date(`${year}-01-01`);
      const endDate = new Date(`${year}-12-31`);
      where.period_start = {
        gte: startDate,
        lte: endDate
      };
    }

    const balances = await prisma.vacation_balance.findMany({
      where,
      orderBy: { period_start: 'desc' }
    });

    res.json(balances);
  } catch (error) {
    console.error('Error al generar reporte de vacaciones:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
};

export const getPayrollReport = async (req, res) => {
  try {
    const { month, year, employee_id } = req.query;

    const where = {};
    if (month) where.month = parseInt(month);
    if (year) where.year = parseInt(year);
    if (employee_id) where.employee_id = employee_id;

    const concepts = await prisma.payroll_concept.findMany({
      where,
      orderBy: [
        { year: 'desc' },
        { month: 'desc' }
      ]
    });

    res.json(concepts);
  } catch (error) {
    console.error('Error al generar reporte de planilla:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
};
