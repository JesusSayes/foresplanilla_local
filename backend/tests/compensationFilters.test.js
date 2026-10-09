import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/prisma.js';
import { filter as records } from '../controllers/attendance/recordController.js';
import { filter as incidents } from '../controllers/attendance/incidentController.js';

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const mockQuery = (t, model, query) => {
  const previous = prisma[model];
  prisma[model] = { findMany: query };
  t.after(() => { prisma[model] = previous; });
};

for (const [scope, requested, expected] of [
  [null, ['e1', 'e2'], ['e1', 'e2']],
  [['e1'], ['e1', 'e2'], ['e1']],
  [[], ['e1'], []],
  [['e1'], [], []],
]) test(`filtrado de asistencias conserva alcance: ${JSON.stringify([scope, requested])}`, async t => {
  mockQuery(t, 'attendance_record', async ({ where, orderBy }) => {
    assert.deepEqual(where.employee_id, { in: expected });
    assert.deepEqual(orderBy, { date: 'desc' });
    return [];
  });
  const res = response();
  await records({ query: { sort: '-date' }, body: { employee_id: { $in: requested } }, accessibleEmployeeIds: scope }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
});

test('histórico filtra estados y período en servidor sin perder alcance por empleado', async t => {
  mockQuery(t, 'attendance_incident', async ({ where, orderBy }) => {
    assert.deepEqual(where.employee_id, { in: ['e1'] });
    assert.deepEqual(where.status, { in: ['Aprobada', 'Rechazada'] });
    assert.equal(where.incident_type, 'Compensación de Tardanza');
    assert.equal(where.incident_date.gte.toISOString(), '2026-10-01T00:00:00.000Z');
    assert.equal(where.incident_date.lte.toISOString(), '2026-10-31T23:59:59.999Z');
    assert.deepEqual(orderBy, { review_date: 'desc' });
    return [];
  });
  const res = response();
  await incidents({ query: { sort: '-review_date' }, accessibleEmployeeIds: ['e1'], body: {
    status: { $in: ['Aprobada', 'Rechazada'] }, incident_type: 'Compensación de Tardanza',
    incident_date: { $gte: '2026-10-01', $lte: '2026-10-31' },
  } }, res);
  assert.equal(res.statusCode, 200);
});

test('pendientes filtra autorizador y conserva filtros simples', async t => {
  mockQuery(t, 'attendance_incident', async ({ where }) => {
    assert.deepEqual(where, { employee_id: 'e1', authorizer_id: 'a1', status: 'Pendiente' });
    return [];
  });
  const res = response();
  await incidents({ query: {}, accessibleEmployeeIds: ['e1'], body: { employee_id: 'e1', status: 'Pendiente', authorizer_id: 'a1' } }, res);
  assert.equal(res.statusCode, 200);
});

for (const [handler, model, body] of [
  [records, 'attendance_record', { employee_id: { $in: 'e1' } }],
  [records, 'attendance_record', { employee_id: { $in: [null] } }],
  [records, 'attendance_record', { employee_id: { $ne: 'e1' } }],
  [incidents, 'attendance_incident', { status: { $in: 'Aprobada' } }],
  [incidents, 'attendance_incident', { status: { $in: [1] } }],
  [incidents, 'attendance_incident', { authorizer_id: { $in: ['a1'] } }],
]) test(`rechaza filtros inválidos: ${JSON.stringify(body)}`, async t => {
  mockQuery(t, model, async () => assert.fail('No debe consultar'));
  const res = response();
  await handler({ query: {}, body, accessibleEmployeeIds: null }, res);
  assert.equal(res.statusCode, 400);
});

test('mantiene rechazo de empleado individual fuera del alcance', async t => {
  mockQuery(t, 'attendance_record', async () => assert.fail('No debe consultar'));
  const res = response();
  await records({ query: {}, body: { employee_id: 'e2' }, accessibleEmployeeIds: ['e1'] }, res);
  assert.equal(res.statusCode, 403);
});
