import { PrismaClient } from '@prisma/client';
import { generate24HexId } from '../utils/idGenerator.js';
import { getAsistenciasExternal, confirmarAsistenciasExternal } from '../utils/externalApiService.js';
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

function calcWorkedHours(startTime, endTime, breakMinutes = 60) {
  if (!startTime || !endTime) return 0;
  
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  
  const totalMinutes = (eh * 60 + em) - (sh * 60 + sm);
  const workedMinutes = Math.max(0, totalMinutes - breakMinutes);
  
  return workedMinutes / 60;
}

function calcLateMinutes(scheduledStart, actualClockIn) {
  if (!scheduledStart || !actualClockIn) return 0;
  
  const [sh, sm] = scheduledStart.split(":").map(Number);
  const [ah, am] = actualClockIn.split(":").map(Number);
  
  const scheduledMinutes = sh * 60 + sm;
  const actualMinutes = ah * 60 + am;
  
  return Math.max(0, actualMinutes - scheduledMinutes);
}

function calcOvertimeHours(workedHours, regularHours = 8) {
  if (workedHours <= regularHours) {
    return { overtime_25: 0, overtime_35: 0, regular: workedHours };
  }

  const overtime = workedHours - regularHours;

  if (overtime <= 2) {
    return { overtime_25: overtime, overtime_35: 0, regular: regularHours };
  }

  return { overtime_25: 2, overtime_35: overtime - 2, regular: regularHours };
}

function getScheduleForDate(workSchedule, date) {
  if (!workSchedule) return null;

  const dayOfWeek = date.getDay();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[dayOfWeek];

  const startField = `${dayName}_start`;
  const endField = `${dayName}_end`;

  return {
    scheduledStart: workSchedule[startField] || null,
    scheduledEnd: workSchedule[endField] || null,
    breakMinutes: workSchedule.break_duration_minutes || 60
  };
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

    log(`Procesando ${externalData.length} registros...`);
    log('');

    for (const record of externalData) {
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

        const existingRecord = await prisma.attendance_record.findFirst({
          where: {
            employee_id: employee.id,
            date: recordDate
          }
        });

        if (existingRecord && !updateExisting) {
          const existingClockIn = existingRecord.clock_in;
          const existingClockOut = existingRecord.clock_out;
          const newClockIn = record.hora_entrada;
          const newClockOut = record.hora_salida;

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

            const scheduleInfo = getScheduleForDate(workSchedule, recordDate);

            const updatedClockIn = existingClockIn || newClockIn;
            const updatedClockOut = existingClockOut || newClockOut;
            const scheduledStart = scheduleInfo?.scheduledStart || '08:00';
            const scheduledEnd = scheduleInfo?.scheduledEnd || '17:00';
            const breakMinutes = scheduleInfo?.breakMinutes || 60;

            const workedHours = (updatedClockIn && updatedClockOut)
              ? calcWorkedHours(updatedClockIn, updatedClockOut, breakMinutes)
              : 0;

            const lateMinutes = updatedClockIn ? calcLateMinutes(scheduledStart, updatedClockIn) : 0;
            const isLate = lateMinutes > 0;
            const isAbsent = !updatedClockIn || !updatedClockOut;

            const overtime = calcOvertimeHours(workedHours);

            let status = 'Completo';
            if (isAbsent) {
              status = 'Ausente';
            } else if (isLate) {
              status = 'Tardanza';
            }

            const updateFields = {};
            const updatedFields = [];

            if (missingClockIn) {
              updateFields.clock_in = newClockIn;
              updatedFields.push(`Entrada: ${newClockIn}`);
            }
            if (missingClockOut) {
              updateFields.clock_out = newClockOut;
              updatedFields.push(`Salida: ${newClockOut}`);
            }

            updateFields.worked_hours = workedHours;
            updateFields.regular_hours = overtime.regular;
            updateFields.overtime_hours_25 = overtime.overtime_25;
            updateFields.overtime_hours_35 = overtime.overtime_35;
            updateFields.is_late = isLate;
            updateFields.late_minutes = lateMinutes;
            updateFields.is_absent = isAbsent;
            updateFields.status = status;
            updateFields.notes = `${existingRecord.notes || ''}\nActualizado desde duplicado (ID externo: ${record.id}) - ${updatedFields.join(', ')}`.trim();
            updateFields.updated_date = new Date();

            log(`[ACTUALIZAR DUPLICADO] ID ${record.id} - ${employee.first_name} ${employee.last_name} (${record.numero_documento}) - ${record.fecha} - Campos actualizados: ${updatedFields.join(', ')} - Horas recalculadas: ${workedHours.toFixed(2)}, Estado: ${status}`);

            if (!dryRun) {
              await prisma.attendance_record.update({
                where: { id: existingRecord.id },
                data: updateFields
              });
              savedRecordIds.push(existingRecord.id);
            }

            totalUpdated++;
            externalIdsToConfirm.push(record.id);
            continue;
          }

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

        const scheduleInfo = getScheduleForDate(workSchedule, recordDate);

        const clockIn = record.hora_entrada || null;
        const clockOut = record.hora_salida || null;
        const scheduledStart = scheduleInfo?.scheduledStart || '08:00';
        const scheduledEnd = scheduleInfo?.scheduledEnd || '17:00';
        const breakMinutes = scheduleInfo?.breakMinutes || 60;

        const workedHours = (clockIn && clockOut)
          ? calcWorkedHours(clockIn, clockOut, breakMinutes)
          : 0;

        const lateMinutes = clockIn ? calcLateMinutes(scheduledStart, clockIn) : 0;
        const isLate = lateMinutes > 0;
        const isAbsent = !clockIn || !clockOut;

        const overtime = calcOvertimeHours(workedHours);

        let status = 'Completo';
        if (isAbsent) {
          status = 'Ausente';
        } else if (isLate) {
          status = 'Tardanza';
        }

        const attendanceData = {
          employee_id: employee.id,
          employee_name: `${employee.first_name} ${employee.last_name}`,
          document_number: record.numero_documento,
          date: recordDate,
          clock_in: clockIn,
          clock_out: clockOut,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          worked_hours: workedHours,
          regular_hours: overtime.regular,
          overtime_hours_25: overtime.overtime_25,
          overtime_hours_35: overtime.overtime_35,
          overtime_authorized: false,
          is_late: isLate,
          late_minutes: lateMinutes,
          is_absent: isAbsent,
          status: status,
          notes: `Registro sincronizado desde API externa (ID externo: ${record.id})`,
          updated_date: new Date(),
          external_id: record.id
        };

        if (existingRecord) {
          recordsToUpdate.push(attendanceData);
          log(`[ACTUALIZAR] ID ${record.id} - ${attendanceData.employee_name} (${record.numero_documento}) - ${record.fecha} - Entrada: ${clockIn}, Salida: ${clockOut}, Horas: ${workedHours.toFixed(2)}, Estado: ${status}`);

          if (!dryRun) {
            await prisma.attendance_record.update({
              where: { id: existingRecord.id },
              data: {
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
                updated_date: attendanceData.updated_date
              }
            });
            savedRecordIds.push(existingRecord.id);
          }
          totalUpdated++;
        } else {
          recordsToSave.push(attendanceData);
          log(`[GUARDAR] ID ${record.id} - ${attendanceData.employee_name} (${record.numero_documento}) - ${record.fecha} - Entrada: ${clockIn}, Salida: ${clockOut}, Horas: ${workedHours.toFixed(2)}, Estado: ${status}`);

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
          }
          totalSaved++;
        }

        externalIdsToConfirm.push(record.id);

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
