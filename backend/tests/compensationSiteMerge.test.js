import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/prisma.js';
import { update } from '../controllers/attendance/incidentController.js';

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const mockModel = (t, name, value) => {
  const previous = prisma[name]; prisma[name] = value;
  t.after(() => { prisma[name] = previous; });
};

for (const status of ['Aprobada', 'Rechazada']) {
  for (const scenario of ['permitido', 'solo lectura', 'solo edición', 'otro autorizador', 'otra sede']) {
    test(`compensaciones ${status}: ${scenario}`, async t => {
      const permission = scenario === 'solo lectura' ? 'attendance.view_all' : scenario === 'solo edición' ? 'attendance.edit' : 'attendance.approve_compensations';
      const role = { permissions: [permission], site_restricted: true, allowed_sites: ['Lima'] };
      // Un permiso de lectura sin restricción no debe ampliar el alcance de aprobación.
      const roles = [role, { permissions: ['attendance.view_all'], site_restricted: false }];
      const req = {
        params: { id: 'comp1' }, body: { status }, accessibleEmployeeIds: null,
        access: { employee: { id: 'authorizer', site: 'Lima' }, permissions: new Set([permission, 'attendance.view_all']), hasCustomRoles: true, roles },
      };
      let writes = 0;
      mockModel(t, 'attendance_incident', {
        findUnique: async () => ({ id: 'comp1', employee_id: 'e1', incident_type: 'Compensación de Tardanza', authorizer_id: scenario === 'otro autorizador' ? 'other' : 'authorizer' }),
        update: async ({ data }) => { writes++; return { id: 'comp1', ...data }; },
      });
      mockModel(t, 'employee', { findMany: async () => [{ id: 'e1', site: scenario === 'otra sede' ? 'Cusco' : 'Lima' }] });
      const res = response(); await update(req, res);
      assert.equal(res.statusCode, scenario === 'permitido' ? 200 : 403);
      assert.equal(writes, scenario === 'permitido' ? 1 : 0);
    });
  }
}

// Ejecutar los hooks de la página para comprobar cambios de sede y permisos.
const { readFileSync } = await import('node:fs');
const { transformSync } = await import('esbuild');
const pageSource = readFileSync(new URL('../../src/pages/CompensacionTardanzas.jsx', import.meta.url), 'utf8');
const pageCode = transformSync(pageSource, { loader: 'jsx', format: 'cjs' }).code;
function pageHarness(initialSites) {
  let allowed = initialSites, index = 0, effects = [], tree;
  const state = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const key = index++;
      if (!(key in state)) state[key] = initial;
      return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }];
    },
    useMemo: fn => fn(), useEffect: fn => effects.push(fn),
  };
  const employees = [{ id: 'lima', site: 'Lima' }, { id: 'cusco', site: 'Cusco' }];
  const dependencies = {
    react: { __esModule: true, default: react, ...react },
    '@/components/hooks/usePermissions': { usePermissions: () => ({
      hasPermission: () => true, loading: false,
      getAccessibleSites: () => allowed === null ? null : [...allowed],
    }) },
    '@tanstack/react-query': { useQuery: ({ queryKey }) => ({ data: queryKey[0] === 'sites' ? [{ id: '1', name: 'Lima' }, { id: '2', name: 'Cusco' }] : employees }) },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', pageCode)(name => dependencies[name] || new Proxy({}, { get: (_, key) => key }), module, module.exports);
  const render = () => {
    for (let n = 0; n < 2; n++) {
      index = 0; effects = []; tree = module.exports.default(); effects.forEach(fn => fn());
    }
  };
  const nodes = () => {
    const result = [];
    const walk = node => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') { result.push(node); walk(node.props?.children); }
    };
    walk(tree); return result;
  };
  render();
  return { render, nodes, setAllowed(value) { allowed = value; render(); } };
}

test('selector conserva la sede en nuevos renders y actualiza los empleados visibles', () => {
  const h = pageHarness(['Lima', 'Cusco']);
  const select = () => h.nodes().find(n => n.type === 'Select');
  assert.equal(select().props.disabled, false);
  select().props.onValueChange('Cusco'); h.render(); h.render();
  assert.equal(select().props.value, 'Cusco');
  const panel = h.nodes().find(n => n.props.accessibleEmployeeIds);
  assert.deepEqual([...panel.props.accessibleEmployeeIds], ['cusco']);
  h.setAllowed(['Lima']);
  assert.equal(select().props.value, 'Lima');
  assert.equal(select().props.disabled, true);
  h.setAllowed([]);
  assert.equal(select(), undefined);
  assert.equal(h.nodes().some(n => n.props.accessibleEmployeeIds), false);
});

test('acceso total permite cambiar y conservar la sede seleccionada', () => {
  const h = pageHarness(null);
  const select = () => h.nodes().find(n => n.type === 'Select');
  select().props.onValueChange('Lima'); h.render();
  assert.equal(select().props.value, 'Lima');
  assert.equal(select().props.disabled, false);
});
