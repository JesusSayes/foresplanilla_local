import axios from 'axios';
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/consultar', authenticateToken, async (req, res) => {
  const dni = String(req.body?.dni || '').trim();
  if (!/^\d{8}$/.test(dni)) {
    return res.status(400).json({ success: false, error: 'DNI inválido' });
  }

  const token = process.env.PERU_DNI_TOKEN;
  if (!token) {
    return res.status(500).json({ success: false, error: 'Token de consulta DNI no configurado' });
  }

  try {
    const response = await axios.get(`https://apiperu.dev/api/dni/${dni}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
      validateStatus: () => true,
    });

    const status = response.status === 401 ? 502 : response.status;
    return res.status(status).json(response.data);
  } catch (error) {
    console.error('Error consultando DNI:', error.message);
    return res.status(502).json({ success: false, error: 'No se pudo consultar el DNI' });
  }
});

export default router;
