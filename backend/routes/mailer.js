import express from 'express';
import { sendEmail } from '../utils/mailer.js';
import { authenticateToken } from '../middleware/auth.js';
import { loadAccessContext, requireAnyPermission } from '../middleware/authorization.js';

const router = express.Router();

router.post('/invite-user', authenticateToken, async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'El campo email es requerido' });
    }

    await sendEmail({
      to: email,
      subject: 'Invitación al Sistema de RRHH',
      body: `Hola ${name || ''},\n\nHas sido invitado a unirte al Sistema de Recursos Humanos de la empresa.\n\nPor favor, comunícate con nosotros para proceder a configurar tu cuenta.\n\nTu email de acceso será: ${email}\n\nSaludos,\nEquipo de Recursos Humanos`,
    });

    res.json({ success: true, message: `Invitación enviada a ${email}` });
  } catch (error) {
    console.error('Error enviando invitación:', error);
    res.status(500).json({ error: 'Error al enviar el email de invitación', detail: error.message });
  }
});

router.post(
  '/contract-renewal-alert',
  authenticateToken,
  loadAccessContext,
  requireAnyPermission('system.admin', 'contracts.manage_renewals'),
  async (req, res) => {
    try {
      const { to, employeeName, position, contractType, endDate, daysRemaining, draftCreated } = req.body;

      if (!to || !employeeName || !endDate) {
        return res.status(400).json({ error: 'Faltan datos requeridos para enviar la alerta' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return res.status(400).json({ error: 'El correo destinatario no es válido' });
      }

      await sendEmail({
        to,
        subject: `Alerta: Contrato próximo a vencer - ${employeeName}`,
        body: `El contrato del empleado ${employeeName} está próximo a vencer.\n\nDetalles:\n- Cargo: ${position || 'No especificado'}\n- Tipo: ${contractType || 'No especificado'}\n- Fecha de vencimiento: ${endDate}\n- Días restantes: ${Number.isFinite(Number(daysRemaining)) ? Number(daysRemaining) : 'No especificado'}\n\n${draftCreated ? 'Se ha creado un borrador de renovación automáticamente en el sistema.' : 'Por favor, revisa y gestiona la renovación del contrato.'}\n\nAccede al sistema para más detalles.`,
      });

      res.json({ success: true, message: `Alerta enviada a ${to}` });
    } catch (error) {
      console.error('Error enviando alerta de renovación:', error);
      res.status(500).json({ error: 'Error al enviar la alerta de renovación', detail: error.message });
    }
  }
);

export default router;
