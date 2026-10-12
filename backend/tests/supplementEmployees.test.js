import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/database.js';
import prisma from '../config/prisma.js';
import { listAccessibleEmployees } from '../controllers/employeeController.js';

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const requested = ['payroll.view_all', 'payroll.create', 'payroll.calculate', 'vacations.view_all', 'vacations.manage'];

for (const permission of requested) {
  for (const admin of [false, true]) {
    test(`búsqueda con ${permission}, administrador=${admin}, respeta alcance`, async t => {
      const employees = [{ id: 'e1', site: 'Lima' }];
      const previous = prisma.employee;
      prisma.employee = { findMany: async () => [...employees, { id: 'e2', site: 'Cusco' }] };
      t.after(() => { prisma.employee = previous; });
      t.mock.method(pool, 'query', async (sql, params) => {
        assert.equal(sql.includes('WHERE id = ANY'), !admin);
        assert.deepEqual(params, admin ? [] : [['e1']]);
        return { rows: employees };
      });
      const res = response();
      await listAccessibleEmployees({ query: { permissions: permission }, access: {
        employee: { id: 'e1', site: 'Lima' },
        permissions: new Set(admin ? ['system.admin'] : [permission]),
        hasCustomRoles: true,
        roles: [{ permissions: [permission], site_restricted: true, allowed_sites: ['Lima'] }],
      } }, res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, employees);
    });
  }
}

test('búsqueda de suplementos rechaza usuarios sin permisos sin consultar empleados', async t => {
  t.mock.method(pool, 'query', () => { assert.fail('No debe consultar empleados'); });
  const res = response();
  await listAccessibleEmployees({ query: { permissions: requested.join(',') }, access: {
    permissions: new Set(['payroll.view_own']),
  } }, res);
  assert.equal(res.statusCode, 403);
});
