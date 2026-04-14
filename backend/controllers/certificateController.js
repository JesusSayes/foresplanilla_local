import prisma from "../config/prisma.js";

export const getAll = async (req, res) => {
  try {
    const certificates = await prisma.certificate.findMany({
      include: { employee: true },
      orderBy: { requestedAt: 'desc' }
    });
    res.json(certificates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try {
    const certificate = await prisma.certificate.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { employee: true }
    });
    if (!certificate) return res.status(404).json({ error: 'Certificate not found' });
    res.json(certificate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const certificate = await prisma.certificate.create({
      // data: req.body
      data: {}
    });
    res.status(201).json(certificate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const certificate = await prisma.certificate.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(certificate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.certificate.delete({
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
