import prisma from "../config/prisma.js";
import { generate24HexId } from "../utils/idGenerator.js";

const toCuentaContable = (record) => ({
  ...record,
  descripcion: record.nombre,
  tipo: record.elemento,
});

const toAccountingAccount = (payload) => {
  const { descripcion, tipo, ...rest } = payload;
  return {
    ...rest,
    nombre: descripcion,
    elemento: tipo,
  };
};

export const getAll = async (req, res) => {
  try {
    const { sort = "cuenta" } = req.query;
    const desc = sort.startsWith("-");
    const field = desc ? sort.slice(1) : sort;
    const mappedField = field === "descripcion" ? "nombre" : field === "tipo" ? "elemento" : field;

    const records = await prisma.accountingaccount.findMany({
      orderBy: { [mappedField]: desc ? "desc" : "asc" },
    });

    res.json(records.map(toCuentaContable));
  } catch (error) {
    console.error("Error fetching cuentas contables:", error);
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await prisma.accountingaccount.findUnique({ where: { id } });

    if (!record) {
      return res.status(404).json({ error: "Cuenta contable no encontrada" });
    }

    res.json(toCuentaContable(record));
  } catch (error) {
    console.error("Error fetching cuenta contable by id:", error);
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const { id, created_date, updated_date, created_by_id, created_by, is_sample, ...rest } = req.body;
    const currentUser = req.user;
    const userId = currentUser?.userId || currentUser?.id || "system";
    const userEmail = currentUser?.email || "system";

    const record = await prisma.accountingaccount.create({
      data: {
        id: generate24HexId(),
        ...toAccountingAccount(rest),
        created_by_id: userId,
        created_by: userEmail,
        is_sample: false,
      },
    });

    res.status(201).json(toCuentaContable(record));
  } catch (error) {
    console.error("Error creating cuenta contable:", error);
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { created_date, created_by_id, created_by, is_sample, id: bodyId, ...rest } = req.body;

    const record = await prisma.accountingaccount.update({
      where: { id },
      data: toAccountingAccount(rest),
    });

    res.json(toCuentaContable(record));
  } catch (error) {
    console.error("Error updating cuenta contable:", error);
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.accountingaccount.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting cuenta contable:", error);
    res.status(500).json({ error: error.message });
  }
};

export default {
  getAll,
  getById,
  create,
  update,
  delete: remove,
};