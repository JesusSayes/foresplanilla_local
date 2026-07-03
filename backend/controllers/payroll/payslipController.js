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

    const formattedPayslips = payslips.map(p => {

      let paymentDate = null;

      if (p.payment_date) {
        const d = new Date(p.payment_date);
        if (!isNaN(d.getTime())) paymentDate = d;
      }

      return {
        id: generate24HexId(),
        created_date: new Date(),
        updated_date: new Date(),
        created_by: p.created_by || "system",
        employee_id: p.employee_id || null,
        period: p.period || null,
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
        is_sample: p.is_sample || false
      };

    });

    console.log("registros a insertar:", formattedPayslips.length);

    const chunkSize = 50;

    for (let i = 0; i < formattedPayslips.length; i += chunkSize) {

      const chunk = formattedPayslips.slice(i, i + chunkSize);

      console.log(`insertando chunk ${i} - ${i + chunk.length}`);

      await prisma.payslip.createMany({
        data: chunk,
        skipDuplicates: true
      });

    }

    console.log("bulkCreate terminado");

    const result = await prisma.payslip.findMany({
      where: {
        payroll_number: formattedPayslips[0].payroll_number
      }
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
