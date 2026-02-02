import { fileURLToPath } from 'url';
import { dirname, join } from 'path';  // ← FIJO: sin 'path'
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';

import authRoutes from './routes/auth.js';
import employeeRoutes from './routes/employees.js';
import masterDataRoutes from './routes/masterData.js';
import employeeChangelogRoutes from './routes/employeeChangelog.js';
import contractRoutes from './routes/contracts.js';
import userRolesRoutes from './routes/userRoles.js';

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

// Middlewares
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));

// Morgan logs
const accessLogStream = fs.createWriteStream(join(logsDir, 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream, skip: (req, res) => res.statusCode < 400 }));
app.use(morgan('dev', { skip: (req, res) => res.statusCode >= 400 }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`📥 ${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

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
    headers: req.headers.authorization ? 'Bearer ***' : 'No auth'
  };

  console.error('🚨 ERROR DETALLADO:', JSON.stringify(errorInfo, null, 2));

  res.status(err.status || 500).json({
    error: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// TUS RUTAS (exactas)
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/master-data', masterDataRoutes);
app.use('/api/employees/changelog', employeeChangelogRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/users/roles', userRolesRoutes);
app.use('/api/contracts/clauses', clausesRoutes);
app.use('/api/contracts/templates', templatesContractRoutes);
app.use('/api/contracts/renewal-rules', renewalRulesRoutes);
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
app.use('/api/database/connections', connectionsRoutes);
app.use('/api/sync/logs', logsRoutes);
app.use('/api/holidays', holidaysRoutes);
app.use('/api/attendance/incidents', attendanceIncidentsRoutes);

// 404
app.use((req, res) => {
  console.log(`404 ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// ERROR HANDLER
app.use((err, req, res) => {
  console.error('ERROR:', {
    time: new Date().toISOString(),
    method: req.method,
    url: req.url,
    message: err.message,
    stack: err.stack
  });
  res.status(500).json({ error: 'Server Error', ...(process.env.NODE_ENV === 'development' && { message: err.message }) });
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  console.log(`Logs: ${logsDir}`);
});

