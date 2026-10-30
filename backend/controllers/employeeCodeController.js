import pool from '../config/database.js';
import { canAccessEmployee } from '../middleware/authorization.js';
import { generate24HexId } from '../utils/idGenerator.js';
import { normalizeEmployeeCode } from '../../src/lib/employeeCode.js';

// Corrección explícita de códigos e historial en una sola transacción.
export const correctEmployeeCodes = async (req, res) => {
  const changes = req.body;
  if (!Array.isArray(changes) || !changes.length || changes.some(c => !c?.id || !normalizeEmployeeCode(c.employee_code)) || new Set(changes.map(c => c.id)).size !== changes.length) {
    return res.status(400).json({ error: 'Correcciones de códigos inválidas' });
  }
  if (changes.some(c => !canAccessEmployee(req, c.id))) return res.status(403).json({ error: 'Acceso denegado al empleado' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE employee IN SHARE ROW EXCLUSIVE MODE');
    const { rows } = await client.query('SELECT id, employee_code FROM employee');
    const byId = new Map(rows.map(e => [e.id, e]));
    for (const change of changes) {
      const existing = byId.get(change.id);
      if (!existing || String(existing.employee_code || '') !== String(change.old_code || '')) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Los códigos cambiaron. Actualice la revisión antes de corregir.' });
      }
    }
    const changing = new Set(changes.map(c => c.id));
    const used = new Set(rows.filter(e => !changing.has(e.id)).map(e => normalizeEmployeeCode(e.employee_code)).filter(Boolean));
    for (const change of changes) {
      const code = normalizeEmployeeCode(change.employee_code);
      if (used.has(code)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `El código ${code} ya está asignado` });
      }
      used.add(code);
    }
    for (const change of changes) {
      const code = normalizeEmployeeCode(change.employee_code);
      await client.query('UPDATE employee SET employee_code = $1, updated_date = NOW() WHERE id = $2', [code, change.id]);
      await client.query(`INSERT INTO employee_change_log
        (id, employee_id, field_changed, old_value, new_value, change_type, changed_by, change_date, created_date, updated_date)
        VALUES ($1, $2, 'employee_code', $3, $4, 'Corrección de código', $5, NOW(), NOW(), NOW())`,
      [generate24HexId(), change.id, byId.get(change.id).employee_code || '(vacío)', code, req.user?.email || 'Sistema']);
    }
    await client.query('COMMIT');
    res.json({ corrected: changes.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error corrigiendo códigos:', error);
    res.status(500).json({ error: 'No se pudieron corregir los códigos' });
  } finally {
    client.release();
  }
};
