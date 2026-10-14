import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import prisma from '../config/prisma.js';
import * as dependents from '../controllers/derechohabienteController.js';
import { update as updateRecord } from '../controllers/attendance/recordController.js';
import { update as updateAlert } from '../controllers/attendance/overtimeAlertController.js';
import { hasApprovedVacation } from '../services/vacationAttendance.js';

const mockModel = (t, name, methods) => {
  const original = prisma[name];
  prisma[name] = methods;
  t.after(() => { prisma[name] = original; });
};
const call = async (handler, body, scope = ['e1', 'e2']) => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  await handler({ body, query: {}, params: { id: 'r1' }, accessibleEmployeeIds: scope }, res);
  return res;
};

test('derechohabientes conserva apellidos separados, fecha y sexo al guardar y editar', async t => {
  let stored;
  mockModel(t, 'derechohabiente', {
    create: async ({ data }) => { stored = data; return stored; },
    findUnique: async () => stored,
    update: async ({ data }) => {
      stored = { ...stored, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
      return stored;
    },
  });
  const data = { employee_id: 'e1', first_name: 'Ana', last_name: 'Del Río Pérez', last_name_paterno: 'Del Río', last_name_materno: 'Pérez', birth_date: '2007-06-28', gender: 'F', document_number: '001234567' };
  assert.equal((await call(dependents.create, data)).statusCode, 201);
  const result = await call(dependents.update, { first_name: 'Ana María' });
  assert.equal(result.body.last_name_paterno, 'Del Río');
  assert.equal(result.body.last_name_materno, 'Pérez');
  assert.equal(result.body.birth_date.toISOString().slice(0, 10), '2007-06-28');
  assert.equal(result.body.gender, 'F');
  assert.equal(result.body.document_number, '001234567');
  assert.equal((await call(dependents.update, { gender: null })).body.gender, null);
});

test('filtro de derechohabientes conserva trabajador y alcance simultáneamente', async t => {
  mockModel(t, 'derechohabiente', { findMany: async ({ where }) => {
    assert.deepEqual(where.AND, [{ employee_id: 'e1' }, { employee_id: { in: ['e1', 'e2'] } }]);
    return [{ employee_id: 'e1' }];
  } });
  assert.deepEqual((await call(dependents.filter, { employee_id: 'e1' })).body, [{ employee_id: 'e1' }]);
});

test('vacaciones consulta empleado, tipo, estados aprobados y ambos extremos inclusivos', async t => {
  mockModel(t, 'vacation_request', { findFirst: async ({ where }) => {
    assert.equal(where.employee_id, 'e1');
    assert.equal(where.request_type, 'Vacaciones');
    assert.deepEqual(where.status.in, ['Aprobada', 'Aprobado']);
    assert.equal(where.start_date.lte.toISOString(), '2026-10-09T00:00:00.000Z');
    assert.equal(where.end_date.gte.toISOString(), '2026-10-09T00:00:00.000Z');
    return { id: 'vacation' };
  } });
  assert.equal(await hasApprovedVacation(prisma, 'e1', '2026-10-09'), true);
});

for (const [handler, model, body] of [
  [updateRecord, 'attendance_record', { overtime_authorized: true }],
  [updateAlert, 'overtime_alert', { status: 'Autorizado' }],
]) {
  test(`${model}: rechaza autorización durante vacaciones antes de escribir`, async t => {
    mockModel(t, model, {
      findUnique: async () => ({ id: 'r1', employee_id: 'e1', date: new Date('2026-10-09'), alert_date: new Date('2026-10-09') }),
      update: async () => assert.fail('No debe escribir'),
    });
    mockModel(t, 'vacation_request', { findFirst: async () => ({ id: 'vacation' }) });
    t.mock.method(prisma, '$transaction', async () => assert.fail('No debe escribir'));
    assert.equal((await call(handler, body)).statusCode, 409);
    assert.equal((await call(handler, body, ['other'])).statusCode, 403);
  });
}

test('histórico conserva varios trabajadores y filtra boletas e importes por búsqueda', () => {
  const source = readFileSync(new URL('../../src/pages/PayrollManagement.jsx', import.meta.url), 'utf8');
  const grouping = source.slice(source.indexOf('  const getAllPayslipsByMonth ='), source.indexOf('  const handleDeletePayroll'));
  const filtering = source.slice(source.indexOf('                    const allGroups = getAllPayslipsByMonth();'), source.indexOf('                    return groups.length === 0'));
  const history = new Function('allPayslips', 'allEmployees', 'historySearchTerm', `const historyYearFilter = 2026, historyMonthFilter = 'all', historyTypeFilter = 'all'; ${grouping} ${filtering} return groups;`);
  const slips = [
    { id: 'p1', employee_id: 'e1', year: 2026, month: 10, payroll_type: 'Quincenal', net_pay: 500 },
    { id: 'p2', employee_id: 'e2', year: 2026, month: 10, payroll_type: 'Quincenal', net_pay: 600 },
  ];
  const employees = [{ id: 'e1', first_name: 'Ana', document_number: '001234567' }, { id: 'e2', first_name: 'Bea' }];
  assert.equal(history(slips, employees, '')[0].payslips.length, 2);
  assert.deepEqual(history(slips, employees, '001234567')[0].payslips, [slips[0]]);
  assert.deepEqual(history(slips, employees, 'Bea')[0].payslips, [slips[1]]);
  assert.deepEqual(history(slips, employees, 'nadie'), []);
});
