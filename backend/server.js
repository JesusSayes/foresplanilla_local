import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import morganBody from 'morgan-body';

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
import schedulesRoutes from './routes/attendance/schedules.js';
import requestsRoutes from './routes/vacations/requests.js';
import balancesRoutes from './routes/vacations/balances.js';
import payrollRoutes from './routes/payroll/payslips.js';
import templatesRoutes from './routes/payroll/templates.js';
import conceptsRoutes from './routes/payroll/concepts.js';
import certificatesRoutes from './routes/certificates.js';
import notificationsRoutes from './routes/notifications.js';
import infoRoutes from './routes/company/info.js';
import costcentersRoutes from './routes/cost-centers.js';
import costCenterCategoriesRoutes from './routes/costCenterCategories.js';
import costCenterAssignmentsRoutes from './routes/costCenterAssignments.js';
import costCenterChangeLogsRoutes from './routes/costCenterChangeLogs.js';
import connectionsRoutes from './routes/database/connections.js';
import logsRoutes from './routes/sync/logs.js';
import holidaysRoutes from './routes/holidays.js';
import attendanceIncidentsRoutes from './routes/attendance/incidents.js';

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
app.use('/api/attendance/schedules', schedulesRoutes);
app.use('/api/vacations/requests', requestsRoutes);
app.use('/api/vacations/balances', balancesRoutes);
app.use('/api/payroll/payslips', payrollRoutes);
app.use('/api/payroll/templates', templatesRoutes);
app.use('/api/payroll/concepts', conceptsRoutes);
app.use('/api/certificates', certificatesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/company/info', infoRoutes);
app.use('/api/cost-centers', costcentersRoutes);
app.use('/api/cost-center-categories', costCenterCategoriesRoutes);
app.use('/api/cost-center-assignments', costCenterAssignmentsRoutes);
app.use('/api/cost-center-changelogs', costCenterChangeLogsRoutes);
app.use('/api/database/connections', connectionsRoutes);
app.use('/api/sync/logs', logsRoutes);
app.use('/api/holidays', holidaysRoutes);
app.use('/api/attendance/incidents', attendanceIncidentsRoutes);
app.use('/api/master-data', masterDataRoutes);

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
});
