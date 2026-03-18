import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Verificar autenticación y que sea admin
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'No autenticado' }, { status: 401 });
        }

        // Solo admins pueden cambiar contraseñas de otros usuarios
        const employees = await base44.asServiceRole.entities.Employee.filter({ work_email: user.email });
        const employee = employees?.[0];
        if (!employee || !['admin', 'super_admin'].includes(employee.role)) {
            return Response.json({ error: 'Acceso denegado: se requiere rol de administrador' }, { status: 403 });
        }

        const { targetEmail, newPassword } = await req.json();

        if (!targetEmail || !newPassword) {
            return Response.json({ error: 'Se requieren targetEmail y newPassword' }, { status: 400 });
        }

        if (newPassword.length < 6) {
            return Response.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
        }

        // Buscar el usuario por email
        const users = await base44.asServiceRole.entities.User.filter({ email: targetEmail });
        if (!users || users.length === 0) {
            return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }

        const targetUser = users[0];

        // Actualizar la contraseña usando service role
        await base44.asServiceRole.entities.User.update(targetUser.id, { password: newPassword });

        return Response.json({ success: true, message: 'Contraseña actualizada correctamente' });

    } catch (error) {
        return Response.json({ error: error.message || 'Error al cambiar contraseña' }, { status: 500 });
    }
});