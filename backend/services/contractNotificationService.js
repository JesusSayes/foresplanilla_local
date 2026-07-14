import pool from '../config/database.js';
import { sendEmail } from '../utils/mailer.js';
import { generate24HexId } from '../utils/idGenerator.js';

const THRESHOLD_DAYS = 30;
const LOCK_NAME = 'foresplanilla:contract-expiring-notifications';

export const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const todayInLima = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const buildEmailBody = (today, contracts) => {
  const rows = contracts.map(contract => {
    const urgency = contract.days_left <= 7 ? '🔴' : contract.days_left <= 15 ? '🟡' : '🟢';
    const color = contract.days_left <= 7 ? '#dc2626' : contract.days_left <= 15 ? '#d97706' : '#16a34a';
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${urgency}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(contract.employee_name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(contract.employee_code)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(contract.position)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(contract.contract_type)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(contract.end_date)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:700;color:${color};">${contract.days_left} días</td>
    </tr>`;
  }).join('');

  return `<div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;">
    <div style="background:#4f46e5;padding:20px 24px;border-radius:8px 8px 0 0;">
      <h2 style="color:#fff;margin:0;">Alerta de Vencimiento de Contratos</h2>
      <p style="color:#c7d2fe;margin:4px 0 0;font-size:13px;">Portal RRHH — Revisión generada el ${today}</p>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:20px 24px;">
      <p style="font-size:14px;color:#334155;">Los siguientes <strong>${contracts.length}</strong> contratos vigentes vencen en los próximos ${THRESHOLD_DAYS} días.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#1e293b;">
        <thead><tr style="background:#f1f5f9;">
          <th></th><th style="text-align:left;padding:8px 12px;">Empleado</th><th style="text-align:left;padding:8px 12px;">Código</th>
          <th style="text-align:left;padding:8px 12px;">Cargo</th><th style="text-align:left;padding:8px 12px;">Tipo</th>
          <th style="text-align:left;padding:8px 12px;">Vence</th><th style="text-align:left;padding:8px 12px;">Días</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
};

const loadContracts = async (client, today) => {
  const result = await client.query(
    `SELECT c.id AS contract_id,
            COALESCE(NULLIF(TRIM(CONCAT(e.first_name, ' ', e.last_name)), ''), 'N/A') AS employee_name,
            COALESCE(e.employee_code, 'N/A') AS employee_code,
            COALESCE(c.position, e.position, 'N/A') AS position,
            COALESCE(c.contract_type, 'N/A') AS contract_type,
            TO_CHAR(c.end_date, 'YYYY-MM-DD') AS end_date,
            (c.end_date - $1::date)::int AS days_left
       FROM contract c
       LEFT JOIN employee e ON e.id = c.employee_id
      WHERE c.status = 'Vigente'
        AND c.end_date BETWEEN $1::date AND ($1::date + $2::int)
      ORDER BY c.end_date ASC`,
    [today, THRESHOLD_DAYS]
  );
  return result.rows;
};

const loadRecipients = async client => {
  const systemResult = await client.query(
    `SELECT DISTINCT ON (LOWER(u.email))
            LOWER(u.email) AS email,
            COALESCE(u.full_name, u.email) AS name,
            FALSE AS is_external,
            COALESCE(np.contract_expiring, TRUE) AS contract_expiring,
            COALESCE(np.email_notifications, FALSE) AS email_notifications
       FROM users u
       JOIN employee e ON LOWER(e.work_email) = LOWER(u.email)
       LEFT JOIN LATERAL (
         SELECT contract_expiring, email_notifications
           FROM notification_preference
          WHERE LOWER(user_email) = LOWER(u.email) OR employee_id = e.id
          ORDER BY updated_date DESC NULLS LAST, created_date DESC NULLS LAST
          LIMIT 1
       ) np ON TRUE
      WHERE u.email IS NOT NULL
        AND COALESCE(u.is_active, TRUE) = TRUE
        AND COALESCE(NULLIF(LOWER(u.disabled), ''), 'false') NOT IN ('true', '1', 'yes', 'si')
        AND (
          e.role IN ('admin', 'super_admin', 'hr_readonly')
          OR EXISTS (
            SELECT 1
              FROM user_role ur
              JOIN role r ON r.id = ur.role_id
             WHERE ur.employee_id = e.id
               AND COALESCE(r.permissions::jsonb, '[]'::jsonb) ?| ARRAY[
                 'system.admin',
                 'system.settings',
                 'contracts.view',
                 'notifications.manage_contract_alerts'
               ]
          )
        )
      ORDER BY LOWER(u.email)`
  );

  const extraResult = await client.query(
    `SELECT LOWER(email) AS email,
            COALESCE(NULLIF(recipient_name, ''), email) AS name,
            TRUE AS is_external,
            TRUE AS contract_expiring,
            TRUE AS email_notifications
       FROM notification_recipient
      WHERE notification_type = 'contract_expiring'
        AND is_active = TRUE
        AND email IS NOT NULL`
  );

  return mergeContractRecipients(systemResult.rows, extraResult.rows);
};

export const mergeContractRecipients = (systemRecipients, externalRecipients) => {
  const recipients = new Map();
  systemRecipients
    .filter(recipient => recipient.contract_expiring !== false)
    .forEach(recipient => recipients.set(recipient.email.toLowerCase(), { ...recipient, email: recipient.email.toLowerCase() }));
  externalRecipients.forEach(recipient => {
    const email = recipient.email.toLowerCase();
    if (!recipients.has(email)) recipients.set(email, { ...recipient, email });
  });
  return [...recipients.values()];
};

export const pendingContractsForRecipient = (contracts, email, deliveredKeys) => (
  contracts.filter(contract => !deliveredKeys.has(`${contract.contract_id}:${email.toLowerCase()}`))
);

export const listEligibleContractRecipients = async () => {
  const client = await pool.connect();
  try {
    const recipients = await loadRecipients(client);
    return recipients
      .filter(recipient => !recipient.is_external)
      .map(({ email, name, email_notifications }) => ({ email, name, email_notifications }));
  } finally {
    client.release();
  }
};

const loadDeliveredKeys = async (client, today) => {
  const result = await client.query(
    `SELECT LOWER(user_email) AS user_email, related_entity_id
       FROM notification
      WHERE type = 'contract_expiring'
        AND created_date >= $1::date
        AND created_date < ($1::date + INTERVAL '1 day')
        AND user_email IS NOT NULL
        AND related_entity_id IS NOT NULL`,
    [today]
  );
  return new Set(result.rows.map(row => `${row.related_entity_id}:${row.user_email}`));
};

const createDeliveryRecords = async (client, recipient, contracts, triggeredBy) => {
  for (const contract of contracts) {
    await client.query(
      `INSERT INTO notification (
         id, created_date, updated_date, created_by, user_email, type, title, message,
         link_page, is_read, priority, related_entity_id, related_entity_type
       ) VALUES ($1, $2, $2, $3, $4, 'contract_expiring', $5, $6, 'ContractManagement', $7, $8, $9, $10)`,
      [
        generate24HexId(),
        new Date(),
        triggeredBy,
        recipient.email,
        `Contrato por vencer: ${contract.employee_name}`,
        `El contrato de ${contract.employee_name} (${contract.employee_code}) vence el ${contract.end_date} (faltan ${contract.days_left} días).`,
        recipient.is_external,
        contract.days_left <= 7 ? 'high' : 'normal',
        contract.contract_id,
        recipient.is_external ? 'ContractExternalEmail' : 'Contract',
      ]
    );
  }
};

export const notifyExpiringContracts = async ({ triggeredBy = 'scheduler' } = {}) => {
  const client = await pool.connect();
  let lockAcquired = false;
  try {
    const lockResult = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [LOCK_NAME]);
    lockAcquired = lockResult.rows[0]?.acquired === true;
    if (!lockAcquired) {
      return { success: true, skipped: true, message: 'Ya existe una ejecución en curso' };
    }

    const today = todayInLima();
    const contracts = await loadContracts(client, today);
    if (contracts.length === 0) {
      return { success: true, date: today, contracts_expiring: 0, emails_sent: 0, notifications_created: 0 };
    }

    const recipients = await loadRecipients(client);
    const deliveredKeys = await loadDeliveredKeys(client, today);
    let emailsSent = 0;
    let notificationsCreated = 0;
    const errors = [];

    for (const recipient of recipients) {
      const pendingContracts = pendingContractsForRecipient(contracts, recipient.email, deliveredKeys);
      if (pendingContracts.length === 0) continue;

      const shouldSendEmail = recipient.is_external || recipient.email_notifications === true;
      if (shouldSendEmail) {
        try {
          await sendEmail({
            to: recipient.email,
            subject: `Alerta: ${pendingContracts.length} contrato(s) por vencer`,
            body: `Hay ${pendingContracts.length} contrato(s) por vencer en los próximos ${THRESHOLD_DAYS} días.`,
            html: buildEmailBody(today, pendingContracts),
          });
          emailsSent++;
        } catch (error) {
          errors.push({ email: recipient.email, error: error.message });
          continue;
        }
      }

      await createDeliveryRecords(client, recipient, pendingContracts, triggeredBy);
      notificationsCreated += pendingContracts.length;
      pendingContracts.forEach(contract => deliveredKeys.add(`${contract.contract_id}:${recipient.email}`));
    }

    return {
      success: errors.length === 0,
      date: today,
      contracts_expiring: contracts.length,
      recipients_total: recipients.length,
      emails_sent: emailsSent,
      notifications_created: notificationsCreated,
      errors,
      contracts,
    };
  } finally {
    if (lockAcquired) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_NAME]);
    client.release();
  }
};

export default notifyExpiringContracts;
