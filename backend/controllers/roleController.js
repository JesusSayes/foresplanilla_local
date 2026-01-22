import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export const getAllRoles = async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { created_date: 'desc' }
    });
    res.json(roles);
  } catch (error) {
    console.error('Error al obtener roles:', error);
    res.status(500).json({ error: 'Error al obtener roles' });
  }
};

export const getRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    const role = await prisma.role.findUnique({
      where: { id }
    });

    if (!role) {
      return res.status(404).json({ error: 'Rol no encontrado' });
    }

    res.json(role);
  } catch (error) {
    console.error('Error al obtener rol:', error);
    res.status(500).json({ error: 'Error al obtener rol' });
  }
};

export const createRole = async (req, res) => {
  try {
    const { name, description, permissions, is_system_role, department_restricted, team_restricted, priority } = req.body;

    const role = await prisma.role.create({
      data: {
        id: uuidv4(),
        name,
        description,
        permissions: permissions || {},
        is_system_role: is_system_role || false,
        department_restricted: department_restricted || false,
        team_restricted: team_restricted || false,
        priority: priority || 0,
        created_by_id: req.user?.id,
        created_by: req.user?.full_name,
        created_date: new Date(),
        updated_date: new Date()
      }
    });

    res.status(201).json(role);
  } catch (error) {
    console.error('Error al crear rol:', error);
    res.status(500).json({ error: 'Error al crear rol' });
  }
};

export const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions, is_system_role, department_restricted, team_restricted, priority } = req.body;

    const role = await prisma.role.update({
      where: { id },
      data: {
        name,
        description,
        permissions,
        is_system_role,
        department_restricted,
        team_restricted,
        priority,
        updated_date: new Date()
      }
    });

    res.json(role);
  } catch (error) {
    console.error('Error al actualizar rol:', error);
    res.status(500).json({ error: 'Error al actualizar rol' });
  }
};

export const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.role.delete({
      where: { id }
    });
    res.json({ message: 'Rol eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar rol:', error);
    res.status(500).json({ error: 'Error al eliminar rol' });
  }
};
