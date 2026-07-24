import prisma from "../../config/prisma.js";
import { canAccessEmployee, employeeScopeWhere } from "../../middleware/authorization.js";

import { generate24HexId } from '../../utils/idGenerator.js'

const MODEL = prisma.payslip;

export const getAll = async (req, res) => {
  try {

    const desc = true;
    const sortField = 'id'

    const payslips = await MODEL.findMany({
      where: employeeScopeWhere(req),
      orderBy: { [sortField]: desc ? 'desc' : 'asc' },
    });

    res.json(payslips);

  } catch (error) {
    console.error('Error obteniendo payslips', error);
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {

    const payslip = await prisma.payslip.findUnique({
      where: { id: req.params.id },
      include: { employee: true }
    });

    if (!payslip)
      return res.status(404).json({ error: 'Payslip not found' });

    if (!canAccessEmployee(req, payslip.employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    res.json(payslip);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    if (req.body?.employee_id && !canAccessEmployee(req, req.body.employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    const payslip = await prisma.payslip.create({
      data: req.body
    });

    res.status(201).json(payslip);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const bulkCreate = async (req, res) => {

  try {

    console.log("bulkCreate iniciado");

    const payslips = req.body;

    if (!Array.isArray(payslips) || payslips.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No hay payslips para insertar",
        data: []
      });
    }

    const forbiddenPayslip = payslips.find(p => p?.employee_id && !canAccessEmployee(req, p.employee_id));
    if (forbiddenPayslip) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    const formattedPayslips = payslips.map(p => {

      let paymentDate = null;
      let attendancePeriodStart = null;
      let attendancePeriodEnd = null;

      if (p.payment_date) {
        const d = new Date(p.payment_date);
        if (!isNaN(d.getTime())) paymentDate = d;
      }

      if (p.attendance_period_start) {
        const d = new Date(p.attendance_period_start);
        if (!isNaN(d.getTime())) attendancePeriodStart = d;
      }

      if (p.attendance_period_end) {
        const d = new Date(p.attendance_period_end);
        if (!isNaN(d.getTime())) attendancePeriodEnd = d;
      }

      return {
        id: generate24HexId(),
        created_date: new Date(),
        updated_date: new Date(),
        created_by: p.created_by || "system",
        employee_id: p.employee_id || null,
        period: p.period || null,
        attendance_period_start: attendancePeriodStart,
        attendance_period_end: attendancePeriodEnd,
        month: p.month ? Number(p.month) : null,
        year: p.year ? Number(p.year) : null,
        payroll_type: p.payroll_type || null,
        payroll_number: p.payroll_number || null,
        advance_payment_id: p.advance_payment_id || null,
        worked_days: Number(p.worked_days || 0),
        non_worked_days: Number(p.non_worked_days || 0),
        subsidized_days: Number(p.subsidized_days || 0),
        regular_hours: Number(p.regular_hours || 0),
        overtime_hours: Number(p.overtime_hours || 0),
        base_salary: Number(p.base_salary || 0),
        family_allowance: Number(p.family_allowance || 0),
        activity_cost_amount: Number(p.activity_cost_amount || 0),
        food_cost_amount: Number(p.food_cost_amount || 0),
        transport_cost_amount: Number(p.transport_cost_amount || 0),
        overtime_pay: Number(p.overtime_pay || 0),
        bonuses: Number(p.bonuses || 0),
        commissions: Number(p.commissions || 0),
        other_income: Number(p.other_income || 0),
        total_income: Number(p.total_income || 0),
        pension_deduction: Number(p.pension_deduction || 0),
        health_insurance: Number(p.health_insurance || 0),
        income_tax: Number(p.income_tax || 0),
        tardiness_discount: Number(p.tardiness_discount || 0),
        absence_discount: Number(p.absence_discount || 0),
        loan_deduction: Number(p.loan_deduction || 0),
        advance_deduction: Number(p.advance_deduction || 0),
        other_deductions: Number(p.other_deductions || 0),
        total_deductions: Number(p.total_deductions || 0),
        net_pay: Number(p.net_pay || 0),
        payment_date: paymentDate,
        pdf_url: p.pdf_url || null,
        status: p.status || "generated",
        notes: p.notes || null,
        created_by_id: p.created_by_id || null,
        is_sample: p.is_sample || false,
        ...(p.calculation_summary != null
          ? { calculation_summary: p.calculation_summary }
          : {})
      };

    });

    console.log("registros a insertar:", formattedPayslips.length);

    const chunkSize = 50;
    const replaceExisting = req.query.replace === 'true';
    const persistPayslips = async (db) => {
      if (replaceExisting) {
        const replacementGroups = Object.values(formattedPayslips.reduce((groups, payslip) => {
          const key = `${payslip.month}-${payslip.year}-${payslip.payroll_type}`;
          groups[key] ??= {
            month: payslip.month,
            year: payslip.year,
            payroll_type: payslip.payroll_type,
            employeeIds: []
          };
          groups[key].employeeIds.push(payslip.employee_id);
          return groups;
        }, {}));

        await db.payslip.deleteMany({
          where: {
            OR: replacementGroups.map(group => ({
              month: group.month,
              year: group.year,
              payroll_type: group.payroll_type,
              employee_id: { in: group.employeeIds }
            }))
          }
        });
      }

      for (let i = 0; i < formattedPayslips.length; i += chunkSize) {
        const chunk = formattedPayslips.slice(i, i + chunkSize);
        console.log(`insertando chunk ${i} - ${i + chunk.length}`);
        await db.payslip.createMany({ data: chunk, skipDuplicates: true });
      }
    };

    if (replaceExisting) {
      await prisma.$transaction(persistPayslips);
    } else {
      await persistPayslips(prisma);
    }

    console.log("bulkCreate terminado");

    const result = await prisma.payslip.findMany({
      where: { id: { in: formattedPayslips.map(payslip => payslip.id) } }
    });

    res.json({
      success: true,
      message: "Payslips creados correctamente",
      data: result
    });

  } catch (error) {

    console.error("Error en bulkCreate:", error);

    res.status(500).json({
      success: false,
      message: error.message,
      data: []
    });
  }
};

export const update = async (req, res) => {
  try {
    const current = await prisma.payslip.findUnique({
      where: { id: req.params.id }
    });

    if (!current) return res.status(404).json({ error: 'Payslip not found' });
    if (!canAccessEmployee(req, current.employee_id) ||
        (req.body?.employee_id && !canAccessEmployee(req, req.body.employee_id))) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    const payslip = await prisma.payslip.update({
      where: { id: req.params.id },
      data: req.body
    });

    res.json(payslip);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const current = await prisma.payslip.findUnique({
      where: { id: req.params.id }
    });

    if (!current) return res.status(404).json({ error: 'Payslip not found' });
    if (!canAccessEmployee(req, current.employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    await prisma.payslip.delete({
      where: { id: req.params.id }
    });

    res.status(204).send();

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {

    const desc = true;
    const field = 'id';
    const filters = req.body || {};
    const scopeWhere = employeeScopeWhere(req);

    const payslips = await MODEL.findMany({
      where: {
        ...filters,
        ...scopeWhere,
      },
      orderBy: { [field]: desc ? 'desc' : 'asc' }
    });

    res.json(payslips);

  } catch (error) {
    console.error('Error filtrando payslips', error);
    res.status(500).json({ error: error.message });
  }
};

const controller = {
  getAll,
  getById,
  create,
  bulkCreate,
  update,
  delete: remove,
  filter
}

export default controller
