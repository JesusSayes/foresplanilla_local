import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Cambia la contraseña de un usuario por email.
 * Solo puede ser ejecutado por un empleado con rol admin o super_admin.
 *
 * Params:
 *   requestingEmail → email del administrador que solicita el cambio
 *   targetEmail     → email del usuario cuya contraseña se cambiará
 *   newPassword     → nueva contraseña (mínimo 8 caracteres, con mayúsculas, minúsculas y números)
 */
export async function changeUserPassword({ requestingEmail, targetEmail, newPassword } = {}) {
  if (!requestingEmail || !targetEmail || !newPassword) {
    throw new Error('Se requieren requestingEmail, targetEmail y newPassword');
  }

  if (newPassword.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres');
  }

  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    throw new Error('La contraseña debe contener mayúsculas, minúsculas y números');
  }

  const adminEmployee = await prisma.employee.findFirst({
    where: { work_email: requestingEmail },
  });

  if (!adminEmployee || !['admin', 'super_admin'].includes(adminEmployee.role)) {
    throw new Error('Acceso denegado: se requiere rol de administrador');
  }

  const targetUser = await prisma.users.findFirst({
    where: { email: targetEmail },
  });

  if (!targetUser) {
    throw new Error('Usuario no encontrado');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.users.update({
    where: { id: targetUser.id },
    data: { password_hash: passwordHash, updated_date: new Date() },
  });

  return { success: true, message: 'Contraseña actualizada correctamente' };
}

if (process.argv[1].endsWith('changeUserPassword.js')) {
  const [,, requestingEmail, targetEmail, newPassword] = process.argv;
  changeUserPassword({ requestingEmail, targetEmail, newPassword })
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
