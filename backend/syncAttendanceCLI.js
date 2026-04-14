import { syncExternalAttendance } from './services/externalAttendanceSync.js';

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
  console.log('Uso: node backend/syncAttendanceCLI.js [opciones]');
  console.log('');
  console.log('Opciones:');
  console.log('  --dry-run, -d        Modo simulación (no guarda en BD)');
  console.log('  --update, -u         Actualizar registros existentes');
  console.log('  --limit, -l <num>    Limitar a N registros (útil para pruebas)');
  console.log('  --help, -h           Mostrar esta ayuda');
  console.log('');
  console.log('Ejemplos:');
  console.log('  node backend/syncAttendanceCLI.js --dry-run');
  console.log('  node backend/syncAttendanceCLI.js --dry-run --limit 10');
  console.log('  node backend/syncAttendanceCLI.js --update');
  console.log('  node backend/syncAttendanceCLI.js --update --limit 10');
  console.log('');
  process.exit(0);
}

async function main() {
  try {
    console.log(`Modo: ${dryRun ? 'DRY RUN (Simulación)' : 'REAL (Guardará en BD)'}`);
    console.log(`Actualizar existentes: ${updateExisting ? 'SÍ' : 'NO'}`);
    if (limit) {
      console.log(`Límite: ${limit} registros`);
    }
    console.log('');
    
    const result = await syncExternalAttendance({ updateExisting, limit, dryRun });
    
    console.log('');
    console.log('='.repeat(60));
    console.log('RESULTADO DE LA SINCRONIZACIÓN');
    console.log('='.repeat(60));
    console.log(`Estado: ${result.success ? '✓ EXITOSO' : '✗ FALLIDO'}`);
    console.log(`Modo: ${result.dryRun ? 'DRY RUN (No se guardó nada)' : 'REAL'}`);
    console.log(`Duración: ${result.duration}ms`);
    console.log(`Archivo de log: ${result.logFile}`);
    console.log('');
    console.log('Estadísticas:');
    console.log(`  - Total procesados: ${result.totalProcessed}`);
    console.log(`  - Nuevos guardados: ${result.totalSaved}`);
    console.log(`  - Actualizados: ${result.totalUpdated}`);
    console.log(`  - Omitidos: ${result.totalSkipped}`);
    console.log('');
    
    if (result.dryRun) {
      console.log('REGISTROS QUE SE GUARDARÍAN:');
      console.log(`  - Nuevos: ${result.recordsToSave?.length || 0}`);
      console.log(`  - Actualizaciones: ${result.recordsToUpdate?.length || 0}`);
      console.log('');
    }
    
    if (result.totalSkipped > 0 && result.skipReasons) {
      console.log('Razones de registros omitidos:');
      console.log(`  - Datos faltantes: ${result.skipReasons.missingData || 0}`);
      console.log(`  - Empleado no encontrado: ${result.skipReasons.employeeNotFound || 0}`);
      console.log(`  - Ya existe (duplicado): ${result.skipReasons.alreadyExists || 0}`);
      console.log('');
      
      if (result.skipReasons.employeesNotFound && result.skipReasons.employeesNotFound.length > 0) {
        console.log(`Documentos de empleados no encontrados (${result.skipReasons.employeesNotFound.length}):`);
        const docs = result.skipReasons.employeesNotFound.slice(0, 20);
        docs.forEach(doc => console.log(`  - ${doc}`));
        if (result.skipReasons.employeesNotFound.length > 20) {
          console.log(`  ... y ${result.skipReasons.employeesNotFound.length - 20} más`);
        }
        console.log('');
      }
      
      if (result.skipReasons.duplicateDates && result.skipReasons.duplicateDates.length > 0) {
        console.log(`Registros duplicados (primeros 10):`);
        result.skipReasons.duplicateDates.slice(0, 10).forEach(dup => {
          console.log(`  - ${dup.employee_name} (${dup.document_number}) - ${dup.date} [ID: ${dup.external_id}]`);
        });
        if (result.skipReasons.duplicateDates.length > 10) {
          console.log(`  ... y ${result.skipReasons.duplicateDates.length - 10} más`);
        }
        console.log('');
      }
    }
    
    if (result.savedRecordIds && result.savedRecordIds.length > 0) {
      console.log(`IDs de registros guardados/actualizados: ${result.savedRecordIds.length}`);
      console.log(`  Primeros 5: ${result.savedRecordIds.slice(0, 5).join(', ')}`);
      console.log('');
    }
    
    if (result.externalIdsConfirmed && result.externalIdsConfirmed.length > 0) {
      console.log(`IDs externos confirmados: ${result.externalIdsConfirmed.length}`);
      console.log(`  IDs: [${result.externalIdsConfirmed.join(', ')}]`);
      console.log('');
    }
    
    if (result.errors && result.errors.length > 0) {
      console.log(`⚠ Errores encontrados: ${result.errors.length}`);
      result.errors.slice(0, 10).forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err.error} ${err.external_id ? `(ID externo: ${err.external_id})` : ''} ${err.document_number ? `(Doc: ${err.document_number})` : ''}`);
      });
      if (result.errors.length > 10) {
        console.log(`  ... y ${result.errors.length - 10} más (ver log completo)`);
      }
      console.log('');
    }
    
    console.log('='.repeat(60));
    console.log(`Ver detalles completos en: ${result.logFile}`);
    console.log('='.repeat(60));
    
    process.exit(result.success ? 0 : 1);
    
  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('ERROR FATAL');
    console.error('='.repeat(60));
    console.error(error.message);
    console.error(error.stack);
    console.error('='.repeat(60));
    process.exit(1);
  }
}

main();
