import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const possibleEnvPaths = [
  path.join(__dirname, '.env'),
  path.join(process.cwd(), 'backend', '.env'),
  path.join(process.cwd(), '.env'),
  '/var/www/html/foresplanilla/backend/.env',
];

let envFileFound = false;
let envFilePath = null;

for (const envPath of possibleEnvPaths) {
  const exists = fs.existsSync(envPath);
  if (exists && !envFileFound) {
    envFileFound = true;
    envFilePath = envPath;
  }
}

if (envFileFound) {
  dotenv.config({ path: envFilePath });
} else {
  console.error('⚠️  No se encontró archivo .env');
}

const args = process.argv.slice(2);
const updateExisting = args.includes('--update') || args.includes('-u');
const dryRun = args.includes('--dry-run') || args.includes('-d');

let limit = null;
const limitIndex = args.findIndex(arg => arg === '--limit' || arg === '-l');
if (limitIndex !== -1 && args[limitIndex + 1]) {
  limit = parseInt(args[limitIndex + 1], 10);
  if (isNaN(limit) || limit <= 0) {
    console.error('Error: El valor de --limit debe ser un número positivo');
    process.exit(1);
  }
}

console.log('='.repeat(60));
console.log('Script de Sincronización de Asistencias Externas');
console.log('='.repeat(60));
console.log('');

if (args.includes('--help') || args.includes('-h')) {
  console.log('Uso: node syncAttendanceCLI.js [opciones]');
  console.log('');
  console.log('Opciones:');
  console.log('  --update, -u       Actualizar registros existentes');
  console.log('  --dry-run, -d      Modo de prueba (no guarda cambios)');
  console.log('  --limit N, -l N    Limitar a N registros');
  console.log('  --help, -h         Mostrar esta ayuda');
  console.log('');
  console.log('Ejemplos:');
  console.log('  node syncAttendanceCLI.js --dry-run');
  console.log('  node syncAttendanceCLI.js --update --limit 100');
  console.log('  node syncAttendanceCLI.js -u -l 50');
  console.log('');
  process.exit(0);
}

console.log('Configuración:');
console.log('  Actualizar existentes:', updateExisting ? 'Sí' : 'No');
console.log('  Modo de prueba:', dryRun ? 'Sí' : 'No');
console.log('  Límite de registros:', limit || 'Sin límite');
console.log('');

if (!process.env.EXTERNAL_API_BASE_URL || !process.env.EXTERNAL_API_EMAIL || !process.env.EXTERNAL_API_PASSWORD) {
  console.error('❌ ERROR: Faltan variables de entorno requeridas');
  console.log('');
  console.log('Variables requeridas:');
  console.log('  EXTERNAL_API_BASE_URL:', process.env.EXTERNAL_API_BASE_URL || '❌ NO CONFIGURADO');
  console.log('  EXTERNAL_API_EMAIL:', process.env.EXTERNAL_API_EMAIL || '❌ NO CONFIGURADO');
  console.log('  EXTERNAL_API_PASSWORD:', process.env.EXTERNAL_API_PASSWORD ? '✓ Configurado' : '❌ NO CONFIGURADO');
  console.log('');
  console.log('Solución: Crear archivo .env en backend/ con estas variables');
  console.log('');
  process.exit(1);
}

async function main() {
  const { syncExternalAttendance } = await import('./services/externalAttendanceSync.js');

  try {
    console.log('Iniciando sincronización...');
    console.log('');

    const startTime = Date.now();

    const result = await syncExternalAttendance({
      updateExisting,
      dryRun,
      limit
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('');
    console.log('='.repeat(60));
    console.log('RESUMEN DE SINCRONIZACIÓN');
    console.log('='.repeat(60));
    console.log('');
    console.log('Estadísticas:');
    console.log('  Total procesados:', result.totalProcessed);
    console.log('  Nuevos creados:', result.created);
    console.log('  Actualizados:', result.updated);
    console.log('  Omitidos:', result.skipped);
    console.log('  Errores:', result.errors);
    console.log('  Duración:', duration, 'segundos');
    console.log('');

    if (dryRun) {
      console.log('⚠️  MODO DE PRUEBA - No se guardaron cambios en la base de datos');
      console.log('');
    }

    if (result.errorDetails && result.errorDetails.length > 0) {
      console.log('Detalles de errores:');
      result.errorDetails.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
      console.log('');
    }

    console.log('✓ Sincronización completada');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('ERROR FATAL');
    console.error('='.repeat(60));
    console.error('');
    console.error('Mensaje:', error.message);
    console.error('Stack:', error.stack);
    console.error('');
    process.exit(1);
  }
}

main();

// # Simulación con 10 registros
// node backend/syncAttendanceCLI.js --dry-run --limit 10

// # Ejecución real
// node backend/syncAttendanceCLI.js

// # Actualizar existentes
// node backend/syncAttendanceCLI.js --update

// # API - Dry run
// curl -X POST http://localhost:3000/api/attendance/sync \
  // -H "Content-Type: application/json" \
  // -d '{"dryRun": true, "limit": 5}'
