import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLoanInstallments, revertLoanInstallments } from '../services/loanPayroll.js';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import * as payrollUtils from '../../src/lib/payrollUtils.js';

const module = { exports: {} };
new Function('require', 'module', 'exports', transformSync(readFileSync(new URL('../../src/lib/loanPayroll.js', import.meta.url), 'utf8'), { format: 'cjs' }).code)(
  name => { assert.equal(name, '@/lib/payrollUtils'); return payrollUtils; }, module, module.exports,
);
const { buildInstallmentsByEmployee, sumLoanDeduction } = module.exports;

const matches = (row, where = {}) => Object.entries(where).every(([k, v]) =>
  v && typeof v === 'object' && 'in' in v ? v.in.includes(row[k]) : row[k] === v);
function setup() {
  const loans = [{ id: 'l1', employee_id: 'e1', status: 'Activo', is_deleted: false, total_installments: 1 }];
  const installments = [{ id: 'i1', loan_id: 'l1', month: 10, year: 2026, status: 'Pendiente', amount: '33.34' }];
  const model = rows => ({
    findMany: async ({ where } = {}) => rows.filter(r => matches(r, where)).map(r => ({ ...r })),
    findUnique: async ({ where }) => rows.find(r => matches(r, where)),
    count: async ({ where }) => rows.filter(r => matches(r, where)).length,
    update: async ({ where, data }) => Object.assign(rows.find(r => matches(r, where)), data),
    updateMany: async ({ where, data }) => {
      const selected = rows.filter(r => matches(r, where));
      selected.forEach(r => Object.assign(r, data));
      return { count: selected.length };
    },
  });
  return { loans, installments, db: { loan: model(loans), loaninstallment: model(installments) } };
}
const payslip = { id: 'p1', employee_id: 'e1', month: 10, year: 2026, payroll_type: 'Mensual', loan_deduction: 33.34 };

test('aplica centavos, marca préstamo pagado y permite regenerar la última cuota', async () => {
  const { db, loans, installments } = setup();
  await applyLoanInstallments(db, [payslip]);
  assert.equal(installments[0].payslip_id, 'p1');
  assert.equal(installments[0].status, 'Aplicado');
  assert.equal(loans[0].status, 'Pagado');
  assert.equal(loans[0].installments_paid, 1);
  assert.equal(buildInstallmentsByEmployee(installments, loans).e1.length, 1);
  await revertLoanInstallments(db, ['p1']);
  assert.equal(loans[0].status, 'Activo');
  assert.equal(loans[0].installments_paid, 0);
  await applyLoanInstallments(db, [{ ...payslip, id: 'p2' }]);
  assert.equal(installments[0].payslip_id, 'p2');
});
test('rechaza descuento duplicado y montos desactualizados antes de aplicar cuotas', async () => {
  const { db, installments } = setup();
  await assert.rejects(applyLoanInstallments(db, [{ ...payslip, loan_deduction: 30 }]), { status: 409 });
  assert.equal(installments[0].status, 'Pendiente');
  await applyLoanInstallments(db, [payslip]);
  await assert.rejects(applyLoanInstallments(db, [{ ...payslip, id: 'p2' }]), { status: 409 });
});
test('eliminar boleta no reactiva préstamo eliminado ni cancelado', async () => {
  for (const deleted of [true, false]) {
    const { db, loans, installments } = setup();
    await applyLoanInstallments(db, [payslip]);
    loans[0].is_deleted = deleted;
    loans[0].status = 'Cancelado';
    await revertLoanInstallments(db, ['p1']);
    assert.equal(installments[0].status, deleted ? 'Omitido' : 'Pendiente');
    assert.equal(installments[0].payslip_id, null);
    assert.equal(loans[0].status, 'Cancelado');
  }
});
test('no aplica cuotas de otros períodos, empleados ni planillas quincenales', async () => {
  for (const patch of [{ month: 11 }, { employee_id: 'e2' }]) {
    const { db, installments } = setup();
    await assert.rejects(applyLoanInstallments(db, [{ ...payslip, ...patch }]), { status: 409 });
    assert.equal(installments[0].status, 'Pendiente');
  }
  const { db, installments } = setup();
  await applyLoanInstallments(db, [{ ...payslip, payroll_type: 'Quincenal' }]);
  assert.equal(installments[0].status, 'Pendiente');
});
test('agrupación excluye préstamos eliminados, cancelados y cuotas omitidas', () => {
  const { loans, installments } = setup();
  assert.deepEqual(buildInstallmentsByEmployee(installments, loans, 'Adicional'), {});
  assert.deepEqual(buildInstallmentsByEmployee(installments, [{ ...loans[0], is_deleted: true }]), {});
  assert.deepEqual(buildInstallmentsByEmployee(installments, [{ ...loans[0], status: 'Cancelado' }]), {});
  assert.deepEqual(buildInstallmentsByEmployee([{ ...installments[0], status: 'Omitido' }], loans), {});
  assert.equal(sumLoanDeduction([{ system_logic_type: 'loan_installment', calculated_amount: '33.34' }]), 33.34);
});
