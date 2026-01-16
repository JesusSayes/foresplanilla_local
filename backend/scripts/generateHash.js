import bcrypt from 'bcryptjs';

async function generateHash() {
  const password = 'admin123';
  const hash = await bcrypt.hash(password, 10);
  
  console.log('='.repeat(60));
  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('='.repeat(60));
  console.log('\n--- SQL Query para actualizar ---');
  console.log(`UPDATE users SET password_hash = '${hash}' WHERE email = 'admin@pama.com';`);
  console.log('\n--- SQL Query para INSERT ---');
  console.log(`INSERT INTO users (id, email, password_hash, role, full_name, is_active)`);
  console.log(`VALUES (3, 'admin@pama.com', '${hash}', 'admin', 'Admin PAMA', true)`);
  console.log(`ON CONFLICT (id) DO UPDATE SET password_hash = '${hash}';`);
  console.log('='.repeat(60));
  
  // Verificar que funciona
  const isValid = await bcrypt.compare(password, hash);
  console.log('\n✅ Verificación:', isValid ? 'CORRECTO' : 'ERROR');
}

generateHash();
