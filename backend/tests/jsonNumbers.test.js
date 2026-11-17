import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Prisma } from '@prisma/client';
import { jsonNumbers } from '../utils/jsonNumbers.js';

// Usar res.json real sin iniciar el servidor, cron ni conexiones a PostgreSQL.
function responseBody(body) {
  const app = express();
  app.set('json replacer', jsonNumbers);
  const res = Object.create(app.response);
  res.get = () => 'application/json';
  res.send = text => JSON.parse(text);
  return res.json(body);
}

test('boletas: Decimal llega como número y permite formatear y sumar', () => {
  const result = responseBody([
    { net_pay: new Prisma.Decimal('1250.35'), total_income: new Prisma.Decimal('1500.50') },
    { net_pay: new Prisma.Decimal('100.25'), total_income: new Prisma.Decimal('200.25') },
  ]);
  assert.equal(result[0].net_pay.toFixed(2), '1250.35');
  assert.equal(result.reduce((sum, row) => sum + row.total_income, 0).toFixed(2), '1700.75');
});

test('normaliza decimales anidados y conserva textos, fechas, nulos y números', () => {
  const date = new Date('2026-01-01T00:00:00.000Z');
  const result = responseBody({
    data: [{ worked_hours: new Prisma.Decimal('7.75'), amount: new Prisma.Decimal('-12.50'), zero: new Prisma.Decimal(0) }],
    document_number: '00123456', account: '000123', text: '12.50',
    date, optional: null, enabled: true, count: 2,
  });
  assert.deepEqual(result, {
    data: [{ worked_hours: 7.75, amount: -12.5, zero: 0 }],
    document_number: '00123456', account: '000123', text: '12.50',
    date: date.toISOString(), optional: null, enabled: true, count: 2,
  });
});

test('no modifica Decimal ni su serialización fuera de respuestas HTTP', () => {
  const amount = new Prisma.Decimal('123.45');
  assert.equal(responseBody(amount), 123.45);
  assert.equal(JSON.stringify({ amount }), '{"amount":"123.45"}');
  assert.ok(Prisma.Decimal.isDecimal(amount));
});
