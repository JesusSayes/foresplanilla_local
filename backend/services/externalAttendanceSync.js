import { PrismaClient } from '@prisma/client';
import { generate24HexId } from '../utils/idGenerator.js';
import { getAsistenciasExternal, confirmarAsistenciasExternal } from '../utils/externalApiService.js';
import {
  getScheduleForDate,
  calcularMetricas,
} from "../utils/attendanceMetrics.js";
import {
  getProtectedFields,
  protectValue,
} from "../utils/manualAttendanceProtection.js";
import { isEmploymentDateValid } from "../utils/employmentDate.js";
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

function createLogFile(dryRun) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const logDir = path.join(process.cwd(), 'backend', 'logs');
  const logFileName = `sync-${dryRun ? 'dryrun' : 'real'}-${timestamp}.log`;
  const logFilePath = path.join(logDir, logFileName);

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  return logFilePath;
}

function writeLog(logFilePath, message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFilePath, logMessage);
  console.log(message);
}

function normalizeExternalTime(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function shouldConfirmExternalRecord(clockIn, clockOut) {
  return Boolean(clockIn && clockOut);
}

export async function syncExternalAttendance(options = {}) {
  const { updateExisting = false, limit = null, dryRun = false } = options;

  const logFilePath = createLogFile(dryRun);

  const log = (message) => writeLog(logFilePath, message);

  log('='.repeat(80));
  log('SINCRONIZACIÓN DE ASISTENCIAS EXTERNAS');
  log('='.repeat(80));
  log(`Modo: ${dryRun ? 'DRY RUN (Simulación)' : 'REAL (Guardará en BD)'}`);
  log(`Actualizar existentes: ${updateExisting ? 'SÍ' : 'NO'}`);
  if (limit) {
    log(`Límite: ${limit} registros`);
  }
  log(`Archivo de log: ${logFilePath}`);
  log('');

  const startTime = Date.now();
  let totalProcessed = 0;
  let totalSaved = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const errors = [];
  const savedRecordIds = [];
  const externalIdsToConfirm = [];
  const skipReasons = {
    missingData: 0,
    employeeNotFound: 0,
    alreadyExists: 0,
    employeesNotFound: new Set(),
    duplicateDates: []
  };
  const recordsToSave = [];
  const recordsToUpdate = [];

  try {
    const externalData = await getAsistenciasExternal(limit);

    if (!externalData || !Array.isArray(externalData)) {
      log('No hay datos para procesar');
      return {
        success: true,
        totalProcessed: 0,
        totalSaved: 0,
        totalUpdated: 0,
        totalSkipped: 0,
        skipReasons: {},
        errors: [],
        duration: Date.now() - startTime,
        logFile: logFilePath,
        dryRun
      };
    }

    const uniqueRecordsMap = new Map();
    for (const externalRecord of externalData) {
      if (!externalRecord?.numero_documento || !externalRecord?.fecha) {
        uniqueRecordsMap.set(`__${externalRecord?.id || Math.random()}`, externalRecord);
        continue;
      }

      const recordKey = `${String(externalRecord.numero_documento).trim()}|${String(externalRecord.fecha).trim()}`;
      const currentRecord = uniqueRecordsMap.get(recordKey);

      if (!currentRecord) {
        uniqueRecordsMap.set(recordKey, externalRecord);
        continue;
      }

      const currentCompleteness = (currentRecord.hora_entrada ? 1 : 0) + (currentRecord.hora_salida ? 1 : 0);
      const newCompleteness = (externalRecord.hora_entrada ? 1 : 0) + (externalRecord.hora_salida ? 1 : 0);

      if (newCompleteness >= currentCompleteness) {
        uniqueRecordsMap.set(recordKey, externalRecord);
      }
    }

    const recordsForSync = Array.from(uniqueRecordsMap.values());

    log(`Procesando ${recordsForSync.length} registros...`);
    log('');

    for (const record of recordsForSync) {
      totalProcessed++;

      try {
        if (!record.numero_documento || !record.fecha) {
          totalSkipped++;
          skipReasons.missingData++;
          const error = {
            external_id: record.id,
            reason: 'missing_data',
            error: 'Faltan datos requeridos: numero_documento o fecha'
          };
          errors.push(error);
          log(`[OMITIDO] ID ${record.id}: ${error.error}`);
          continue;
        }

        const employee = await prisma.employee.findFirst({
          where: { document_number: record.numero_documento }
        });

        if (!employee) {
          totalSkipped++;
          skipReasons.employeeNotFound++;
          skipReasons.employeesNotFound.add(record.numero_documento);
          const error = {
            external_id: record.id,
            document_number: record.numero_documento,
            reason: 'employee_not_found',
            error: 'Empleado no encontrado'
          };
          errors.push(error);
          log(`[OMITIDO] ID ${record.id} - Doc ${record.numero_documento}: Empleado no encontrado`);
          continue;
        }

        const recordDate = new Date(record.fecha);
        if (!isEmploymentDateValid(employee, recordDate)) {
          totalSkipped++;
          log(`[OMITIDO] ID ${record.id} - ${record.numero_documento}: Fecha fuera del período laboral`);
          continue;
        }

        const existingRecord = await prisma.attendance_record.findFirst({
          where: {
            employee_id: employee.id,
            date: recordDate
          }
        });

        if (existingRecord) {
          const protectedFields = getProtectedFields(existingRecord);
          const existingClockIn = existingRecord.clock_in;
          const existingClockOut = existingRecord.clock_out;
          const newClockIn = normalizeExternalTime(record.hora_entrada);
          const newClockOut = normalizeExternalTime(record.hora_salida);

          const missingClockIn = (!existingClockIn || (typeof existingClockIn === 'string' && existingClockIn.trim() === '')) && newClockIn && (typeof newClockIn === 'string' && newClockIn.trim() !== '');
          const missingClockOut = (!existingClockOut || (typeof existingClockOut === 'string' && existingClockOut.trim() === '')) && newClockOut && (typeof newClockOut === 'string' && newClockOut.trim() !== '');

          if (missingClockIn || missingClockOut) {
            const workSchedule = await prisma.work_schedule.findFirst({
              where: {
                employee_id: employee.id,
                is_active: true,
                OR: [
                  { effective_from: null },
                  { effective_from: { lte: recordDate } }
                ]
              },
              orderBy: {
                effective_from: 'desc'
              }
            });

            const updatedClockIn = existingClockIn || newClockIn;
            const updatedClockOut = existingClockOut || newClockOut;

            let status = "Completo";

            if (!updatedClockIn) {
              status = "Ausente";
            }
            else if (updatedClockIn && !updatedClockOut) {
              status = "Incompleto";
            }

            const dateStr = record.fecha instanceof Date ? record.fecha.toISOString().slice(0, 10) : String(record.fecha).slice(0, 10);

            const metrics = calcularMetricas(
              {
                clock_in: updatedClockIn,
                clock_out: updatedClockOut,
                status,
              },
              workSchedule,
              dateStr,
              false
            );

            const updateFields = {};
            const updatedFields = [];

            if (missingClockIn) {
              updateFields.clock_in = newClockIn;
              updatedFields.push(`Entrada: ${existingClockIn || 'N/A'} → ${newClockIn}`);
            }
            if (missingClockOut) {
              updateFields.clock_out = newClockOut;
              updatedFields.push(`Salida: ${existingClockOut || 'N/A'} → ${newClockOut}`);
            }

            updateFields.worked_hours = metrics.worked_hours;
            updateFields.regular_hours = metrics.regular_hours;
            updateFields.overtime_hours_25 = metrics.overtime_hours_25;
            updateFields.overtime_hours_35 = metrics.overtime_hours_35;
            updateFields.is_late = metrics.is_late;
            updateFields.late_minutes = metrics.late_minutes;
            updateFields.is_absent = metrics.is_absent;
            updateFields.status = status;
            updateFields.notes = `${existingRecord.notes || ''}\nActualizado desde duplicado (ID externo: ${record.id}) - ${updatedFields.join(', ')}`.trim();
            updateFields.updated_date = new Date();
            updateFields.created_by = 'external_sync';

            for (const field of protectedFields) {
              if (Object.hasOwn(updateFields, field)) {
                updateFields[field] = existingRecord[field];
              }
            }

            log(`[ACTUALIZAR DUPLICADO] ID ${record.id} - ${employee.first_name} ${employee.last_name} (${record.numero_documento}) - ${record.fecha} - Campos actualizados: ${updatedFields.join(', ')} - Horas trabajadas: ${Number(existingRecord.worked_hours || 0).toFixed(2)} → ${Number(metrics.worked_hours || 0).toFixed(2)}, Estado: ${existingRecord.status || 'N/A'} → ${status}`);

            if (!dryRun) {
              await prisma.attendance_record.update({
                where: { id: existingRecord.id },
                data: updateFields
              });
              savedRecordIds.push(existingRecord.id);
            }

            totalUpdated++;
            if (shouldConfirmExternalRecord(updatedClockIn, updatedClockOut)) {
              externalIdsToConfirm.push(record.id);
            }
            continue;
          }

          if (!updateExisting) {
            totalSkipped++;
            skipReasons.alreadyExists++;
            const dupInfo = {
              external_id: record.id,
              document_number: record.numero_documento,
              employee_name: `${employee.first_name} ${employee.last_name}`,
              date: record.fecha,
              existing_clock_in: existingClockIn || 'N/A',
              existing_clock_out: existingClockOut || 'N/A',
              new_clock_in: newClockIn || 'N/A',
              new_clock_out: newClockOut || 'N/A'
            };
            skipReasons.duplicateDates.push(dupInfo);
            log(`[OMITIDO] ID ${record.id} - ${dupInfo.employee_name} (${record.numero_documento}): Ya existe registro para ${record.fecha} - Existente: Entrada=${existingClockIn || 'N/A'}, Salida=${existingClockOut || 'N/A'} | Nuevo: Entrada=${newClockIn || 'N/A'}, Salida=${newClockOut || 'N/A'}`);
            continue;
          }
        }

        const workSchedule = await prisma.work_schedule.findFirst({
          where: {
            employee_id: employee.id,
            is_active: true,
            OR: [
              { effective_from: null },
              { effective_from: { lte: recordDate } }
            ]
          },
          orderBy: {
            effective_from: 'desc'
          }
        });

        const clockIn = normalizeExternalTime(record.hora_entrada);
        const clockOut = normalizeExternalTime(record.hora_salida);
        const effectiveClockIn = existingRecord?.clock_in || clockIn;
        const effectiveClockOut = existingRecord?.clock_out || clockOut;

        let status = "Completo";

        if (!effectiveClockIn) {
          status = "Ausente";
        }
        else if (effectiveClockIn && !effectiveClockOut) {
          status = "Incompleto";
        }

        const dateStr = record.fecha instanceof Date ? record.fecha.toISOString().slice(0, 10) : String(record.fecha).slice(0, 10);
        const metrics = calcularMetricas(
          {
            clock_in: effectiveClockIn,
            clock_out: effectiveClockOut,
            status,
          },
          workSchedule,
          dateStr,
          false
        );

        const dow = recordDate.getDay();

        const startFields = ["sunday_start", "monday_start", "tuesday_start", "wednesday_start", "thursday_start", "friday_start", "saturday_start",];
        const endFields = ["sunday_end", "monday_end", "tuesday_end", "wednesday_end", "thursday_end", "friday_end", "saturday_end",];

        const scheduledStart =  workSchedule?.[startFields[dow]] || employee.entry_time || "08:00";
        const scheduledEnd = workSchedule?.[endFields[dow]] || employee.exit_time || "17:00";

        const attendanceData = {
          employee_id: employee.id,
          employee_name: `${employee.first_name} ${employee.last_name}`,
          document_number: record.numero_documento,
          date: recordDate,
          clock_in: clockIn,
          clock_out: clockOut,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          worked_hours: metrics.worked_hours,
          regular_hours: metrics.regular_hours,
          overtime_hours_25: metrics.overtime_hours_25,
          overtime_hours_35: metrics.overtime_hours_35,
          is_late: metrics.is_late,
          late_minutes: metrics.late_minutes,
          is_absent: metrics.is_absent,
          overtime_authorized: false,
          status: status,
          notes: `Registro sincronizado desde API externa (ID externo: ${record.id})`,
          updated_date: new Date(),
          external_id: record.id
        };

        if (existingRecord) {
          recordsToUpdate.push(attendanceData);
          log(`[ACTUALIZAR] ID ${record.id} - ${attendanceData.employee_name} (${record.numero_documento}) - ${record.fecha} - Entrada: ${clockIn}, Salida: ${clockOut}, Horas: ${Number(metrics.worked_hours || 0).toFixed(2)}, Estado: ${status}`);

          if (!dryRun) {
            await prisma.attendance_record.update({
              where: { id: existingRecord.id },
              data: {
                employee_id: attendanceData.employee_id,
                date: attendanceData.date,
                clock_in: protectedFields.has("clock_in") ? existingRecord.clock_in : (attendanceData.clock_in ?? existingRecord.clock_in),
                clock_out: protectedFields.has("clock_out") ? existingRecord.clock_out : (attendanceData.clock_out ?? existingRecord.clock_out),
                scheduled_start: attendanceData.scheduled_start,
                scheduled_end: attendanceData.scheduled_end,
                worked_hours: protectValue(protectedFields, "worked_hours", existingRecord.worked_hours, attendanceData.worked_hours),
                regular_hours: protectValue(protectedFields, "regular_hours", existingRecord.regular_hours, attendanceData.regular_hours),
                overtime_hours_25: protectValue(protectedFields, "overtime_hours_25", existingRecord.overtime_hours_25, attendanceData.overtime_hours_25),
                overtime_hours_35: protectValue(protectedFields, "overtime_hours_35", existingRecord.overtime_hours_35, attendanceData.overtime_hours_35),
                overtime_authorized: attendanceData.overtime_authorized,
                is_late: protectValue(protectedFields, "is_late", existingRecord.is_late, attendanceData.is_late),
                late_minutes: protectValue(protectedFields, "late_minutes", existingRecord.late_minutes, attendanceData.late_minutes),
                is_absent: protectValue(protectedFields, "is_absent", existingRecord.is_absent, attendanceData.is_absent),
                status: protectedFields.has("status") ? existingRecord.status : attendanceData.status,
                notes: protectedFields.has("notes") ? existingRecord.notes : attendanceData.notes,
                updated_date: attendanceData.updated_date,
                created_by: 'external_sync'
              }
            });
            savedRecordIds.push(existingRecord.id);
            if (shouldConfirmExternalRecord(effectiveClockIn, effectiveClockOut)) {
              externalIdsToConfirm.push(record.id);
            }
          }
          totalUpdated++;
        } else {
          recordsToSave.push(attendanceData);
          log(`[GUARDAR] ID ${record.id} - ${attendanceData.employee_name} (${record.numero_documento}) - ${record.fecha} - Entrada: ${clockIn}, Salida: ${clockOut}, Horas: ${Number(metrics.worked_hours || 0).toFixed(2)}, Estado: ${status}`);

          if (!dryRun) {
            const recordId = generate24HexId();
            await prisma.attendance_record.create({
              data: {
                id: recordId,
                employee_id: attendanceData.employee_id,
                date: attendanceData.date,
                clock_in: attendanceData.clock_in,
                clock_out: attendanceData.clock_out,
                scheduled_start: attendanceData.scheduled_start,
                scheduled_end: attendanceData.scheduled_end,
                worked_hours: attendanceData.worked_hours,
                regular_hours: attendanceData.regular_hours,
                overtime_hours_25: attendanceData.overtime_hours_25,
                overtime_hours_35: attendanceData.overtime_hours_35,
                overtime_authorized: attendanceData.overtime_authorized,
                is_late: attendanceData.is_late,
                late_minutes: attendanceData.late_minutes,
                is_absent: attendanceData.is_absent,
                status: attendanceData.status,
                notes: attendanceData.notes,
                created_date: new Date(),
                updated_date: attendanceData.updated_date,
                created_by: 'external_sync'
              }
            });
            savedRecordIds.push(recordId);
            if (shouldConfirmExternalRecord(clockIn, clockOut)) {
              externalIdsToConfirm.push(record.id);
            }
          }
          totalSaved++;
        }

      } catch (recordError) {
        const error = {
          external_id: record.id,
          document_number: record.numero_documento,
          reason: 'processing_error',
          error: recordError.message
        };
        errors.push(error);
        log(`[ERROR] ID ${record.id}: ${recordError.message}`);
      }
    }

    if (externalIdsToConfirm.length > 0 && !dryRun) {
      log('');
      log(`Confirmando ${externalIdsToConfirm.length} registros guardados en API externa...`);

      try {
        await confirmarAsistenciasExternal(externalIdsToConfirm);
        log('Confirmación exitosa');
      } catch (confirmError) {
        log(`Error en confirmación: ${confirmError.message}`);
        errors.push({
          step: 'confirmation',
          reason: 'confirmation_error',
          error: confirmError.message
        });
      }
    }

    const duration = Date.now() - startTime;

    log('');
    log('='.repeat(80));
    log('RESUMEN DE SINCRONIZACIÓN');
    log('='.repeat(80));
    log(`Duración: ${duration}ms`);
    log(`Total procesados: ${totalProcessed}`);
    log(`Nuevos guardados: ${totalSaved}`);
    log(`Actualizados: ${totalUpdated}`);
    log(`Omitidos: ${totalSkipped}`);
    log('');

    if (totalSkipped > 0) {
      log('DETALLES DE REGISTROS OMITIDOS:');
      log(`  - Datos faltantes: ${skipReasons.missingData}`);
      log(`  - Empleado no encontrado: ${skipReasons.employeeNotFound}`);
      log(`  - Ya existe (duplicado): ${skipReasons.alreadyExists}`);
      log('');

      if (skipReasons.employeesNotFound.size > 0) {
        log(`Documentos de empleados no encontrados (${skipReasons.employeesNotFound.size}):`);
        const docsArray = Array.from(skipReasons.employeesNotFound);
        docsArray.forEach(doc => log(`  - ${doc}`));
        log('');
      }

      if (skipReasons.duplicateDates.length > 0) {
        log(`Registros duplicados (${skipReasons.duplicateDates.length}):`);
        skipReasons.duplicateDates.forEach(dup => {
          log(`  - ${dup.employee_name} (${dup.document_number}) - ${dup.date} [ID: ${dup.external_id}]`);
        });
        log('');
      }
    }

    if (dryRun) {
      log('');
      log('*** MODO DRY RUN: No se guardó ningún dato en la base de datos ***');
      log('');
    }

    log('='.repeat(80));

    return {
      success: true,
      totalProcessed,
      totalSaved,
      totalUpdated,
      totalSkipped,
      skipReasons: {
        missingData: skipReasons.missingData,
        employeeNotFound: skipReasons.employeeNotFound,
        alreadyExists: skipReasons.alreadyExists,
        employeesNotFound: Array.from(skipReasons.employeesNotFound),
        duplicateDates: skipReasons.duplicateDates
      },
      recordsToSave,
      recordsToUpdate,
      savedRecordIds,
      externalIdsConfirmed: dryRun ? [] : externalIdsToConfirm,
      errors,
      duration,
      logFile: logFilePath,
      dryRun
    };

  } catch (error) {
    log('');
    log('ERROR GENERAL: ' + error.message);
    log(error.stack);

    return {
      success: false,
      totalProcessed,
      totalSaved,
      totalUpdated,
      totalSkipped,
      skipReasons: {
        missingData: skipReasons.missingData,
        employeeNotFound: skipReasons.employeeNotFound,
        alreadyExists: skipReasons.alreadyExists,
        employeesNotFound: Array.from(skipReasons.employeesNotFound),
        duplicateDates: skipReasons.duplicateDates
      },
      recordsToSave,
      recordsToUpdate,
      savedRecordIds,
      externalIdsConfirmed: [],
      errors: [...errors, { step: 'general', reason: 'general_error', error: error.message }],
      duration: Date.now() - startTime,
      logFile: logFilePath,
      dryRun
    };
  }
}
