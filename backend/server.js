import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import morganBody from 'morgan-body';
import cron from 'node-cron';

import authRoutes from './routes/auth.js';
import employeeRoutes from './routes/employees.js';
import masterDataRoutes from './routes/masterData.js';
import employeeChangelogRoutes from './routes/employeeChangelog.js';
import contractRoutes from './routes/contracts.js';
import userRolesRoutes from './routes/userRoles.js';
import rolesRoutes from './routes/roles.js';
import usersRoutes from './routes/users.js';

import clausesRoutes from './routes/contracts/clauses.js';
import templatesContractRoutes from './routes/contracts/templates.js';
import renewalRulesRoutes from './routes/contracts/renewal-rules.js';
import recordsRoutes from './routes/attendance/records.js';
import incidentsRoutes from './routes/attendance/incidents.js';
import overtimeAlertRoutes from './routes/attendance/overtimeAlerts.js';
import schedulesRoutes from './routes/attendance/schedules.js';
import attendanceIncidentsRoutes from './routes/attendance/incidents.js';
import attendanceLogsRoutes from './routes/attendance/logs.js';
import attendanceEditRequestsRoutes from './routes/attendance/editRequests.js';
import recalcularAsistenciaRoutes from './routes/attendance/recalcularAsistencia.js';
import attendanceBackfillRoutes from './routes/attendance/backfill.js';
import externalAttendanceRoutes from './routes/attendance/externalAttendanceRoutes.js';
import requestsRoutes from './routes/vacations/requests.js';
import balancesRoutes from './routes/vacations/balances.js';
import payrollRoutes from './routes/payroll/payslips.js';
import templatesRoutes from './routes/payroll/templates.js';
import conceptsRoutes from './routes/payroll/concepts.js';
import loanTypesRoutes from './routes/payroll/loan-types.js';
import loansRoutes from './routes/payroll/loans.js';
import loanInstallmentsRoutes from './routes/payroll/loan-installments.js';
import payrollConfigRoutes from "./routes/payroll/config.js";
import certificatesRoutes from './routes/certificates.js';
import notificationsRoutes from './routes/notifications.js';
import notificationPreferencesRoutes from './routes/notificationPreferences.js';
import notificationRecipientsRoutes from './routes/notificationRecipients.js';
import contractNotificationsRoutes from './routes/contractNotifications.js';
import afpChangeHistoryRoutes from './routes/afpChangeHistory.js';
import infoRoutes from './routes/company/info.js';
import costcentersRoutes from './routes/cost-centers.js';
import costCenterCategoriesRoutes from './routes/costCenterCategories.js';
import costCenterAssignmentsRoutes from './routes/costCenterAssignments.js';
import costCenterChangeLogsRoutes from './routes/costCenterChangeLogs.js';
import connectionsRoutes from './routes/database/connections.js';
import logsRoutes from './routes/sync/logs.js';
import biotimeSyncRoutes from './routes/sync/biotime.js';
import holidaysRoutes from './routes/holidays.js';
import mailerRoutes from './routes/mailer.js';
import { syncBiotimeAttendance } from './controllers/sync/biotimeSyncController.js';
import uploadRoutes from "./routes/uploadRoutes.js";
import derechohabientesRoutes from './routes/derechohabientes.js';
import { generarAsistenciaDiaria } from './scripts/generarAsistenciaDiaria.js';
import { updateTerminatedEmployeeStatuses } from './scripts/updateTerminatedEmployeeStatuses.js';
import { calcularAsistenciaDesdeLogs } from './scripts/calcularAsistenciaDesdeLogs.js';
import { syncExternalAttendance } from './services/externalAttendanceSync.js';
import asientosContablesRoutes from './routes/asientosContables.js';
import cuentasContablesRoutes from './routes/cuentasContables.js';
import incidentTypesRoutes from './routes/incidentTypes.js';
import subdiariosRoutes from './routes/subdiarios.js';
import tipoAnexosRoutes from './routes/tipoAnexos.js';
import historialRemunerativoRoutes from './routes/historialRemunerativo.js';
import dniRoutes from './routes/dni.js';
import { notifyExpiringContracts } from './services/contractNotificationService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Crear directorio logs
const logsDir = join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// Body parsers (DEBEN ir antes de las rutas)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Morgan logs
const accessLogStream = fs.createWriteStream(join(logsDir, 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream, skip: (req, res) => res.statusCode < 400 }));
app.use(morgan('dev', { skip: (req, res) => res.statusCode >= 400 }));

// Morgan-body para ver body de requests/responses en consola
morganBody(app, {
  maxBodyLength: 1000,          // evita logs gigantes
  logRequestBody: true,
  logResponseBody: true,
  // opcional: solo loggear JSON
  filterParameters: ['password', 'token'],
  // sólo loguear si el status es 4xx o 5xx
  skip: (req, res) => res.statusCode < 400,
});

// Request logging simple
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// RUTAS API
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/master-data', masterDataRoutes);
app.use('/api/employees/changelog', employeeChangelogRoutes);
app.use('/api/users/roles', userRolesRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/contracts/clauses', clausesRoutes);
app.use('/api/contracts/templates', templatesContractRoutes);
app.use('/api/contracts/renewal-rules', renewalRulesRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/attendance/records', recordsRoutes);
app.use('/api/attendance/incidents', incidentsRoutes);
app.use('/api/attendance/overtime-alerts', overtimeAlertRoutes);
app.use('/api/attendance/schedules', schedulesRoutes);
app.use('/api/attendance/incidents', attendanceIncidentsRoutes);
app.use('/api/attendance/recalcular', recalcularAsistenciaRoutes);
app.use('/api/attendance/backfill', attendanceBackfillRoutes);
app.use('/api/attendance/external', externalAttendanceRoutes);
app.use('/api/attendance/logs', attendanceLogsRoutes);
app.use('/api/attendance/edit-requests', attendanceEditRequestsRoutes);
app.use('/api/vacations/requests', requestsRoutes);
app.use('/api/vacations/balances', balancesRoutes);
app.use('/api/payroll/payslips', payrollRoutes);
app.use('/api/payroll/templates', templatesRoutes);
app.use('/api/payroll/concepts', conceptsRoutes);
app.use('/api/payroll/loan-types', loanTypesRoutes);
app.use('/api/payroll/loans', loansRoutes);
app.use('/api/payroll/loan-installments', loanInstallmentsRoutes);
app.use('/api/payroll/config', payrollConfigRoutes);
app.use('/api/certificates', certificatesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/notification-preferences', notificationPreferencesRoutes);
app.use('/api/notification-recipients', notificationRecipientsRoutes);
app.use('/api/contract-notifications', contractNotificationsRoutes);
app.use('/api/afp-change-history', afpChangeHistoryRoutes);
app.use('/api/company/info', infoRoutes);
app.use('/api/cost-centers', costcentersRoutes);
app.use('/api/cost-center-categories', costCenterCategoriesRoutes);
app.use('/api/cost-center-assignments', costCenterAssignmentsRoutes);
app.use('/api/cost-center-changelogs', costCenterChangeLogsRoutes);
app.use('/api/database/connections', connectionsRoutes);
app.use('/api/sync/logs', logsRoutes);
app.use('/api/sync/biotime', biotimeSyncRoutes);
app.use('/api/holidays', holidaysRoutes);
app.use('/api/master-data', masterDataRoutes);
app.use('/api/mailer', mailerRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/uploads", express.static(path.join(process.cwd(), 'uploads')));
app.use('/api/derechohabientes', derechohabientesRoutes);
app.use('/api/asientos-contables', asientosContablesRoutes);
app.use('/api/cuentas-contables', cuentasContablesRoutes);
app.use('/api/incident-types', incidentTypesRoutes);
app.use('/api/subdiarios', subdiariosRoutes);
app.use('/api/tipo-anexos', tipoAnexosRoutes);
app.use('/api/historial-remunerativo', historialRemunerativoRoutes);
app.use('/api/dni', dniRoutes);

// Cron configuration
const CRON_TIMEZONE = process.env.CRON_TIMEZONE || 'America/Lima';
let biotimeSyncJob = Promise.resolve();
let biotimeSyncRunning = false;

// Cron: sincronización biotime cada hora
cron.schedule('0 * * * *', () => {
  if (biotimeSyncRunning) {
    console.log('[Cron] Sync biotime omitido: ejecución previa en curso');
    return;
  }

  console.log('[Cron] Ejecutando sync biotime...');
  biotimeSyncRunning = true;

  biotimeSyncJob = syncBiotimeAttendance()
    .catch(err => console.error('[Cron] Error en sync biotime:', err.message))
    .finally(() => {
      biotimeSyncRunning = false;
    });
}, { timezone: CRON_TIMEZONE });

// Cron: calcular asistencia desde logs cada hora (10 minutos después del sync biotime)
// cron.schedule('10 * * * *', async () => {
  // console.log('[Cron] Ejecutando calcularAsistenciaDesdeLogs...');

  // await biotimeSyncJob.catch(() => null);

  // calcularAsistenciaDesdeLogs().catch(err => console.error('[Cron] Error en calcularAsistenciaDesdeLogs:', err.message));
// }, { timezone: CRON_TIMEZONE });

// Cron: generar asistencia diaria a las 00:00 (medianoche hora local)
cron.schedule('0 0 * * *', () => {
  console.log('[Cron] Ejecutando generarAsistenciaDiaria...');
  updateTerminatedEmployeeStatuses()
    .then(result => console.log(`[Cron] Empleados actualizados a Cesado: ${result.updated}`))
    .then(() => generarAsistenciaDiaria({ mode: 'cron' }))
    .catch(err => console.error('[Cron] Error en generación diaria de asistencia:', err.message));
}, { timezone: CRON_TIMEZONE });

// Cron: sincronización de asistencias externas cada hora en minuto 15
if (process.env.NODE_ENV === 'production') {
  cron.schedule('0 9 * * *', () => {
    console.log('[Cron] Ejecutando notificación de contratos por vencer...');
    notifyExpiringContracts({ triggeredBy: 'scheduler' })
      .catch(err => console.error('[Cron] Error notificando contratos:', err.message));
  }, { timezone: CRON_TIMEZONE });

  cron.schedule('15 * * * *', () => {
    console.log('[Cron] Ejecutando sincronización de asistencias externas...');
    syncExternalAttendance().catch(err => console.error('[Cron] Error en sync asistencias externas:', err.message));
  }, { timezone: CRON_TIMEZONE });
} else{
  cron.schedule('15 * * * *', () => {
    console.log('[Cron] Ejecuta sincronización de asistencias externas...');
  }, { timezone: CRON_TIMEZONE });
}

// 404 handler
app.use((req, res) => {
  console.log(`404 ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// Error handler (AL FINAL)
app.use((err, req, res, next) => {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    status: err.status || 500,
    message: err.message,
    stack: err.stack,
    query: req.query,
    body: req.body,
    headers: req.headers.authorization ? 'Bearer ***' : 'No auth',
  };

  console.error('ERROR DETALLADO:', JSON.stringify(errorInfo, null, 2));

  res.status(err.status || 500).json({
    error: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  console.log(`Logs: ${logsDir}`);
  console.log('[Cron] Timezone configurado: ' + CRON_TIMEZONE);
  console.log('[Cron] Sync biotime programado cada hora (0 * * * *)');
  console.log('[Cron] Calcular asistencia desde logs programado cada hora en minuto 10 (10 * * * *)');
  console.log('[Cron] Generar asistencia diaria programado a las 00:00 (0 0 * * *)');
  console.log('[Cron] Sync asistencias externas programado cada hora en minuto 15 (15 * * * *)');
});
app.use("/uploads", (req, res, next) => {
  console.log('Static request:', req.path, 'from', process.cwd());
  next();
}, express.static(path.join(process.cwd(), 'uploads')));
