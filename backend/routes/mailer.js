import express from 'express';
import { sendEmail } from '../utils/mailer.js';
import { authenticateToken } from '../middleware/auth.js';

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

export default router;
