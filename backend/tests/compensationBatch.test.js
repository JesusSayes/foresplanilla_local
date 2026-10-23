import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/prisma.js';
import { saveCompensation } from '../controllers/attendance/incidentController.js';

const rows = () => [
  { attendance_record_id: 'r1', incident_date: '2026-10-01', late_minutes_to_adjust: 12, hours_to_adjust: 0 },
  { attendance_record_id: 'r2', incident_date: '2026-10-02', late_minutes_to_adjust: 0, hours_to_adjust: 0.2 },
].map(row => ({ ...row, employee_id: 'e1', codigo_solicitud: 'COMP-test', incident_type: 'Compensación de Tardanza', status: 'Pendiente' }));
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } });
function harness(t, { fail = false, previous = [] } = {}) {
  let saved = structuredClone(previous);
  let marks = [];
  const original = prisma.$transaction;
  prisma.$transaction = async (fn, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    let draft = structuredClone(saved); const pendingMarks = [];
    const result = await fn({
      attendance_incident: {
        findMany: async ({ where }) => where.codigo_solicitud
          ? draft.filter(row => row.codigo_solicitud === where.codigo_solicitud)
          : where.id?.in ? draft.filter(row => where.id.in.includes(row.id)) : [],
        deleteMany: async ({ where }) => { draft = draft.filter(row => !where.id.in.includes(row.id)); },
        create: async ({ data }) => { draft.push(data); return data; },
      },
      attendance_record: {
        findUnique: async ({ where }) => ({ id: where.id, employee_id: 'e1', date: where.id === 'r1' ? '2026-10-01' : '2026-10-02', late_minutes: 12, overtime_hours_25: 0.2 }),
        update: async ({ where }) => {
          if (fail && where.id === 'r2') throw new Error('Fallo en segunda fecha');
          pendingMarks.push(where.id);
        },
      },
    });
    saved = draft; marks.push(...pendingMarks); return result;
  };
  t.after(() => { prisma.$transaction = original; });
  return { call: async (body, scope = null) => {
    const res = response();
    await saveCompensation({ body, accessibleEmployeeIds: scope, access: { permissions: new Set(['system.admin']) } }, res);
    return res;
  }, saved: () => saved, marks: () => marks };
}

test('solicitud completa y reintento no duplican reservas ni actualizaciones', async t => {
  const h = harness(t);
  assert.equal((await h.call({ incidents: rows() })).statusCode, 201);
  assert.equal((await h.call({ incidents: rows() })).statusCode, 201);
  assert.equal(h.saved().length, 2);
  assert.deepEqual(h.marks(), ['r1', 'r2']);
});

test('fallo al marcar segunda fecha revierte toda la solicitud y conserva edición anterior', async t => {
  const previous = [{ ...rows()[0], id: 'old', codigo_solicitud: 'COMP-old' }];
  const h = harness(t, { fail: true, previous });
  assert.equal((await h.call({ incidents: rows(), replaceIds: ['old'] })).statusCode, 500);
  assert.deepEqual(h.saved(), previous);
  assert.deepEqual(h.marks(), []);
});

test('no permite reemplazar una solicitud aprobada', async t => {
  const previous = [{ ...rows()[0], id: 'old', codigo_solicitud: 'COMP-old', status: 'Aprobada' }];
  const h = harness(t, { previous });
  assert.equal((await h.call({ incidents: rows(), replaceIds: ['old'] })).statusCode, 409);
  assert.deepEqual(h.saved(), previous);
});

test('valida alcance y equilibrio de minutos antes de guardar', async t => {
  const h = harness(t);
  assert.equal((await h.call({ incidents: rows() }, [])).statusCode, 403);
  assert.equal((await h.call({ incidents: rows().slice(0, 1) })).statusCode, 400);
  const tooMuch = rows().map(row => ({ ...row, late_minutes_to_adjust: row.late_minutes_to_adjust * 2, hours_to_adjust: row.hours_to_adjust * 2 }));
  assert.equal((await h.call({ incidents: tooMuch })).statusCode, 400);
  assert.deepEqual(h.saved(), []);
});
