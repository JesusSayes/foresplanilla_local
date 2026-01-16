import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import employeeRoutes from './routes/employees.js';
import masterDataRoutes from './routes/masterData.js';
import employeeChangelogRoutes from './routes/employeeChangelog.js';
import contractRoutes from './routes/contracts.js';
import userRolesRoutes from './routes/userRoles.js';

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
