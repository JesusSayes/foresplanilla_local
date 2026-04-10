import prisma from "../../config/prisma.js";

export const getAll = async (req, res) => {
  try {
    const connections = await prisma.database_connection.findMany({
      // orderBy: { name: 'asc' }
      orderBy: { id: 'asc' }
    });
    res.json(connections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try {
    const connection = await prisma.database_connection.findUnique({
      where: { id: parseInt(req.params.id) }
    });
    if (!connection) return res.status(404).json({ error: 'Connection not found' });
    res.json(connection);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const connection = await prisma.database_connection.create({
      data: req.body
    });
    res.status(201).json(connection);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const connection = await prisma.database_connection.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(connection);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.database_connection.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const controller = {
  getAll,
  getById,
  create,
  update,
  delete: remove, // aquí sí usamos la clave "delete"
}

export default controller
