import prisma from "../../config/prisma.js";
import { generate24HexId } from "../../utils/idGenerator.js";

export const getAll = async (req, res) => {
  try {
    const configs = await prisma.payroll_config.findMany({
      orderBy: {
        created_date: "desc"
      }
    });

    res.json(configs);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = "-created_date" } = req.query;
    const filters = req.body || {};

    const where = {};

    if (filters.config_type) {
      where.config_type = filters.config_type;
    }

    if (typeof filters.is_active !== "undefined") {
      where.is_active = filters.is_active;
    }

    let orderBy = {
      created_date: "desc"
    };

    if (sort) {
      const desc = sort.startsWith("-");
      const field = sort.replace("-", "");

      const sortField =
        field === "created_date"
          ? "created_date"
          : field === "config_type"
          ? "config_type"
          : field;

      orderBy = {
        [sortField]: desc ? "desc" : "asc"
      };
    }

    const configs = await prisma.payroll_config.findMany({
      where,
      orderBy
    });

    res.json(configs);
  } catch (error) {
    console.error("Error filtering payroll config:", error);

    res.status(500).json({
      error: error.message
    });
  }
};

export const getById = async (req, res) => {
  try {
    const config = await prisma.payroll_config.findUnique({
      where: {
        id: req.params.id
      }
    });

    if (!config) {
      return res.status(404).json({
        error: "PayrollConfig not found"
      });
    }

    res.json(config);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

export const create = async (req, res) => {
  try {
    const {
      id,
      created_date,
      updated_date,
      created_by,
      updated_by,
      ...data
    } = req.body;

    const config = await prisma.payroll_config.create({
      data: {
        id: generate24HexId(),
        ...data
      }
    });

    res.status(201).json(config);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

export const update = async (req, res) => {
  try {
    const {
      id,
      created_date,
      updated_date,
      created_by,
      updated_by,
      ...data
    } = req.body;

    const config = await prisma.payroll_config.update({
      where: {
        id: req.params.id
      },
      data
    });

    res.json(config);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.payroll_config.delete({
      where: {
        id: req.params.id
      }
    });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

const controller = {
  getAll,
  getById,
  create,
  update,
  delete: remove,
  filter
};

export default controller;
