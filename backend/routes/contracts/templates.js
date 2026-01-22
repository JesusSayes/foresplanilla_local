// const express = require('express');
// const router = express.Router();
// const controller = require('../../controllers/contracts/templateController');
// const { authenticate } = require('../../middleware/auth');

// router.use(authenticate);

// router.get('/', controller.getAll);
// router.get('/:id', controller.getById);
// router.post('/', controller.create);
// router.put('/:id', controller.update);
// router.delete('/:id', controller.delete);

// module.exports = router;
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const templates = await prisma.contract_template.findMany({
      orderBy: { created_date: 'desc' }
    });
    res.json(templates);
  } catch (error) {
    console.error('Error al obtener plantillas:', error);
    res.status(500).json({ error: 'Error al obtener plantillas' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const template = await prisma.contract_template.findUnique({
      where: { id }
    });

    if (!template) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }

    res.json(template);
  } catch (error) {
    console.error('Error al obtener plantilla:', error);
    res.status(500).json({ error: 'Error al obtener plantilla' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const template = await prisma.contract_template.create({
      data: {
        id: uuidv4(),
        ...req.body,
        created_by_id: req.user?.id,
        created_by: req.user?.full_name,
        created_date: new Date(),
        updated_date: new Date()
      }
    });

    res.status(201).json(template);
  } catch (error) {
    console.error('Error al crear plantilla:', error);
    res.status(500).json({ error: 'Error al crear plantilla' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const template = await prisma.contract_template.update({
      where: { id },
      data: {
        ...req.body,
        updated_date: new Date()
      }
    });

    res.json(template);
  } catch (error) {
    console.error('Error al actualizar plantilla:', error);
    res.status(500).json({ error: 'Error al actualizar plantilla' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.contract_template.delete({
      where: { id }
    });
    res.json({ message: 'Plantilla eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar plantilla:', error);
    res.status(500).json({ error: 'Error al eliminar plantilla' });
  }
});

export default router;
