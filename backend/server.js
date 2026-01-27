import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Foresplanilla API'
  });
});

// Rutas
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

// Ruta 404
app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    message: `La ruta ${req.path} no existe`
  });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({
    error: 'Error del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Ocurrió un error inesperado'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`SERVER: Servidor corriendo en http://localhost:${PORT}`);
  console.log(`ENVIRONMENT: Ambiente: ${process.env.NODE_ENV}`);
  console.log(`CORS: CORS habilitado para: ${process.env.CORS_ORIGIN}`);
});
