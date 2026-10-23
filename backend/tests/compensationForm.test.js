import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import * as reconciliation from '../../src/lib/attendanceReconciliation.js';
import * as metrics from '../../src/lib/attendanceMetrics.js';
import * as dates from '../../src/lib/dateUtils.js';
import * as dateFns from 'date-fns';
import { es } from 'date-fns/locale';

// Ejecutar los manejadores reales del JSX con un estado de hooks controlado.
// No sustituye una prueba visual en navegador.
const source = readFileSync(new URL('../../src/components/attendance/CompensationModal.jsx', import.meta.url), 'utf8');

const compiled = transformSync(source, { loader: 'jsx', format: 'cjs', jsx: 'transform' }).code;
const employee = { id: 'e1', first_name: 'Empleado', last_name: 'Prueba' };
const authorizers = [
  { id: 'a1', first_name: 'Ana', last_name: 'Uno', status: 'Activo' },
  { id: 'a2', first_name: 'Bea', last_name: 'Dos', status: 'Activo' },
];
const fixture = () => ({
  employee, periodStart: '2026-09-25', periodEnd: '2026-09-26',
  periodRecords: [
    { id: 'r1', employee_id: 'e1', overtime_authorized: true, date: '2026-09-25', late_minutes: 12, overtime_hours_25: 0, overtime_hours_35: 0 },
    { id: 'r2', employee_id: 'e1', overtime_authorized: true, date: '2026-09-26', late_minutes: 0, overtime_hours_25: '0.20', overtime_hours_35: '0.00' },
  ], allEmployees: authorizers,
  editMode: true, pendingCompensations: [{ authorizer_id: 'a1', justification: 'Prueba' }],
  onClose() {}, onSubmit() {},
});
function harness(overrides = {}) {
  let index = 0; const state = []; let tree;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const key = index++;
      if (!(key in state)) state[key] = typeof initial === 'function' ? initial() : initial;
      return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }];
    },
    useMemo: fn => fn(),
  };
  const dependencies = {
    react: { __esModule: true, default: react, ...react },
    '@/lib/attendanceReconciliation': reconciliation, '@/lib/attendanceMetrics': metrics, '@/lib/dateUtils': dates,
    'date-fns': dateFns, 'date-fns/locale': { es },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => dependencies[name] || new Proxy({}, { get: (_, key) => key }), module, module.exports);
  const props = { ...fixture(), ...overrides };
  const render = () => { index = 0; tree = module.exports.default(props); return tree; };
  const nodes = () => {
    const result = [];
    const walk = node => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') { result.push(node); walk(node.props?.children); }
    };
    walk(tree); return result;
  };
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null || typeof node === 'boolean' ? '' : String(node);
  const find = predicate => { const node = nodes().find(predicate); assert.ok(node, 'Control no encontrado'); return node; };
  const button = label => find(node => (node.type === 'Button' || node.type === 'button') && text(node).includes(label));
  const click = async label => { await button(label).props.onClick(); render(); };
  render(); return { props, render, nodes, find, button, click, text: () => text(tree) };
}

test('Seleccionar días asigna HE numéricas y registra la compensación equilibrada', async () => {
  let submitted;
  const h = harness({ onSubmit: async (...args) => { submitted = args; } });
  await h.click('Seleccionar días con compensación');
  assert.match(h.text(), /12 min compensados/);
  await h.click('Actualizar compensación');
  assert.equal(submitted[0].length, 2);
  assert.equal(submitted[0].reduce((s, d) => s + d.overtimeMinutes, 0), 12);
  assert.equal(submitted[0].reduce((s, d) => s + d.lateMinutes, 0), 12);
  assert.equal(submitted[2].id, 'a1');
});

test('Auto por fila cubre tardanza manual y repetirlo no duplica HE', async () => {
  let submitted;
  const h = harness({ onSubmit: async list => { submitted = list; } });
  h.find(n => n.type === 'Checkbox').props.onCheckedChange(true); h.render();
  h.find(n => n.type === 'Input' && n.props.placeholder === 'tard').props.onChange({ target: { value: '12' } }); h.render();
  for (let i = 0; i < 2; i++) {
    h.find(n => n.type === 'Button' && n.props.title?.startsWith('Auto-completar')).props.onClick(); h.render();
  }
  await h.click('Actualizar compensación');
  assert.equal(submitted.reduce((s, d) => s + d.overtimeMinutes, 0), 12);
});

test('Auto-completar todo asigna HE posteriores y no envía filas sin minutos', async () => {
  let submitted;
  const h = harness({ onSubmit: async list => { submitted = list; } });
  h.find(n => n.type === 'Checkbox').props.onCheckedChange(true); h.render();
  await h.click('Auto-completar todo'); await h.click('Auto-completar todo');
  await h.click('Actualizar compensación');
  assert.equal(submitted.reduce((s, d) => s + d.overtimeMinutes, 0), 12);
  assert.ok(submitted.every(d => d.lateMinutes > 0 || d.overtimeMinutes > 0));
});

test('sin HE, sin selección y saldo inválido producen mensajes sin enviar', async () => {
  const props = fixture(); props.periodRecords[1].overtime_hours_25 = 0;
  const h = harness({ ...props, onSubmit: () => assert.fail('No debe enviar') });
  await h.click('Actualizar compensación'); assert.match(h.text(), /Seleccione al menos un día/);
  await h.click('Seleccionar días con compensación'); assert.match(h.text(), /No hay días con horas extras/);
  h.find(n => n.type === 'Checkbox').props.onCheckedChange(true); h.render();
  await h.click('Auto-completar todo'); assert.match(h.text(), /No hay horas extras/);
  h.find(n => n.type === 'Input' && n.props.placeholder === 'tard').props.onChange({ target: { value: '12' } }); h.render();
  await h.click('Actualizar compensación'); assert.match(h.text(), /cantidades iguales/);
});

test('carga tardía y cambio de autorizador actualizan resumen y payload sin borrar minutos', async () => {
  let submitted;
  const h = harness({ allEmployees: [], onSubmit: async (...args) => { submitted = args; } });
  h.props.allEmployees = authorizers; h.render(); assert.match(h.text(), /Autorizador|Ana Uno/);
  await h.click('Seleccionar días con compensación');
  await h.click('Cambiar'); await h.click('Bea');
  assert.match(h.text(), /Autorizador: Bea Dos/);
  h.props.allEmployees = authorizers.map(a => ({ ...a, position: 'Nuevo cargo' })); h.render();
  assert.match(h.text(), /Nuevo cargo/);
  await h.click('Actualizar compensación');
  assert.equal(submitted[2].id, 'a2'); assert.equal(submitted[1], 'Prueba'); assert.equal(submitted[0].length, 2);
});

test('muestra error del servidor y permite reintentar después del envío', async () => {
  let fail;
  const h = harness({ onSubmit: () => new Promise((_, reject) => { fail = reject; }) });
  await h.click('Seleccionar días con compensación');
  const pending = h.button('Actualizar compensación').props.onClick(); h.render();
  assert.equal(h.button('Guardando').props.disabled, true);
  fail({ response: { data: { error: 'Permiso insuficiente' } } }); await pending; h.render();
  assert.match(h.text(), /Permiso insuficiente/); assert.equal(h.button('Actualizar compensación').props.disabled, false);
});

for (const [lateDate, overtimeDate, allowed] of [['2026-09-30', '2026-09-01', false], ['2026-09-01', '2026-09-30', true], ['2026-09-01', '2026-09-16', true], ['2026-09-01', '2026-09-17', true]]) {
  for (const action of ['Seleccionar días con compensación', 'Auto-completar todo']) {
    test(`regla de main limita fechas con ${action}: ${lateDate} / ${overtimeDate}`, async () => {
      let submitted;
      const props = fixture();
      props.periodRecords[0].date = lateDate;
      props.periodRecords[1].date = overtimeDate;
      const h = harness({ ...props, periodStart: '2026-09-01', periodEnd: '2026-09-30', onSubmit: async list => { submitted = list; } });
      if (action === 'Auto-completar todo') {
        for (const checkbox of h.nodes().filter(n => n.type === 'Checkbox')) {
          checkbox.props.onCheckedChange(true);
        }
        h.render();
      }
      await h.click(action);
      if (!allowed) assert.match(h.text(), /No se encontraron coincidencias válidas/);
      await h.click('Actualizar compensación');
      if (!allowed) {
        assert.equal(submitted, undefined);
        return;
      }
      assert.ok(submitted);
      assert.equal(submitted.find(d => d.date === lateDate).lateMinutes, 12);
      assert.equal(submitted.find(d => d.date === overtimeDate).overtimeMinutes, 12);
    });
  }
}

test('compensación cruza diciembre y enero y consume primero el saldo anterior', async () => {
  let submitted;
  const h = harness({
    periodStart: '2027-01-01', periodEnd: '2027-01-02',
    prevMonthStart: '2026-12-26', prevMonthEnd: '2026-12-31',
    periodRecords: [
      { id: 'r1', employee_id: 'e1', overtime_authorized: true, date: '2027-01-01', late_minutes: 30 },
      { id: 'r2', employee_id: 'e1', overtime_authorized: true, date: '2027-01-02', overtime_hours_25: 1 },
    ],
    prevMonthRecords: [{ id: 'prev', employee_id: 'e1', overtime_authorized: true, date: '2026-12-31', overtime_hours_25: '0.25', overtime_hours_35: '0.00' }],
    onSubmit: async list => { submitted = list; },
  });
  await h.click('Seleccionar días con compensación');
  await h.click('Actualizar compensación');
  assert.ok(submitted);
  assert.equal(submitted.find(d => d.date === '2026-12-31').overtimeMinutes, 15);
  assert.equal(submitted.find(d => d.date === '2027-01-02').overtimeMinutes, 15);
  assert.equal(submitted.find(d => d.date === '2027-01-01').lateMinutes, 30);
});

test('matching anterior limita seis días, respeta cambio de año y no reutiliza saldo', () => {
  const result = metrics.computeCrossDayCompensationWithPrevMonth(
    [{ date: '2027-01-01', lateMinutes: 20 }, { date: '2027-01-02', lateMinutes: 20 }],
    [{ date: '2027-01-03', overtimeMinutes: 10 }],
    [{ date: '2026-12-26', overtimeMinutes: 15 }, { date: '2026-12-25', overtimeMinutes: 100 }, { date: '2026-11-30', overtimeMinutes: 100 }],
  );
  assert.equal(result.totalCompensated, 25);
  assert.equal(result.assignments[0].compensableDate, '2026-12-26');
  assert.equal(result.assignments.filter(a => a.compensableDate === '2026-12-26').reduce((s, a) => s + a.minutes, 0), 15);
});

for (const [lateDate, otDate] of [['2026-09-30', '2026-10-30'], ['2026-12-31', '2027-01-30']]) {
  test(`carga posterior permite guardar a 30 días: ${lateDate} → ${otDate}`, async () => {
    let submitted;
    const h = harness({
      periodStart: lateDate.slice(0, 7) + '-01', periodEnd: lateDate,
      overtimeWindowEnd: otDate,
      periodRecords: [{ id: 'late', employee_id: 'e1', date: lateDate, late_minutes: 12 }],
      nextPeriodRecords: [{ id: 'later', employee_id: 'e1', date: otDate, late_minutes: 90, overtime_hours_25: '0.20', overtime_authorized: true }],
      onSubmit: async list => { submitted = list; },
    });
    await h.click('Seleccionar días con compensación');
    await h.click('Actualizar compensación');
    assert.equal(submitted.find(r => r.recordId === 'later').overtimeMinutes, 12);
    assert.equal(submitted.find(r => r.recordId === 'later').lateMinutes, 0);
    assert.equal(submitted.reduce((sum, r) => sum + r.lateMinutes, 0), 12);
  });
}

test('HE posteriores reservadas no se reutilizan y carga incompleta no permite enviar', async () => {
  let submitted;
  const props = {
    periodStart: '2026-09-01', periodEnd: '2026-09-30', overtimeWindowEnd: '2026-10-30',
    periodRecords: [{ id: 'late', employee_id: 'e1', date: '2026-09-30', late_minutes: 12 }],
    nextPeriodRecords: [{ id: 'later', employee_id: 'e1', date: '2026-10-10', overtime_hours_25: 0.2, overtime_authorized: true }],
    onSubmit: async list => { submitted = list; },
  };
  const reserved = harness({ ...props, existingCompensations: [{ id: 'reserved', employee_id: 'e1', incident_date: '2026-10-10', status: 'Pendiente', hours_to_adjust: 0.2 }] });
  await reserved.click('Seleccionar días con compensación');
  await reserved.click('Actualizar compensación');
  assert.equal(submitted, undefined);
  const loading = harness({ ...props, dataUnavailable: true });
  await loading.click('Seleccionar días con compensación');
  assert.equal(loading.button('Actualizar compensación').props.disabled, true);
  await loading.click('Actualizar compensación');
  assert.equal(submitted, undefined);
});

for (const [status, linked, expected] of [['Pendiente', true, 6], ['Rechazada', true, 12], ['Aprobada', true, 12], ['Aprobada', false, 6]]) {
  test(`saldo parcial ${status}, aplicado=${linked}: conserva minutos disponibles`, async () => {
    let submitted;
    const h = harness({ existingCompensations: [{
      id: 'reservation', employee_id: 'e1', incident_date: '2026-09-25', status,
      attendance_record_id: linked ? 'r1' : null, late_minutes_to_adjust: 6,
    }], onSubmit: async list => { submitted = list; } });
    await h.click('Seleccionar días con compensación');
    await h.click('Actualizar compensación');
    assert.equal(submitted.reduce((sum, d) => sum + d.lateMinutes, 0), expected);
  });
}
