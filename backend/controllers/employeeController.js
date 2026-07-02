import { query } from '../config/database.js';
import { buildFilterQuery, buildSortQuery } from '../utils/queryBuilder.js';
import { canAccessEmployee, hasPermission, resolveAccessibleEmployeeIds } from '../middleware/authorization.js';
import { ACCESSIBLE_EMPLOYEE_PERMISSION_KEYS } from '../config/permissions.js';

const ALLOWED_ACCESS_PERMISSIONS = new Set(ACCESSIBLE_EMPLOYEE_PERMISSION_KEYS);
let employeeColumnCache = null;

const getEmployeeColumns = async () => {
  if (employeeColumnCache) return employeeColumnCache;

  const result = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'employee'`
  );

  employeeColumnCache = new Set(result.rows.map(row => row.column_name));
  return employeeColumnCache;
};

export const listAccessibleEmployees = async (req, res) => {
  try {
    const requestedPermissions = String(req.query.permissions || '')
      .split(',')
      .map(permission => permission.trim())
      .filter(permission => ALLOWED_ACCESS_PERMISSIONS.has(permission));

    if (requestedPermissions.length === 0 ||
        !requestedPermissions.some(permission => hasPermission(req.access, permission))) {
      return res.status(403).json({ error: 'Permiso insuficiente' });
    }

    const employeeIds = await resolveAccessibleEmployeeIds(req.access, requestedPermissions);
    const employees = await query(
      employeeIds === null
        ? 'SELECT * FROM employee ORDER BY created_date DESC'
        : 'SELECT * FROM employee WHERE id = ANY($1::varchar[]) ORDER BY created_date DESC',
      employeeIds === null ? [] : [employeeIds]
    );

    res.json(employees.rows);
  } catch (error) {
    console.error('Error listing accessible employees:', error);
    res.status(500).json({ error: 'Error al listar empleados accesibles' });
  }
};

export const listEmployees = async (req, res) => {
  try {
    const { sort = '-created_date' } = req.query;

    let sql = 'SELECT * FROM employee';
    sql = buildSortQuery(sql, sort);

    const result = await query(sql);
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing employees:', error);
    res.status(500).json({ error: 'Error al listar empleados' });
  }
};

export const filterEmployees = async (req, res) => {
  try {
    const filters = req.body || {};
    const { sort = '-created_date' } = req.query;

    const { query: sql, params } = buildFilterQuery(
      'SELECT * FROM employee',
      filters
    );

    const finalQuery = buildSortQuery(sql, sort);
    const result = await query(finalQuery, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Error filtering employees:', error);
    res.status(500).json({ error: 'Error al filtrar empleados' });
  }
};

export const getEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM employee WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting employee:', error);
    res.status(500).json({ error: 'Error al obtener empleado' });
  }
};

export const createEmployee = async (req, res) => {
  try {
    const data = req.body;
    if (data.role && data.role !== 'empleado' && !hasPermission(req.access, 'system.admin')) {
      return res.status(403).json({ error: 'Solo un administrador del sistema puede asignar un rol legacy privilegiado' });
    }
    const cleanData = { ...data };

    [ 'birth_date', 'hire_date', 'termination_date', 'afp_affiliation_date'].forEach(field => {
      if (cleanData[field] === undefined || cleanData[field] === null || cleanData[field] === '') {
        cleanData[field] = null;
      }
    });

    const userId = req.user.id;
    const userEmail = req.user.email;

    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);

    const sql = `
      INSERT INTO employee (
        employee_code, document_type, document_number, first_name, last_name,
        birth_date, gender, personal_email, work_email, phone, mobile, address,
        district, province, department, company, position, position_level,
        profession, department_name, area_trabajo, work_unit, unidad_trabajo, site, hire_date, termination_date,
        contract_type, base_salary, quincenal_amount, bank_name, bank_account, cci_account,
        cts_bank, cts_account_number, cts_currency, pension_system, afp_id,
        afp_affiliation_date, cuspp, worker_type, tax_residence, photo_url,
        status, role, managed_team_ids, supervisor_id, supervisor_name,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
        attendance_method, activity_cost, food_cost, transport_cost,
        id, created_date, updated_date, created_by_id, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44,
        $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59
      ) RETURNING *
    `;

    const values = [
      data.employee_code, data.document_type, data.document_number,
      data.first_name, data.last_name, cleanData.birth_date, data.gender,
      data.personal_email, data.work_email, data.phone, data.mobile,
      data.address, data.district, data.province, data.department,
      data.company, data.position, data.position_level, data.profession,
      data.department_name, data.area_trabajo, data.work_unit, data.unidad_trabajo,
      data.site, cleanData.hire_date,
      cleanData.termination_date, data.contract_type, data.base_salary,
      data.quincenal_amount ?? null, data.bank_name, data.bank_account, data.cci_account, data.cts_bank,
      data.cts_account_number, data.cts_currency, data.pension_system,
      data.afp_id, cleanData.afp_affiliation_date, data.cuspp, data.worker_type,
      data.tax_residence, data.photo_url, data.status || 'Activo',
      data.role || 'empleado', data.managed_team_ids ? JSON.stringify(data.managed_team_ids) : null,
      data.supervisor_id, data.supervisor_name, data.emergency_contact_name,
      data.emergency_contact_phone, data.emergency_contact_relationship,
      data.attendance_method, data.activity_cost ?? 0, data.food_cost ?? 0, data.transport_cost ?? 0,
      id, new Date(), new Date(), userId, userEmail
    ];

    const result = await query(sql, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ error: 'Error al crear empleado' });
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    if (!canAccessEmployee(req, id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });

    const existing = await query('SELECT role FROM employee WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    if (
      Object.prototype.hasOwnProperty.call(data, 'role') &&
      data.role !== existing.rows[0].role &&
      !hasPermission(req.access, 'system.admin')
    ) {
      return res.status(403).json({ error: 'Solo un administrador del sistema puede cambiar el rol legacy' });
    }

    const fields = [];
    const values = [];
    let paramIndex = 1;
    const employeeColumns = await getEmployeeColumns();

    const dateFields = [ 'birth_date', 'hire_date', 'termination_date', 'afp_affiliation_date'];

    Object.entries(data).forEach(([key, value]) => {
      if (dateFields.includes(key) && (value === '' || value === undefined)) {
        value = null;
      }

      if (
        employeeColumns.has(key) &&
        key !== 'id' &&
        key !== 'created_date' &&
        key !== 'created_by_id' &&
        key !== 'created_by'
      ) {
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
      UPDATE employee
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Error al actualizar empleado' });
  }
};

export const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    if (!canAccessEmployee(req, id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });

    const result = await query('DELETE FROM employee WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    res.json({ success: true, message: 'Empleado eliminado' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Error al eliminar empleado' });
  }
};
