import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
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
    { id: 'r1', employee_id: 'e1', date: '2026-09-25', late_minutes: 12, overtime_hours_25: 0, overtime_hours_35: 0 },
    { id: 'r2', employee_id: 'e1', date: '2026-09-26', late_minutes: 0, overtime_hours_25: '0.20', overtime_hours_35: '0.00' },
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
    '@/lib/attendanceMetrics': metrics, '@/lib/dateUtils': dates,
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
