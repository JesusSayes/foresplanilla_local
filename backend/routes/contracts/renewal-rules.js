import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const rules = await prisma.contract_renewal_rule.findMany({
      orderBy: { created_date: 'desc' }
    });
    res.json(rules);
  } catch (error) {
    console.error('Error al obtener reglas:', error);
    res.status(500).json({ error: 'Error al obtener reglas' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const rule = await prisma.contract_renewal_rule.create({
      data: {
        id: uuidv4(),
        ...req.body,
        created_by_id: req.user?.id,
        created_by: req.user?.full_name,
        created_date: new Date(),
        updated_date: new Date()
      }
    });

    res.status(201).json(rule);
  } catch (error) {
    console.error('Error al crear regla:', error);
    res.status(500).json({ error: 'Error al crear regla' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const rule = await prisma.contract_renewal_rule.update({
      where: { id },
      data: {
        ...req.body,
        updated_date: new Date()
      }
    });

    res.json(rule);
  } catch (error) {
    console.error('Error al actualizar regla:', error);
    res.status(500).json({ error: 'Error al actualizar regla' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.contract_renewal_rule.delete({
      where: { id }
    });
    res.json({ message: 'Regla eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar regla:', error);
    res.status(500).json({ error: 'Error al eliminar regla' });
  }
});

export default router;
