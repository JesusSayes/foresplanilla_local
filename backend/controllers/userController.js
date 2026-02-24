// backend/controllers/userController.js
import { PrismaClient } from '@prisma/client';
import { generate24HexId } from '../utils/idGenerator.js';

const prisma = new PrismaClient();

export const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.users.findMany({
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        is_active: true,
        created_date: true,
        updated_date: true,
        disabled: true,
        is_verified: true,
        app_id: true,
        is_service: true,
        app_role: true,
      },
      orderBy: { created_date: 'desc' },
    });
    res.json(users);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.users.findUnique({
      where: { id }, // String
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        is_active: true,
        created_date: true,
        updated_date: true,
        disabled: true,
        is_verified: true,
        app_id: true,
        is_service: true,
        app_role: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
};

export const createUser = async (req, res) => {
  try {
    const { email, password, full_name, role, is_active } = req.body;

    const bcrypt = await import('bcrypt');
    const password_hash = password ? await bcrypt.hash(password, 10) : null;

    const user = await prisma.users.create({
      data: {
        id: generate24HexId(),              // usa tu util
        email,
        password_hash,
        full_name,
        role: role || 'user',
        is_active: is_active ?? true,
        // created_date: @default(now())
        // updated_date: @updatedAt
        disabled: null,
        is_verified: false,
        app_id: null,
        is_service: false,
        app_role: null,
      },
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        is_active: true,
        created_date: true,
      },
    });

    res.status(201).json(user);
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      email,
      full_name,
      role,
      is_active,
      password,
      disabled,
      is_verified,
      app_id,
      is_service,
      app_role,
    } = req.body;

    const updateData = {
      email,
      full_name,
      role,
      is_active,
      disabled,
      is_verified,
      app_id,
      is_service,
      app_role,
      // updated_date lo maneja Prisma con @updatedAt
    };

    if (password) {
      const bcrypt = await import('bcrypt');
      updateData.password_hash = await bcrypt.hash(password, 10);
    }

    const user = await prisma.users.update({
      where: { id }, // String, sin parseInt
      data: updateData,
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        is_active: true,
        updated_date: true,
        disabled: true,
        is_verified: true,
        app_id: true,
        is_service: true,
        app_role: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.users.delete({
      where: { id }, // String
    });
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
};

