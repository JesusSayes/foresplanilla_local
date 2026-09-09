import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Envía un correo de invitación al sistema de RRHH a un nuevo usuario.
 * Migrado desde el cliente (UserManagement) para proteger créditos de integración.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { to, name } = body;

    if (!to || !to.includes('@')) {
      return Response.json({ error: 'Email destinatario inválido' }, { status: 400 });
    }

    const subject = "Invitación al Sistema de RRHH";
    const bodyText = `
Hola ${name || ''},

Has sido invitado a unirte al Sistema de Recursos Humanos de la empresa.

Por favor, revisa tu correo electrónico para encontrar el enlace de invitación oficial y configurar tu cuenta.

Tu email de acceso será: ${to}

Saludos,
Equipo de Recursos Humanos
    `;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to,
      subject,
      body: bodyText,
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});