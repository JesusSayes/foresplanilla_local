import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  attachEmployeeScope,
  canAccessEmployee,
  hasPermission,
  loadAccessContext,
  requireAnyPermission,
  resolveAccessibleEmployeeIds,
} from '../middleware/authorization.js';

const router = express.Router();
const MUTABLE_FIELDS = new Set(['employee_id', 'role_id', 'assigned_by', 'assigned_date']);
const FILTER_FIELDS = new Set(['employee_id', 'role_id', 'assigned_by', 'assigned_date']);
const SORT_FIELDS = new Set(['created_date', 'assigned_date', 'employee_id', 'role_id']);

const parsePermissions = value => Array.isArray(value)
  ? value
  : (typeof value === 'string' ? JSON.parse(value) : []);

const canAssignRole = async (req, roleId) => {
  const result = await pool.query('SELECT permissions, is_system_role FROM role WHERE id = $1', [roleId]);
  const role = result.rows[0];
  if (!role) return { allowed: false, status: 404, error: 'Role not found' };
  const privileged = role.is_system_role || parsePermissions(role.permissions).includes('system.admin');
  if (privileged && !hasPermission(req.access, 'system.admin')) {
    return { allowed: false, status: 403, error: 'Solo un administrador del sistema puede asignar roles privilegiados' };
  }
  return { allowed: true };
};

const getOrderBy = sort => {
  const descending = sort.startsWith('-');
  const field = sort.replace(/^-/, '');
  return `${SORT_FIELDS.has(field) ? field : 'created_date'} ${descending ? 'DESC' : 'ASC'}`;
};

router.use(authenticateToken, loadAccessContext);

router.get('/', requireAnyPermission('roles.assign', 'roles.manage'), attachEmployeeScope('roles.assign', 'roles.manage'), async (req, res) => {
  try {
    const { sort = '-created_date' } = req.query;
    const orderBy = getOrderBy(sort);

    const result = req.accessibleEmployeeIds === null
      ? await pool.query(`SELECT * FROM user_role ORDER BY ${orderBy}`)
      : await pool.query(`SELECT * FROM user_role WHERE employee_id = ANY($1::varchar[]) ORDER BY ${orderBy}`, [req.accessibleEmployeeIds]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user roles:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/filter', async (req, res) => {
  try {
    const filters = req.body;
    const canViewAssignments = req.access.permissions.has('system.admin') ||
      req.access.permissions.has('roles.assign') ||
      req.access.permissions.has('roles.manage');

    if (!canViewAssignments && filters?.employee_id !== req.access.employee.id) {
      return res.status(403).json({ error: 'Solo puede consultar sus propios roles' });
    }
    if (canViewAssignments) {
      req.accessibleEmployeeIds = await resolveAccessibleEmployeeIds(req.access, ['roles.assign', 'roles.manage']);
      if (filters?.employee_id && !canAccessEmployee(req, filters.employee_id)) {
        return res.status(403).json({ error: 'Acceso denegado al empleado' });
      }
    }
    const { sort = '-created_date' } = req.query;
    const orderBy = getOrderBy(sort);
    
    const conditions = [];
    const values = [];
    let paramCount = 1;

    Object.entries(filters).forEach(([key, value]) => {
      if (FILTER_FIELDS.has(key) && value !== undefined && value !== null) {
        conditions.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (canViewAssignments && req.accessibleEmployeeIds !== null) {
      conditions.push(`employee_id = ANY($${paramCount}::varchar[])`);
      values.push(req.accessibleEmployeeIds);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM user_role ${whereClause} ORDER BY ${orderBy}`;
    
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Error filtering user roles:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', requireAnyPermission('roles.assign', 'roles.manage'), attachEmployeeScope('roles.assign', 'roles.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM user_role WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User role not found' });
    }
    if (!canAccessEmployee(req, result.rows[0].employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user role:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', requireAnyPermission('roles.assign', 'roles.manage'), attachEmployeeScope('roles.assign', 'roles.manage'), async (req, res) => {
  try {
    const { employee_id, role_id, assigned_by, assigned_date } = req.body;
    if (!canAccessEmployee(req, employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
    const roleCheck = await canAssignRole(req, role_id);
    if (!roleCheck.allowed) return res.status(roleCheck.status).json({ error: roleCheck.error });

    const result = await pool.query(
      `INSERT INTO user_role (id, employee_id, role_id, assigned_by, assigned_date)
       VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING *`,
      [employee_id, role_id, assigned_by || null, assigned_date || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating user role:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', requireAnyPermission('roles.assign', 'roles.manage'), attachEmployeeScope('roles.assign', 'roles.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const current = await pool.query('SELECT employee_id, role_id FROM user_role WHERE id = $1', [id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'User role not found' });
    if (!canAccessEmployee(req, current.rows[0].employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
    if (updates.employee_id && !canAccessEmployee(req, updates.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
    const roleCheck = await canAssignRole(req, updates.role_id || current.rows[0].role_id);
    if (!roleCheck.allowed) return res.status(roleCheck.status).json({ error: roleCheck.error });
    
    const fields = Object.keys(updates).filter(field => MUTABLE_FIELDS.has(field));
    if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
    const values = fields.map(field => updates[field]);
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    
    const result = await pool.query(
      `UPDATE user_role SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User role not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', requireAnyPermission('roles.assign', 'roles.manage'), attachEmployeeScope('roles.assign', 'roles.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const current = await pool.query('SELECT employee_id, role_id FROM user_role WHERE id = $1', [id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'User role not found' });
    if (!canAccessEmployee(req, current.rows[0].employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
    const roleCheck = await canAssignRole(req, current.rows[0].role_id);
    if (!roleCheck.allowed) return res.status(roleCheck.status).json({ error: roleCheck.error });
    const result = await pool.query(
      'DELETE FROM user_role WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User role not found' });
    }

    res.json({ message: 'User role deleted successfully' });
  } catch (error) {
    console.error('Error deleting user role:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
