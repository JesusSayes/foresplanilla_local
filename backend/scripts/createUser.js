import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';

async function createUser() {
  try {
    const email = 'admin@pama.com';
    const password = 'admin123';
    const full_name = 'Administrador';

    // Hash de la contraseña
    const passwordHash = await bcrypt.hash(password, 10);

    // Insertar usuario
    const result = await query(
      'INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name',
      [email, passwordHash, full_name]
    );

    console.log('OK: Usuario creado exitosamente:');
    console.log(result.rows[0]);
    console.log('\nCredenciales:');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);

    process.exit(0);
  } catch (error) {
    console.error('ERR: Error creando usuario:', error);
    process.exit(1);
  }
}

createUser();
