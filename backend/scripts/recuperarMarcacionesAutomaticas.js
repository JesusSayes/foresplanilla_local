import 'dotenv/config';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import prisma from '../config/prisma.js';
import { getAsistenciasExternal } from '../utils/externalApiService.js';
import { readRecoveryContext, recoveryEligibility, planRecovery, applyRecovery } from './recovery/automaticAttendanceRecovery.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Desde backend: node scripts/recuperarMarcacionesAutomaticas.js [--apply]\nSin --apply: diagnóstico, sin escrituras en BD. Limitado a los 39 IDs del CSV del 23/09/2026.');
    return;
  }
  if (args.some(arg => arg !== '--apply')) throw new Error('Única opción admitida: --apply. Sin opciones se ejecuta el diagnóstico.');
  const apply = args.includes('--apply');
  const snapshots = JSON.parse(await readFile(new URL('./recovery/automaticAttendance20260923.json', import.meta.url), 'utf8'));
  if (snapshots.length !== 39 || new Set(snapshots.map(s => s.id)).size !== 39 ||
      snapshots.some(s => s.date !== '2026-09-23')) throw new Error('Listado de recuperación inválido');
  console.log(apply ? 'APLICACIÓN: se actualizarán solo candidatos verificados, después del respaldo.' : 'DIAGNÓSTICO: no se modificará la base de datos.');

  const contexts = [];
  for (const snapshot of snapshots) contexts.push(await readRecoveryContext(prisma, snapshot));
  const eligible = contexts.filter((context, i) => !recoveryEligibility(snapshots[i], context));
  let biotime = [];
  let external = [];
  if (eligible.some(c => c.employee.attendance_method === 'MARCADOR')) {
    if (!process.env.BIOTIME_DATABASE_URL) {
      console.warn('BIOTIME_DATABASE_URL no configurada: se usarán solo logs locales disponibles.');
    } else {
      const pool = new pg.Pool({ connectionString: process.env.BIOTIME_DATABASE_URL,
        max: 1, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
      try {
        // Misma fuente y conversión pg/Date que la sincronización existente.
        // Solo lectura; no ejecuta el recálculo general del día.
        const { rows } = await pool.query(
          'SELECT id, emp_code, punch_time FROM iclock_transaction WHERE punch_time >= $1 AND punch_time < $2 ORDER BY punch_time, id',
          [new Date('2026-09-23T05:00:00Z'), new Date('2026-09-24T05:00:00Z')]
        );
        biotime = rows;
      } catch (error) {
        console.warn(`No se pudo consultar Biotime; solo se usarán logs locales: ${error.message}`);
      } finally { await pool.end(); }
    }
  }
  if (eligible.some(c => c.employee.attendance_method === 'API FORESPAMA')) {
    try {
      external = await getAsistenciasExternal();
      if (!Array.isArray(external)) throw new Error('Respuesta de API no válida');
    } catch (error) {
      external = [];
      console.warn(`La recuperación desde API queda pendiente: ${error.message}`);
    }
  }

  const plans = snapshots.map((snapshot, i) => planRecovery(snapshot, contexts[i], { biotime, external }));
  console.table(plans.map(plan => ({
    id: plan.id, resultado: plan.reason || 'RECUPERABLE',
    entrada: plan.patch?.clock_in || '-', salida: plan.patch?.clock_out || '-',
    estado: plan.patch?.status || '-', fuente: plan.source || '-',
  })));
  const ready = plans.filter(plan => plan.patch);
  console.log(`Revisados: ${plans.length}. Recuperables: ${ready.length}. Omitidos/pendientes: ${plans.length - ready.length}.`);
  if (!apply || !ready.length) return;

  const directory = fileURLToPath(new URL('../logs/recovery/', import.meta.url));
  await mkdir(directory, { recursive: true });
  const backup = path.join(directory, `automatic-attendance-20260923-${randomUUID()}.json`);
  await writeFile(backup, JSON.stringify({ created_at: new Date(), records: ready.map(plan => ({
    id: plan.id, before: plan.context.record, after: plan.patch,
    new_logs: plan.newLogs, source: plan.source,
  })) }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(`Respaldo previo (conservar): ${backup}`);
  let updated = 0;
  let failed = 0;
  for (const plan of ready) {
    try {
      await applyRecovery(prisma, plan);
      updated++;
      console.log(`RECUPERADO ${plan.id}`);
    } catch (error) {
      failed++;
      console.error(`NO APLICADO ${plan.id}: ${error.message}`);
    }
  }
  console.log(`Recuperados: ${updated}. No aplicados: ${failed}. Sin cambios: ${plans.length - ready.length}.`);
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
