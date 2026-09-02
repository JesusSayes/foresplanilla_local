import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStarsoftPayload } from '../controllers/starsoftController.js';

test('construye el mismo payload usado para enviar asientos a Starsoft', () => {
  const payload = buildStarsoftPayload([{
    cuenta: '621101',
    annomes: '2026-08',
    subdiario: '35',
    comprobante: '0001',
    fecha_registro: new Date('2026-08-31T00:00:00.000Z'),
    fecha_doc: '31/08/2026',
    tipo_anexo: 'T',
    cod_anexo: '12345678',
    tipo_doc: 'PL',
    nro_doc: null,
    fecha_vencimiento: '2026-09-15T14:30:45.000Z',
    importe: '2500.50',
    conversion_tc: 'VTA',
    tc: '3.75',
    glosa: 'PLANILLA AGOSTO 2026',
    glosa_mov: 'REMUNERACIÓN',
    anulado: false,
    debe_haber: 'D',
    centro_costos: 'ADM',
    moneda: 'PEN',
    medio_pago: '001',
  }]);

  assert.deepEqual(payload, [{
    cuenta: '621101',
    annomes: '202608',
    subdiario: '35',
    comprobante: '0001',
    fecha_Registro: '2026-08-31T00:00:00',
    fecha_Doc: '2026-08-31T00:00:00',
    tipo_Anexo: 'T',
    cod_Anexo: '12345678',
    tipo_Doc: 'PL',
    nro_Doc: '',
    fecha_Vencimiento: '2026-09-15T14:30:45',
    moneda: 'MN',
    importe: 2500.5,
    conversion_Tc: '',
    tc: 1,
    glosa: 'PLANILLA AGOSTO 2026',
    centro_Costos: 'ADM',
    glosa_Mov: 'REMUNERACIÓN',
    anulado: false,
    debe_Haber: 'D',
    medio_Pago: '001',
  }]);
});

test('conserva el tipo de cambio para asientos en moneda extranjera', () => {
  const [payload] = buildStarsoftPayload([{
    moneda: 'USD',
    conversion_tc: 'VTA',
    tc: '3.812345',
  }]);

  assert.equal(payload.moneda, 'ME');
  assert.equal(payload.conversion_Tc, 'VTA');
  assert.equal(payload.tc, 3.812345);
});
