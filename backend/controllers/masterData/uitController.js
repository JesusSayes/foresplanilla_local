import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAll = async (req, res) => {
  try {
    const { sort = '-year' } = req.query;
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;

    const records = await prisma.uit.findMany({
      orderBy: { [field]: desc ? 'desc' : 'asc' },
    });

    res.json(records);
  } catch (error) {
    console.error('Error fetching UIT records:', error);
    res.status(500).json({ error: error.message });
  }
};

const controller = { getAll };
export default controller;

