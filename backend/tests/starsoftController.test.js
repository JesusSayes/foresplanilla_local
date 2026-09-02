import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStarsoftPayload, getAnexoValidationError } from '../controllers/starsoftController.js';

test('construye el arreglo plano y aplica TC solo a la primera línea del comprobante', () => {
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
    glosa: 'PLANILLA AGOSTO 2026',
    glosa_mov: 'REMUNERACIÓN',
    anulado: false,
    debe_haber: 'D',
    centro_costos: 'ADM',
    moneda: 'PEN',
    medio_pago: '001',
  }, {
    cuenta: '141101',
    annomes: '202608',
    subdiario: '35',
    comprobante: '0001',
    fecha_registro: '2026-08-31',
    fecha_doc: '2026-08-31',
    tipo_anexo: 'T',
    cod_anexo: '12345678',
    tipo_doc: 'PL',
    nro_doc: '0001',
    importe: 2500.5,
    anulado: false,
    debe_haber: 'H',
    moneda: 'PEN',
  }]);

  assert.deepEqual(payload, [{
      Cuenta: '621101',
      Annomes: '202608',
      Subdiario: '35',
      Comprobante: '0001',
      Fecha_Doc: '2026-08-31T00:00:00',
      Tipo_Anexo: 'T',
      Cod_Anexo: '12345678',
      Tipo_Doc: 'PL',
      Nro_Doc: '',
      Fecha_Vencimiento: '2026-09-15T14:30:45',
      Moneda: 'MN',
      Importe: 2500.5,
      Conversion_Tc: 'VTA',
      Fecha_Registro: '2026-08-31T00:00:00',
      Tc: 1,
      Glosa: 'PLANILLA AGOSTO 2026',
      Centro_Costos: 'ADM',
      Glosa_Mov: 'REMUNERACIÓN',
      Anulado: false,
      Debe_Haber: 'D',
      Medio_Pago: '001',
    }, {
      Cuenta: '141101',
      Annomes: '202608',
      Subdiario: '35',
      Comprobante: '0001',
      Fecha_Doc: '2026-08-31T00:00:00',
      Tipo_Anexo: 'T',
      Cod_Anexo: '12345678',
      Tipo_Doc: 'PL',
      Nro_Doc: '0001',
      Fecha_Vencimiento: null,
      Moneda: 'MN',
      Importe: 2500.5,
      Conversion_Tc: '',
      Fecha_Registro: '2026-08-31T00:00:00',
      Tc: 0,
      Glosa: '',
      Centro_Costos: '',
      Glosa_Mov: '',
      Anulado: false,
      Debe_Haber: 'H',
      Medio_Pago: '',
    }]);
});

test('conserva seis decimales del TC de la primera línea en moneda extranjera', () => {
  const payload = buildStarsoftPayload([{
    comprobante: '0002',
    moneda: 'USD',
    tc: '3.812345',
  }]);

  assert.equal(payload[0].Moneda, 'ME');
  assert.equal(payload[0].Conversion_Tc, 'VTA');
  assert.equal(payload[0].Tc, 3.812345);
});

test('usa el último tipo de cambio activo anterior o igual a la fecha del documento', () => {
  const payload = buildStarsoftPayload([{
    comprobante: '0003',
    subdiario: '35',
    annomes: '202608',
    fecha_doc: '2026-08-31',
    moneda: 'PEN',
    tc: 1,
  }, {
    comprobante: '0003',
    subdiario: '35',
    annomes: '202608',
    fecha_doc: '2026-08-31',
    moneda: 'PEN',
    tc: 1,
  }], [{
    fecha: new Date('2026-08-29T00:00:00.000Z'),
    valor_venta: '3.8123',
  }, {
    fecha: new Date('2026-09-01T00:00:00.000Z'),
    valor_venta: '3.9000',
  }]);

  assert.equal(payload[0].Tc, 3.8123);
  assert.equal(payload[1].Tc, 0);
});

test('rechaza asientos con líneas sin anexo antes de enviarlos a Starsoft', () => {
  const error = getAnexoValidationError([{
    comprobante: '0004',
    cuenta: '621101',
    tipo_anexo: 'T',
    cod_anexo: '12345678',
  }, {
    comprobante: '0004',
    cuenta: '401101',
    tipo_anexo: '',
    cod_anexo: '',
  }]);

  assert.equal(error.success, false);
  assert.equal(error.total, 2);
  assert.equal(error.errores, 1);
  assert.match(error.error, /0004 \/ 401101/);
});
