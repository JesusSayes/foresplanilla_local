import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Envía un correo de alerta de contrato próximo a vencer a una lista de destinatarios.
 * Migrado desde el cliente (ProcessRenewalModal) para proteger créditos de integración.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { to, employeeName, position, contractType, endDate, daysUntilExpiration, autoCreateDraft } = body;

    if (!to || !employeeName) {
      return Response.json({ error: 'Faltan parámetros requeridos (to, employeeName)' }, { status: 400 });
    }

    const subject = `Alerta: Contrato próximo a vencer - ${employeeName}`;
    const bodyText = `El contrato del empleado ${employeeName} está próximo a vencer.\n\n- Cargo: ${position || ""}\n- Tipo: ${contractType || ""}\n- Vence: ${endDate || ""}\n- Días restantes: ${daysUntilExpiration ?? ""}\n\n${autoCreateDraft ? "Se ha creado un borrador de renovación automáticamente." : "Por favor, revisa la renovación."}`;

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