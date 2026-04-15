import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('='.repeat(60));
console.log('DIAGNÓSTICO DE CONFIGURACIÓN - API EXTERNA');
console.log('='.repeat(60));
console.log('');

console.log('Información del sistema:');
console.log('  Directorio actual:', process.cwd());
console.log('  Directorio del script:', __dirname);
console.log('  NODE_ENV:', process.env.NODE_ENV || 'no definido');
console.log('');

const possibleEnvPaths = [
  path.join(__dirname, '.env'),
  path.join(process.cwd(), 'backend', '.env'),
  path.join(process.cwd(), '.env'),
  '/var/www/html/foresplanilla/backend/.env',
];

console.log('Buscando archivo .env en:');
let envFileFound = false;
let envFilePath = null;

for (const envPath of possibleEnvPaths) {
  const exists = fs.existsSync(envPath);
  console.log(`  ${exists ? '✓' : '✗'} ${envPath}`);
  if (exists && !envFileFound) {
    envFileFound = true;
    envFilePath = envPath;
  }
}
console.log('');

if (envFileFound) {
  console.log(`Cargando variables desde: ${envFilePath}`);
  dotenv.config({ path: envFilePath });
  console.log('');
} else {
  console.log('⚠️  No se encontró archivo .env, intentando usar variables del sistema...');
  console.log('');
}

console.log('Variables de entorno:');
console.log('  EXTERNAL_API_BASE_URL:', process.env.EXTERNAL_API_BASE_URL || '❌ NO CONFIGURADO');
console.log('  EXTERNAL_API_EMAIL:', process.env.EXTERNAL_API_EMAIL || '❌ NO CONFIGURADO');
console.log('  EXTERNAL_API_PASSWORD:', process.env.EXTERNAL_API_PASSWORD ? '✓ Configurado' : '❌ NO CONFIGURADO');
console.log('');

if (!process.env.EXTERNAL_API_BASE_URL || !process.env.EXTERNAL_API_EMAIL || !process.env.EXTERNAL_API_PASSWORD) {
  console.error('❌ ERROR: Faltan variables de entorno requeridas');
  console.log('');
  console.log('Soluciones:');
  console.log('');
  console.log('1. Crear archivo .env en backend/ con:');
  console.log('   EXTERNAL_API_BASE_URL=https://tu-api.com/api');
  console.log('   EXTERNAL_API_EMAIL=tu-email@ejemplo.com');
  console.log('   EXTERNAL_API_PASSWORD=tu-contraseña');
  console.log('');
  console.log('2. O exportar variables de entorno en el sistema:');
  console.log('   export EXTERNAL_API_BASE_URL=https://tu-api.com/api');
  console.log('   export EXTERNAL_API_EMAIL=tu-email@ejemplo.com');
  console.log('   export EXTERNAL_API_PASSWORD=tu-contraseña');
  console.log('');
  process.exit(1);
}

console.log('Probando conexión...');
console.log('');

async function testConnection() {
  const { getAsistenciasExternal } = await import('./utils/externalApiService.js');

  try {
    console.log('Intentando obtener 1 registro de prueba...');
    const result = await getAsistenciasExternal(1);
    console.log('');
    console.log('✓ CONEXIÓN EXITOSA');
    console.log('');
    console.log('Datos recibidos:', JSON.stringify(result, null, 2));
    console.log('');
    process.exit(0);
  } catch (error) {
    console.log('');
    console.error('❌ ERROR EN LA CONEXIÓN');
    console.error('');
    console.error('Mensaje:', error.message);
    console.error('Stack:', error.stack);
    console.error('');
    console.log('Posibles soluciones:');
    console.log('  1. Verifica que EXTERNAL_API_BASE_URL sea correcto');
    console.log('  2. Verifica que el servidor del API externo esté activo');
    console.log('  3. Verifica que las credenciales sean correctas');
    console.log('  4. Verifica que no haya firewall bloqueando la conexión');
    console.log('  5. Prueba manualmente con curl:');
    console.log(`     curl -X POST ${process.env.EXTERNAL_API_BASE_URL}/api-login \\`);
    console.log(`       -H "Content-Type: application/json" \\`);
    console.log(`       -d '{"email":"${process.env.EXTERNAL_API_EMAIL}","password":"***"}'`);
    console.log('');
    process.exit(1);
  }
}

testConnection();
