import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/prisma.js';
import { filter as filterRecords } from '../controllers/attendance/recordController.js';
import { filter as filterIncidents } from '../controllers/attendance/incidentController.js';
import { correctVacationWeekends } from '../controllers/attendance/vacationWeekendController.js';
import { vacationAttendanceData } from '../services/vacationAttendance.js';

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const mockModel = (t, model, implementation) => {
  const original = prisma[model];
  prisma[model] = implementation;
  t.after(() => { prisma[model] = original; });
};

for (const [name, handler, model, field] of [
  ['asistencia', filterRecords, 'attendance_record', 'date'],
  ['incidencias', filterIncidents, 'attendance_incident', 'incident_date'],
]) {
  test(`${name}: acepta filtros de main, conserva alcance y orden`, async t => {
    const findMany = t.mock.fn(async () => []);
    mockModel(t, model, { findMany });
    const res = response();
    await handler({ body: { [field]: { $gte: '2026-09-01', $lte: '2026-09-30' } }, query: { sort: `-${field}` }, accessibleEmployeeIds: ['e1'] }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(findMany.mock.calls[0].arguments[0], {
      where: { employee_id: { in: ['e1'] }, [field]: { gte: new Date('2026-09-01T00:00:00.000Z'), lte: new Date('2026-09-30T23:59:59.999Z') } },
      orderBy: { [field]: 'desc' },
    });
  });
  test(`${name}: mantiene fecha exacta y acceso propio`, async t => {
    const findMany = t.mock.fn(async () => []);
    mockModel(t, model, { findMany });
    const res = response();
    await handler({ body: { [field]: '2026-09-24', employee_id: 'e1' }, query: {}, accessibleEmployeeIds: ['e1'] }, res);
    assert.equal(res.statusCode, 200);
    const where = findMany.mock.calls[0].arguments[0].where;
    assert.equal(where.employee_id, 'e1');
    assert.equal((where[field].gte || where[field]).toISOString(), '2026-09-24T00:00:00.000Z');
  });
  test(`${name}: rechaza rangos inválidos y empleados ajenos sin consultar`, async t => {
    const findMany = t.mock.fn(async () => []);
    mockModel(t, model, { findMany });
    for (const value of [{}, { $gte: 'incorrecto' }, { $gte: '2026-02-30' }, { $gte: '2026-09-30', $lte: '2026-09-01' }, { $ne: '2026-09-24' }]) {
      const res = response();
      await handler({ body: { [field]: value }, query: {}, accessibleEmployeeIds: ['e1'] }, res);
      assert.equal(res.statusCode, 400);
    }
    const res = response();
    await handler({ body: { employee_id: 'e2' }, query: {}, accessibleEmployeeIds: ['e1'] }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(findMany.mock.callCount(), 0);
  });
}

test('corrección local modifica solo vacaciones de fin de semana en el alcance permitido', async t => {
  const writes = [];
  const tx = { attendance_record: {
    findMany: async ({ where }) => {
      assert.deepEqual(where, { status: 'Vacaciones', employee_id: { in: ['e1'] } });
      return ['2026-09-25', '2026-09-26', '2026-09-27'].map((date, id) => ({ id: String(id), date: new Date(date) }));
    },
    updateMany: async args => { writes.push(args); return { count: args.where.id.in.length }; },
  } };
  t.mock.method(prisma, '$transaction', async fn => fn(tx));
  const res = response();
  await correctVacationWeekends({ user: {}, access: { employee: { role: 'admin' } }, accessibleEmployeeIds: ['e1'] }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, corrected: 2, totalVacationRecords: 3, weekendRecords: 2 });
  assert.deepEqual(writes[0].where, { status: 'Vacaciones', employee_id: { in: ['e1'] }, id: { in: ['1', '2'] } });
  assert.equal(writes[0].data.worked_hours, 0);
  assert.equal(writes[0].data.scheduled_start, '');
  assert.equal(Object.hasOwn(writes[0].data, 'clock_in'), false);
});

test('corrección requiere autenticación y rol administrador', async t => {
  const transaction = t.mock.method(prisma, '$transaction', async () => { throw new Error('No debe consultar'); });
  for (const [req, status] of [[{}, 401], [{ user: {}, access: { employee: { role: 'empleado' } } }, 403]]) {
    const res = response();
    await correctVacationWeekends(req, res);
    assert.equal(res.statusCode, status);
  }
  assert.equal(transaction.mock.callCount(), 0);
});

test('normalización posterior no restaura horarios de vacaciones en sábado o domingo', () => {
  const schedule = { employee_id: 'e1', is_active: true, saturday_start: '08:00', saturday_end: '17:00', sunday_start: '08:00', sunday_end: '17:00' };
  for (const date of ['2026-09-26', '2026-09-27']) {
    const data = vacationAttendanceData({ employee_id: 'e1', status: 'Vacaciones', date }, { id: 'e1' }, [schedule], []);
    assert.equal(data.worked_hours, 0);
    assert.equal(data.regular_hours, 0);
    assert.equal(data.scheduled_start, '');
    assert.equal(data.scheduled_end, '');
  }
});
