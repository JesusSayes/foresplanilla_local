import { query } from '../config/database.js';
import { buildSortQuery } from '../utils/queryBuilder.js';

const listMasterData = async (tableName, sortField = 'name') => {
  let sql = `SELECT * FROM ${tableName}`;
  sql = buildSortQuery(sql, sortField);
  const result = await query(sql);
  return result.rows;
};

const createMasterData = async (tableName, data, userId, userEmail) => {
  const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const fields = Object.keys(data);
  const values = Object.values(data);

  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
  const fieldNames = fields.join(', ');

  const sql = `
    INSERT INTO ${tableName} (
      ${fieldNames}, id, created_date, updated_date, created_by_id, created_by
    ) VALUES (
      ${placeholders}, $${fields.length + 1}, $${fields.length + 2},
      $${fields.length + 3}, $${fields.length + 4}, $${fields.length + 5}
    ) RETURNING *
  `;

  const allValues = [...values, id, new Date(), new Date(), userId, userEmail];
  const result = await query(sql, allValues);
  return result.rows[0];
};

const updateMasterData = async (tableName, id, data) => {
  const fields = [];
  const values = [];
  let paramIndex = 1;

  Object.entries(data).forEach(([key, value]) => {
    if (key !== 'id' && key !== 'created_date' && key !== 'created_by_id' && key !== 'created_by') {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  });

  fields.push(`updated_date = $${paramIndex}`);
  values.push(new Date());
  paramIndex++;

  values.push(id);

  const sql = `
    UPDATE ${tableName}
    SET ${fields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await query(sql, values);
  return result.rows[0];
};

const deleteMasterData = async (tableName, id) => {
  const result = await query(`DELETE FROM ${tableName} WHERE id = $1 RETURNING id`, [id]);
  return result.rows.length > 0;
};

export const listPositions = async (req, res) => {
  try {
    const { sort = 'name' } = req.query;
    const data = await listMasterData('position', sort);
    res.json(data);
  } catch (error) {
    console.error('Error listing positions:', error);
    res.status(500).json({ error: 'Error al listar posiciones' });
  }
};

export const createPosition = async (req, res) => {
  try {
    const data = await createMasterData('position', req.body, req.user.id, req.user.email);
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating position:', error);
    res.status(500).json({ error: 'Error al crear posición' });
  }
};

export const updatePosition = async (req, res) => {
  try {
    const data = await updateMasterData('position', req.params.id, req.body);
    if (!data) return res.status(404).json({ error: 'Posición no encontrada' });
    res.json(data);
  } catch (error) {
    console.error('Error updating position:', error);
    res.status(500).json({ error: 'Error al actualizar posición' });
  }
};

export const deletePosition = async (req, res) => {
  try {
    const deleted = await deleteMasterData('position', req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Posición no encontrada' });
    res.json({ success: true, message: 'Posición eliminada' });
  } catch (error) {
    console.error('Error deleting position:', error);
    res.status(500).json({ error: 'Error al eliminar posición' });
  }
};

export const listDepartments = async (req, res) => {
  try {
    const { sort = 'name' } = req.query;
    const data = await listMasterData('department', sort);
    res.json(data);
  } catch (error) {
    console.error('Error listing departments:', error);
    res.status(500).json({ error: 'Error al listar departamentos' });
  }
};

export const createDepartment = async (req, res) => {
  try {
    const data = await createMasterData('department', req.body, req.user.id, req.user.email);
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating department:', error);
    res.status(500).json({ error: 'Error al crear departamento' });
  }
};

export const updateDepartment = async (req, res) => {
  try {
    const data = await updateMasterData('department', req.params.id, req.body);
    if (!data) return res.status(404).json({ error: 'Departamento no encontrado' });
    res.json(data);
  } catch (error) {
    console.error('Error updating department:', error);
    res.status(500).json({ error: 'Error al actualizar departamento' });
  }
};

export const deleteDepartment = async (req, res) => {
  try {
    const deleted = await deleteMasterData('department', req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Departamento no encontrado' });
    res.json({ success: true, message: 'Departamento eliminado' });
  } catch (error) {
    console.error('Error deleting department:', error);
    res.status(500).json({ error: 'Error al eliminar departamento' });
  }
};

export const listBanks = async (req, res) => {
  try {
    const { sort = 'name' } = req.query;
    const data = await listMasterData('bank', sort);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar bancos' });
  }
};

export const listSites = async (req, res) => {
  try {
    const { sort = 'name' } = req.query;
    const data = await listMasterData('site', sort);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar sedes' });
  }
};

export const listAFPs = async (req, res) => {
  try {
    const { sort = 'name' } = req.query;
    const data = await listMasterData('afp', sort);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar AFPs' });
  }
};

export const listProfessions = async (req, res) => {
  try {
    const { sort = 'name' } = req.query;
    const data = await listMasterData('profession', sort);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar profesiones' });
  }
};

export const listUbigeos = async (req, res) => {
  try {
    const { sort = 'departamento' } = req.query;
    const data = await listMasterData('ubigeo', sort);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar ubigeos' });
  }
};

export const listHolidays = async (req, res) => {
  try {
    const { sort = '-date' } = req.query;
    const data = await listMasterData('holiday', sort);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar feriados' });
  }
};

export const listRoles = async (req, res) => {
  try {
    const { sort = 'name' } = req.query;
    const data = await listMasterData('role', sort);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar roles' });
  }
};

export const createBank = async (req, res) => {
  try {
    const data = await createMasterData('bank', req.body, req.user.id, req.user.email);
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear banco' });
  }
};

export const createSite = async (req, res) => {
  try {
    const data = await createMasterData('site', req.body, req.user.id, req.user.email);
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear sede' });
  }
};

export const createAFP = async (req, res) => {
  try {
    const data = await createMasterData('afp', req.body, req.user.id, req.user.email);
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear AFP' });
  }
};

export const createProfession = async (req, res) => {
  try {
    const data = await createMasterData('profession', req.body, req.user.id, req.user.email);
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear profesión' });
  }
};

export const createHoliday = async (req, res) => {
  try {
    const data = await createMasterData('holiday', req.body, req.user.id, req.user.email);
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear feriado' });
  }
};

export const createRole = async (req, res) => {
  try {
    const data = await createMasterData('role', req.body, req.user.id, req.user.email);
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear rol' });
  }
};
