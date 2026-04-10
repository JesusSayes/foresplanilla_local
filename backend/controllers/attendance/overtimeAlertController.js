import prisma from "../../config/prisma.js";

import { generate24HexId } from '../../utils/idGenerator.js'

export const getAll = async (req, res) => {
  try {
    const alerts = await prisma.overtime_alert.findMany({
      orderBy: { created_date: 'desc' }
    })

    res.json(alerts)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const getById = async (req, res) => {
  try {
    const alert = await prisma.overtime_alert.findUnique({
      where: { id: req.params.id }
    })

    if (!alert) return res.status(404).json({ error: 'Alert not found' })

    res.json(alert)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const create = async (req, res) => {
  try {

    const userEmail = req.user?.email || 'system';
    const { alert_date, ...data } = req.body

    const alert = await prisma.overtime_alert.create({
      data: {
        id: generate24HexId(),
        alert_date: new Date(alert_date),

        ...data,

        created_date: new Date(),
        updated_date: new Date(),
        created_by: userEmail,
      }
    })

    res.status(201).json(alert)

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const update = async (req, res) => {
  try {

    const { created_date, created_by, ...data } = req.body

    const alert = await prisma.overtime_alert.update({
      where: { id: req.params.id },
      data: {
        ...data,
        updated_date: new Date()
      }
    })

    res.json(alert)

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const remove = async (req, res) => {
  try {

    await prisma.overtime_alert.delete({
      where: { id: req.params.id }
    })

    res.status(204).send()

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const filter = async (req, res) => {
  try {

    const filters = req.body || {}

    const where = {}

    if (filters.employee_id)
      where.employee_id = filters.employee_id

    if (filters.status)
      where.status = filters.status

    const alerts = await prisma.overtime_alert.findMany({
      where,
      orderBy: { created_date: 'desc' }
    })

    res.json(alerts)

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export default {
  getAll,
  getById,
  create,
  update,
  delete: remove,
  filter
}
