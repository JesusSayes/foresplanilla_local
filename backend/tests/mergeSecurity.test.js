import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import users from '../routes/users.js';
import logs from '../routes/sync/logs.js';
import mailer from '../routes/mailer.js';

test('las rutas administrativas rechazan empleados sin permisos antes de ejecutar operaciones', async (t) => {
  const originalFindFirst = prisma.employee.findFirst;
  const originalFindMany = prisma.user_role.findMany;
  const originalSecret = process.env.JWT_SECRET;
  t.after(() => {
    prisma.employee.findFirst = originalFindFirst;
    prisma.user_role.findMany = originalFindMany;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  prisma.employee.findFirst = async () => ({ id: 'employee-test', role: 'empleado' });
  prisma.user_role.findMany = async () => [];
  process.env.JWT_SECRET = 'merge-test-secret';
  const token = jwt.sign({ email: 'employee@example.test' }, process.env.JWT_SECRET);
  for (const [router, method, url] of [
    [users, 'GET', '/'], [users, 'POST', '/'], [users, 'PUT', '/user-id'],
    [users, 'DELETE', '/user-id'], [logs, 'GET', '/'], [logs, 'POST', '/'],
    [logs, 'PUT', '/log-id'], [logs, 'DELETE', '/log-id'],
    [mailer, 'POST', '/invite-user'],
  ]) {
    for (const authenticated of [false, true]) {
      await new Promise((resolve, reject) => {
        const req = { method, url, headers: authenticated ? { authorization: 'Bearer ' + token } : {}, body: {} };
        const res = {
          status(code) { this.statusCode = code; return this; },
          json(body) {
            try {
              assert.equal(this.statusCode, authenticated ? 403 : 401, method + ' ' + url);
              assert.ok(body.error);
              resolve();
            } catch (error) { reject(error); }
          },
        };
        router.handle(req, res, error => reject(error || new Error('La ruta permitió continuar sin autorización')));
      });
    }
  }
});
