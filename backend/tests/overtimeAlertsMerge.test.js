import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../../src/components/attendance/OvertimeAlertsTab.jsx', import.meta.url), 'utf8');
const code = transformSync(source, { loader: 'jsx', format: 'cjs' }).code;
function render({ canEditAttendance = true, failLoad = false } = {}) {
  const calls = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => [initial, () => {}], useMemo: fn => fn(),
  };
  const dependencies = {
    react: { __esModule: true, default: react, ...react },
    '@/api/entitiesClient': { entitiesAPI: {
      AttendanceRecord: {
        get: async id => { calls.push(['get', id]); if (failLoad) throw new Error('unavailable'); return { id, notes: 'Nota' }; },
        update: async (...args) => calls.push(['record', ...args]),
      },
      OvertimeAlert: { update: async (...args) => calls.push(['alert', ...args]) },
    } },
    '@/services/recalcularAsistenciaService': { __esModule: true, default: {
      recalculate: async (...args) => calls.push(['recalculate', ...args]),
    } },
    '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: args => calls.push(['invalidate', args]) }) },
    '@/lib/dateUtils': { todayLima: () => '2026-10-08', parseDateLima: value => new Date(value) },
    'date-fns': { format: () => '01 oct 2026' },
    sonner: { toast: { success: () => calls.push(['success']), error: () => calls.push(['error']) } },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => dependencies[name] || new Proxy({}, { get: (_, key) => key }), module, module.exports);
  const tree = module.exports.default({
    overtimeAlerts: [{ id: 'a1', employee_id: 'e1', attendance_record_id: 'r1', alert_date: '2026-10-01', overtime_hours: '2.83', status: 'Pendiente' }],
    allEmployees: [{ id: 'e1', first_name: 'Ana', last_name: 'Pérez' }], todayRecords: [],
    accessibleEmployeeIds: new Set(['e1']), getEmployeeScheduleForDate: () => null,
    currentUser: { email: 'reviewer@example.test' }, canEditAttendance,
    onEditRecord: record => calls.push(['edit', record.id]),
  });
  const buttons = [];
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Button') buttons.push(node);
    walk(node.props?.children);
  };
  walk(tree);
  return { calls, buttons };
}

test('autoriza una alerta histórica usando su registro y servicios locales', async () => {
  const { calls, buttons } = render();
  await buttons[1].props.onClick();
  assert.deepEqual(calls[0], ['get', 'r1']);
  assert.equal(calls[1][2].overtime_authorized, true);
  assert.equal(calls[1][2].notes, 'Nota | HE aceptadas: 2.83h (2026-10-01)');
  assert.equal(calls[2][2].status, 'Autorizado');
  assert.deepEqual(calls[3], ['recalculate', 'e1', '2026-10-01', '2026-10-01']);
  assert.ok(calls.some(([kind, data]) => kind === 'invalidate' && data.queryKey[0] === 'compensationRecords'));
});

test('carga la marcación histórica antes de abrir la corrección', async () => {
  const { calls, buttons } = render();
  await buttons[0].props.onClick();
  assert.deepEqual(calls, [['get', 'r1'], ['edit', 'r1']]);
});

test('no autoriza si falla la carga y oculta acciones sin permiso', async () => {
  const { calls, buttons } = render({ failLoad: true });
  await buttons[1].props.onClick();
  assert.deepEqual(calls, [['get', 'r1'], ['error']]);
  assert.equal(render({ canEditAttendance: false }).buttons.length, 0);
});
