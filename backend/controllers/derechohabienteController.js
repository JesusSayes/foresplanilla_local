import prisma from "../config/prisma.js"

import { generate24HexId } from '../utils/idGenerator.js'

export const getAll = async (req, res) => {
  try {

    const { sort = '-created_date' } = req.query
    const desc = sort.startsWith('-')
    const field = sort.replace('-', '')

    const derechohabientes = await prisma.derechohabiente.findMany({
      orderBy: {
        [field]: desc ? 'desc' : 'asc'
      }
    })

    res.json(derechohabientes)

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const getById = async (req, res) => {
  try {

    const derechohabiente = await prisma.derechohabiente.findUnique({
      where: { id: req.params.id }
    })

    if (!derechohabiente)
      return res.status(404).json({ error: 'Derechohabiente not found' })

    res.json(derechohabiente)

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const create = async (req, res) => {
  try {

    const { id, created_date, updated_date, created_by, ...data } = req.body

    const derechohabiente = await prisma.derechohabiente.create({
      data: {
        id: generate24HexId(),
        created_date: new Date(),
        updated_date: new Date(),
        created_by: req.user?.username || req.user?.email || 'system',

        employee_id: data.employee_id,
        document_type: data.document_type,
        document_number: data.document_number,
        first_name: data.first_name,
        last_name: data.last_name,
        gender: data.gender,
        relationship: data.relationship,
        is_active: data.is_active,
        is_studying: data.is_studying,
        study_proof_url: data.study_proof_url,

        birth_date: data.birth_date
          ? new Date(data.birth_date)
          : null,

        registration_date: data.registration_date
          ? new Date(data.registration_date)
          : null
      }
    })

    res.status(201).json(derechohabiente)

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const update = async (req, res) => {
  try {

    const { id, created_date, updated_date, created_by, ...data } = req.body

    const derechohabiente = await prisma.derechohabiente.update({
      where: { id: req.params.id },
      data: {

        employee_id: data.employee_id,
        document_type: data.document_type,
        document_number: data.document_number,
        first_name: data.first_name,
        last_name: data.last_name,
        gender: data.gender,
        relationship: data.relationship,
        is_active: data.is_active,
        is_studying: data.is_studying,
        study_proof_url: data.study_proof_url,

        birth_date: data.birth_date
          ? new Date(data.birth_date)
          : null,

        registration_date: data.registration_date
          ? new Date(data.registration_date)
          : null,

        updated_date: new Date()
      }
    })

    res.json(derechohabiente)

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const remove = async (req, res) => {
  try {

    await prisma.derechohabiente.delete({
      where: { id: req.params.id }
    })

    res.status(204).send()

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const filter = async (req, res) => {
  try {

    const { sort = '-created_date' } = req.query
    const desc = sort.startsWith('-')
    const field = sort.replace('-', '')

    const filters = req.body || {}
    const where = {}

    if (filters.employee_id) {
      where.employee_id = filters.employee_id
    }

    if (filters.first_name) {
      where.first_name = {
        contains: filters.first_name,
        mode: 'insensitive'
      }
    }

    if (filters.last_name) {
      where.last_name = {
        contains: filters.last_name,
        mode: 'insensitive'
      }
    }

    if (filters.document_number) {
      where.document_number = filters.document_number
    }

    if (filters.relationship) {
      where.relationship = filters.relationship
    }

    if (filters.is_active !== undefined) {
      where.is_active = filters.is_active
    }

    const derechohabientes = await prisma.derechohabiente.findMany({
      where,
      orderBy: {
        [field]: desc ? 'desc' : 'asc'
      }
    })

    res.json(derechohabientes)

  } catch (error) {
    console.error('Error filtering derechohabientes:', error)
    res.status(500).json({ error: error.message })
  }
}

const controller = {
  getAll,
  getById,
  create,
  update,
  delete: remove,
  filter
}

export default controller
