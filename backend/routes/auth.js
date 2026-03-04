import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login - Iniciar sesión
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validar campos requeridos
    if (!email || !password) {
      return res.status(400).json({
        error: 'Datos incompletos',
        message: 'Email y contraseña son requeridos'
      });
    }

    console.log('Intentando login con email:', email);

    // Buscar usuario por email
    const result = await query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email.toLowerCase()]
    );

    console.log('Usuarios encontrados:', result.rows.length);

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Credenciales inválidas',
        message: 'Email o contraseña incorrectos'
      });
    }

    const user = result.rows[0];
    console.log('Usuario encontrado:', user.email, '| Hash existe:', !!user.password_hash);

    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    console.log('Contraseña válida:', isValidPassword);

    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Credenciales inválidas',
        message: 'Email o contraseña incorrectos'
      });
    }

    // Generar token JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        email: user.email,
        full_name: user.full_name
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Retornar token y datos del usuario
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        created_date: user.created_date
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Ocurrió un error al procesar la solicitud'
    });
  }
});

// GET /api/auth/me - Obtener usuario actual
// router.get('/me', authenticateToken, async (req, res) => {
  // try {
    // const user = await prisma.users.findUnique({
      // where: { id: req.user.userId },
      // select: {
        // id: true,
        // email: true,
        // full_name: true,
        // role: true,
        // is_active: true,
        // created_at: true,
        // updated_at: true
      // }
    // });

    // if (!user) {
      // return res.status(404).json({ error: 'Usuario no encontrado' });
    // }

    // NUEVO: Buscar empleado asociado
    // const employee = await prisma.employee.findFirst({
      // where: { work_email: user.email },
      // select: {
        // id: true,
        // employee_code: true,
        // first_name: true,
        // last_name: true,
        // role: true,
        // status: true,
        // position_name: true,
        // department_name: true
      // }
    // });

    // res.json({
      // user: {
        // ...user,
        // employee: employee || null  // Incluir datos de empleado
      // }
    // });
  // } catch (error) {
    // console.error('Error en /me:', error);
    // res.status(500).json({ error: 'Error al obtener usuario' });
  // }
// });
// GET /api/auth/me - Obtener usuario actual
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Obtener datos del usuario desde la tabla users
    const userResult = await query(
      'SELECT id, email, full_name, role, is_active, created_date, updated_date FROM users WHERE id = $1',
      [req.user.userId]  // viene del JWT (authenticateToken)
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = userResult.rows[0];

    // Buscar empleado asociado por correo (work_email)
    const employeeResult = await query(
      `SELECT
         id,
         employee_code,
         first_name,
         last_name,
         role,
         status,
         department_name,
         document_type,
         document_number,
         birth_date,
         work_email,
         position,
         hire_date,
         contract_type,
         photo_url,
         supervisor_name,
         phone,
         mobile,
         personal_email,
         address,
         district,
         province,
         department,
         emergency_contact_name,
         emergency_contact_phone,
         emergency_contact_relationship
       FROM employee
       WHERE work_email = $1
       LIMIT 1`,
      [user.email]
    );

    const employee = employeeResult.rows[0] || null;

    // Responder con user + employee
    res.json({
      user: {
        ...user,
        employee,
      },
    });
  } catch (error) {
    console.error('Error en /me:', error);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});


// POST /api/auth/logout - Cerrar sesión (opcional, el logout es del lado del cliente)
router.post('/logout', authenticateToken, (req, res) => {
  // En un sistema con JWT stateless, el logout se maneja en el cliente
  // eliminando el token. Aquí podríamos agregar el token a una blacklist
  // si quisiéramos invalidarlo antes de su expiración.
  res.json({
    success: true,
    message: 'Sesión cerrada exitosamente'
  });
});

// POST /api/auth/register - Registrar nuevo usuario (opcional)
router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name } = req.body;

    // Validar campos requeridos
    if (!email || !password) {
      return res.status(400).json({
        error: 'Datos incompletos',
        message: 'Email y contraseña son requeridos'
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'Usuario existente',
        message: 'Ya existe un usuario con ese email'
      });
    }

    // Hash de la contraseña
    const passwordHash = await bcrypt.hash(password, 10);

    // Insertar nuevo usuario
    const result = await query(
      'INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name, created_date',
      [email.toLowerCase(), passwordHash, full_name || null]
    );

    const newUser = result.rows[0];

    // Generar token JWT
    const token = jwt.sign(
      {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(201).json({
      success: true,
      token,
      user: newUser
    });

  } catch (error) {
    console.error('Error en register:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Ocurrió un error al registrar el usuario'
    });
  }
});

// PUT /api/auth/change-password - Cambiar contraseña del usuario autenticado
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'La nueva contraseña es requerida' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await query(
      'UPDATE users SET password_hash = $1, updated_date = NOW() WHERE id = $2',
      [passwordHash, req.user.userId]
    );

    res.json({ success: true, message: 'Contraseña actualizada exitosamente' });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  }
});

export default router;
