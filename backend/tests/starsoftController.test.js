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
    fecha_vencimiento: null,
    importe: 2500,
    conversion_tc: null,
    tc: null,
    glosa: 'PLANILLA AGOSTO 2026',
    glosa_mov: 'REMUNERACIÓN',
    anulado: false,
    debe_haber: 'D',
    centro_costos: 'ADM',
    moneda: 'PEN',
  }]);

  assert.deepEqual(payload, [{
    cuenta: '621101',
    annomes: '202608',
    subdiario: '35',
    comprobante: '0001',
    fecha_Registro: '2026-08-31',
    fecha_Documento: '2026-08-31',
    tipo_Anexo: 'T',
    cod_Anexo: '12345678',
    tipo_Doc: 'PL',
    nro_Doc: '',
    fecha_Vencimiento: null,
    importe: 2500,
    conv_Tc: 'M',
    tc: 1,
    glosa: 'PLANILLA AGOSTO 2026',
    glosa_Mov: 'REMUNERACIÓN',
    anulado: false,
    debe_Haber: 'D',
    centro_Costos: 'ADM',
    moneda: 'MN',
  }]);
});
