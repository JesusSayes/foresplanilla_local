import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/database.js';
import prisma from '../config/prisma.js';
import templates from '../controllers/contracts/template/Controller.js';
import clauses, { reorder } from '../controllers/contracts/clauseController.js';
import { buildOrderedSections } from '../../src/lib/contractSections.js';

const call = async (handler, body = {}, id = 'abc123') => {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send() { return this; },
  };
  await handler({ body, params: { id }, query: {}, user: { userId: 'owner', email: 'owner@example.test' } }, res);
  return res;
};

test('duplica plantillas con ID nuevo, JSON serializado y propietario autenticado', async t => {
  let captured;
  t.mock.method(pool, 'query', async (sql, values) => {
    captured = { sql, values };
    return { rows: [{ id: 'new' }] };
  });
  const res = await call(templates.create, {
    id: 'old', created_by_id: 'other', template_name: 'Copia', contract_title: 'Contrato',
    standard_clause_order: ['salary', 'object', 'functions', 'duration', 'schedule'],
  });
  assert.equal(res.statusCode, 201);
  assert.match(captured.sql, /"contract_title"/);
  assert.ok(captured.values.includes('["salary","object","functions","duration","schedule"]'));
  assert.ok(!captured.values.includes('old'));
  assert.ok(!captured.values.includes('other'));
  assert.ok(captured.values.includes('owner'));
});

test('rechaza órdenes incompletos, repetidos o de tipo incorrecto antes de escribir', async t => {
  const db = t.mock.method(pool, 'query', async () => { throw new Error('No debe consultar'); });
  for (const order of [['salary'], ['object', 'object', 'duration', 'salary', 'schedule'], 'salary']) {
    assert.equal((await call(templates.update, { standard_clause_order: order })).statusCode, 400);
  }
  assert.equal(db.mock.callCount(), 0);
});

test('lectura local conserva los campos nuevos y actualización usa parámetros', async t => {
  t.mock.method(pool, 'query', async (sql, values) => {
    if (sql.startsWith('UPDATE')) {
      assert.match(sql, /"final_text_order" = \$1/);
      assert.equal(values.at(-1), 'abc123');
      assert.equal(values[0], '["domicile","termination","benefits","obligations"]');
    }
    return { rows: [{ id: 'abc123', final_text_order: ['domicile', 'termination', 'benefits', 'obligations'] }] };
  });
  assert.equal((await call(templates.update, { final_text_order: ['domicile', 'termination', 'benefits', 'obligations'] })).statusCode, 200);
  assert.equal((await call(templates.getById)).body.final_text_order[0], 'domicile');
});

test('cláusulas traducen order/type y conservan IDs de texto', async t => {
  const original = prisma.contract_clause.update;
  t.after(() => { prisma.contract_clause.update = original; });
  prisma.contract_clause.update = async args => {
    assert.equal(args.where.id, 'abc123');
    assert.equal(args.data.contract_order, 3);
    assert.equal(args.data.contract_type, 'obligatoria');
    assert.equal(args.data.order, undefined);
    return { id: 'abc123', ...args.data };
  };
  const res = await call(clauses.update, { order: 3, type: 'obligatoria' });
  assert.equal(res.body.order, 3);
  assert.equal(res.body.type, 'obligatoria');
});

test('reordenamiento asigna posiciones únicas en una sola transacción', async t => {
  const updates = [];
  const original = prisma.contract_clause.update;
  t.after(() => { prisma.contract_clause.update = original; });
  prisma.contract_clause.update = args => { updates.push(args); return args; };
  const transaction = t.mock.method(prisma, '$transaction', async operations => {
    assert.equal(operations.length, 3);
  });
  assert.equal((await call(reorder, { ids: ['c', 'a', 'b'] })).statusCode, 204);
  assert.deepEqual(updates.map(x => [x.where.id, x.data.contract_order]), [['c', 0], ['a', 1], ['b', 2]]);
  assert.equal(transaction.mock.callCount(), 1);
  assert.equal((await call(reorder, { ids: ['a', 'a'] })).statusCode, 400);
  assert.equal(transaction.mock.callCount(), 1);
});

test('secciones históricas incompletas no omiten ni duplican contenido', () => {
  const sections = buildOrderedSections({ standard_clause_order: ['salary', 'salary', 'unknown'] }, [{ id: 'extra', title: 'Extra', content: 'Texto' }]);
  assert.equal(sections.filter(s => s.id === 'salary').length, 1);
  assert.equal(sections.filter(s => s.type === 'standard').length, 5);
  assert.deepEqual(sections.filter(s => s.number).map(s => s.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(sections[2].id, 'salary');
});

test('orden unificado intercala cláusulas sin duplicar ni omitir secciones', () => {
  const sections = buildOrderedSections({
    unified_clause_order: ['extra', 'salary', 'extra', 'deleted'],
    final_text_order: ['domicile', 'domicile'],
  }, [{ id: 'extra', title: 'Extra', content: 'Texto' }, { id: 'new', title: 'Nueva' }]);
  assert.deepEqual(sections.slice(2, 4).map(s => s.id), ['extra', 'salary']);
  assert.equal(sections.filter(s => s.id === 'extra').length, 1);
  assert.equal(sections.filter(s => s.type === 'standard').length, 5);
  assert.equal(sections.filter(s => s.type === 'final').length, 4);
  assert.ok(sections.some(s => s.id === 'new'));
  assert.deepEqual(sections.filter(s => s.number).map(s => s.number), Array.from({ length: 11 }, (_, i) => i + 1));
});

test('API persiste orden unificado y rechaza IDs repetidos o inválidos', async t => {
  const db = t.mock.method(pool, 'query', async (sql, values) => {
    assert.match(sql, /"unified_clause_order" = \$1/);
    assert.equal(values[0], '["extra","salary"]');
    return { rows: [{ id: 'abc123', unified_clause_order: ['extra', 'salary'] }] };
  });
  assert.equal((await call(templates.update, { unified_clause_order: ['extra', 'salary'] })).statusCode, 200);
  for (const order of [['extra', 'extra'], [42], 'salary', ['']]) {
    assert.equal((await call(templates.update, { unified_clause_order: order })).statusCode, 400);
  }
  assert.equal(db.mock.callCount(), 1);
});

test('autorizar HE guarda estado y resolución en una transacción sin campos nuevos en Prisma', async t => {
  const { update } = await import('../controllers/attendance/overtimeAlertController.js');
  const original = prisma.overtime_alert.findUnique;
  t.after(() => { prisma.overtime_alert.findUnique = original; });
  prisma.overtime_alert.findUnique = async () => ({ id: 'alert1', employee_id: 'emp1' });
  let saved = false;
  t.mock.method(prisma, '$transaction', async callback => callback({
    overtime_alert: { update: async ({ data }) => {
      assert.equal(data.status, 'Autorizado');
      assert.equal(data.resolution_date, undefined);
      return { id: 'alert1', ...data };
    } },
    $queryRawUnsafe: async (sql, ...values) => {
      assert.match(sql, /"resolution_date" = \$2::date/);
      assert.deepEqual(values, ['admin@example.test', '2026-09-11', 'Aceptadas', 'alert1']);
      saved = true;
      return [{ id: 'alert1', status: 'Autorizado', resolution_notes: 'Aceptadas' }];
    },
  }));
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await update({ params: { id: 'alert1' }, accessibleEmployeeIds: ['emp1'], body: {
    status: 'Autorizado', resolved_by: 'admin@example.test', resolution_date: '2026-09-11', resolution_notes: 'Aceptadas',
  } }, res);
  assert.equal(saved, true);
  assert.equal(res.body.resolution_notes, 'Aceptadas');
});
