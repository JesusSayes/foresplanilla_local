import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../../src/components/attendance/OvertimeAlertsTab.jsx', import.meta.url), 'utf8');
const code = transformSync(source, { loader: 'jsx', format: 'cjs' }).code;
function render({ canEditAttendance = true, failLoad = false, selected = false, canReviewApproved = false, failRecalculate = false, failUpdate = false } = {}) {
  const calls = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => [initial instanceof Set && selected ? new Set(["a1"]) : initial, () => {}], useMemo: fn => fn(),
  };
  const dependencies = {
    react: { __esModule: true, default: react, ...react },
    '@/api/entitiesClient': { entitiesAPI: {
      AttendanceRecord: {
        get: async id => { calls.push(['get', id]); if (failLoad) throw new Error('unavailable'); return { id, notes: 'Nota' }; },
        update: async (...args) => { calls.push(['record', ...args]); if (failUpdate) throw new Error('update failed'); },
      },
      OvertimeAlert: { filter: async () => [
        { attendance_record_id: 'r1', employee_id: 'e1', alert_date: '2026-10-01' },
        { attendance_record_id: 'r1', employee_id: 'e1', alert_date: '2026-10-01' },
        { attendance_record_id: 'r2', employee_id: 'e2', alert_date: '2026-10-01' },
      ], update: async (...args) => calls.push(['alert', ...args]) },
    } },
    '@/services/recalcularAsistenciaService': { __esModule: true, default: {
      recalculate: async (...args) => { calls.push(['recalculate', ...args]); if (failRecalculate) throw new Error('recalculate failed'); },
    } },
    '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: args => calls.push(['invalidate', args]) }) },
    '@/lib/dateUtils': { todayLima: () => '2026-10-08', parseDateLima: value => new Date(value) },
    'date-fns': { format: () => '01 oct 2026' },
    sonner: { toast: { success: () => calls.push(['success']), error: () => calls.push(['error']), warning: message => calls.push(['warning', message]), info: () => {} } },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => dependencies[name] || new Proxy({}, { get: (_, key) => key }), module, module.exports);
  const tree = module.exports.default({
    overtimeAlerts: [{ id: 'a1', employee_id: 'e1', attendance_record_id: 'r1', alert_date: '2026-10-01', overtime_hours: '2.83', status: 'Pendiente' }],
    allEmployees: [{ id: 'e1', first_name: 'Ana', last_name: 'Pérez' }], todayRecords: [],
    accessibleEmployeeIds: new Set(['e1']), getEmployeeScheduleForDate: () => null,
    currentUser: { email: 'reviewer@example.test' }, canEditAttendance, canReviewApproved,
    onEditRecord: record => calls.push(['edit', record.id]),
  });
  const buttons = [];
  let bulk;
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.props?.onAceptarHE) bulk = node;
    if (node.type === 'Button' && !node.props.children.flat().includes('Ejecución masiva') && !node.props.children.flat().includes('Limpiar')) buttons.push(node);
    walk(node.props?.children);
  };
  walk(tree);
  return { calls, buttons, bulk };
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
  assert.deepEqual(calls.filter(([kind]) => kind !== 'invalidate'), [['get', 'r1'], ['error']]);
  assert.equal(render({ canEditAttendance: false }).buttons.length, 0);
});


test('autoriza y descarta selecciones mediante APIs locales', async () => {
  const accepted = render({ selected: true });
  await accepted.bulk.props.onAceptarHE();
  assert.deepEqual(accepted.calls[0], ['get', 'r1']);
  assert.ok(accepted.calls.some(([kind]) => kind === 'recalculate'));
  assert.ok(accepted.calls.some(([kind, data]) => kind === 'invalidate' && data.queryKey[0] === 'compensationRecords'));
  const dismissed = render({ selected: true });
  await dismissed.bulk.props.onDescartar();
  assert.deepEqual(dismissed.calls[0], ['alert', 'a1', { status: 'Descartado' }]);
});

test('la ejecución masiva informa fallos y respeta permisos', async () => {
  const failed = render({ selected: true, failLoad: true });
  await failed.bulk.props.onAceptarHE();
  assert.ok(failed.calls.some(([kind, message]) => kind === 'warning' && message === '0 aprobadas, 1 con error'));
  assert.ok(!failed.calls.some(([kind]) => kind === 'alert'));
  const forbidden = render({ selected: true, canEditAttendance: false });
  await forbidden.bulk.props.onAceptarHE();
  await forbidden.bulk.props.onDescartar();
  await forbidden.bulk.props.onCorregir();
  assert.deepEqual(forbidden.calls, []);
});

test('la corrección masiva carga registros históricos', async () => {
  const { calls, bulk } = render({ selected: true });
  await bulk.props.onCorregir();
  assert.deepEqual(calls, [['get', 'r1'], ['edit', 'r1']]);
});

test('la corrección manual calcula tardanza diurna, nocturna y a medianoche', () => {
  const source = readFileSync(new URL('../../src/components/attendance/AttendanceValidationModal.jsx', import.meta.url), 'utf8');
  const helper = source.slice(source.indexOf('const computeTardiness ='), source.indexOf('// ─── Detectar motivo'));
  const compute = new Function(`${helper}; return computeTardiness;`)();
  assert.deepEqual(compute({ scheduled_start: '09:00', scheduled_end: '18:00' }, '09:20'), { is_late: true, late_minutes: 20 });
  assert.deepEqual(compute({ scheduled_start: '09:00', scheduled_end: '18:00' }, '09:10'), { is_late: false, late_minutes: 0 });
  assert.deepEqual(compute({ scheduled_start: '22:00', scheduled_end: '06:00' }, '00:00'), { is_late: true, late_minutes: 120 });
  assert.deepEqual(compute({ scheduled_start: '09:00', scheduled_end: '18:00', clock_in_2: '10:00' }, '09:20'), { is_late: true, late_minutes: 20 });
});


test('revisión de autorizadas usa APIs locales, deduplica y respeta alcance', async () => {
  const { calls, buttons } = render({ canReviewApproved: true });
  await buttons[0].props.onClick();
  assert.equal(calls.filter(([kind]) => kind === 'record').length, 1);
  assert.deepEqual(calls.find(([kind]) => kind === 'recalculate'), ['recalculate', 'e1', '2026-10-01', '2026-10-01']);
  assert.ok(calls.some(([kind, data]) => kind === 'invalidate' && data.queryKey[0] === 'allAttendanceRecords'));
});

test('revisión no informa éxito si falla actualizar autorización', async () => {
  const { calls, buttons } = render({ canReviewApproved: true, failUpdate: true });
  await buttons[0].props.onClick();
  assert.ok(calls.some(([kind]) => kind === 'warning'));
  assert.ok(!calls.some(([kind]) => kind === 'recalculate' || kind === 'success'));
});

test('fallo de recálculo refresca asistencias guardadas sin anunciar éxito', async () => {
  const { calls, buttons } = render({ failRecalculate: true });
  await buttons[1].props.onClick();
  assert.ok(calls.some(([kind]) => kind === 'alert'));
  assert.ok(calls.some(([kind, data]) => kind === 'invalidate' && data.queryKey[0] === 'allAttendanceRecords'));
  assert.ok(calls.some(([kind]) => kind === 'error'));
  assert.ok(!calls.some(([kind]) => kind === 'success'));
});
