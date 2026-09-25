import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/prisma.js';
import controller from '../controllers/attendance/recalcularAsistenciaController.js';

// Sustituir delegados completos: los métodos de Prisma son propiedades de un Proxy.
const mockModel = (t, model, method, implementation) => {
  const original = prisma[model];
  const mock = t.mock.fn(implementation);
  prisma[model] = { [method]: mock };
  t.after(() => { prisma[model] = original; });
  return mock;
};

const request = (date_from, date_to = date_from) => ({
  user: { email: 'rrhh@example.test' },
  accessibleEmployeeIds: ['e1'],
  body: { employee_id: 'e1', date_from, date_to },
});
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

for (const [name, from, to, expectedFrom, expectedTo] of [
  ['fecha simple', '2026-09-24', '2026-09-24', '2026-09-24', '2026-09-24'],
  ['ISO de alerta', '2026-09-24T00:00:00.000Z', '2026-09-24T00:00:00.000Z', '2026-09-24', '2026-09-24'],
  ['rango mixto', '2026-09-01T00:00:00Z', '2026-09-24', '2026-09-01', '2026-09-24'],
  ['offset sin desplazar el día', '2026-09-24T23:00:00-05:00', '2026-09-24T23:00:00-05:00', '2026-09-24', '2026-09-24'],
]) {
  test(`recálculo acepta ${name} y consulta las fechas normalizadas en PostgreSQL`, async t => {
    mockModel(t, 'employee', 'findUnique', async () => ({ id: 'e1' }));
    mockModel(t, 'work_schedule', 'findMany', async () => []);
    const records = mockModel(t, 'attendance_record', 'findMany', async () => []);
    const incidents = mockModel(t, 'attendance_incident', 'findMany', async () => []);
    mockModel(t, 'overtime_alert', 'findMany', async () => []);
    const res = response();
    await controller.recalcularAsistencia(request(from, to), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.range, { date_from: expectedFrom, date_to: expectedTo });
    const expectedRange = { gte: new Date(expectedFrom), lte: new Date(expectedTo) };
    assert.deepEqual(records.mock.calls[0].arguments[0].where.date, expectedRange);
    assert.deepEqual(incidents.mock.calls[0].arguments[0].where.incident_date, expectedRange);
  });
}

for (const [name, req, status] of [
  ['fecha vacía', request(''), 400],
  ['formato no admitido', request('24/09/2026'), 400],
  ['hora ISO inválida', request('2026-09-24T99:00:00.000Z'), 400],
  ['sufijo inválido', request('2026-09-24Tincorrecto'), 400],
  ['rango invertido mixto', request('2026-09-25T00:00:00.000Z', '2026-09-24'), 400],
  ['sin autenticación', { ...request('2026-09-24T00:00:00.000Z'), user: null }, 401],
  ['sin acceso al empleado', { ...request('2026-09-24T00:00:00.000Z'), accessibleEmployeeIds: [] }, 403],
]) {
  test(`recálculo rechaza ${name} antes de consultar PostgreSQL`, async t => {
    const employee = mockModel(t, 'employee', 'findUnique', async () => { throw new Error('No debe consultar'); });
    const res = response();
    await controller.recalcularAsistencia(req, res);
    assert.equal(res.statusCode, status);
    assert.equal(employee.mock.callCount(), 0);
  });
}
