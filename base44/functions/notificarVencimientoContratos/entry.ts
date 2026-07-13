import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Notifica por correo e in-app cuando faltan ≤ 30 días para el vencimiento
 * de contratos vigentes.
 *
 * - Consulta contratos con status "Vigente" y end_date dentro de 30 días.
 * - Envía emails a usuarios admin/HR con preferencia de email activada.
 * - Crea notificaciones in-app (tipo "contract_expiring").
 * - Evita duplicados del mismo día (mismo contrato + mismo usuario).
 *
 * Ejecución: automatización programada diaria o llamada manual admin.
 */

const THRESHOLD_DAYS = 30;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function todayInLima() {
  const now = new Date();
  const limaMs = now.getTime() + now.getTimezoneOffset() * 60000 + (-5 * 60 * 60000);
  const d = new Date(limaMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(fromStr, toStr) {
  const d1 = new Date(fromStr + "T00:00:00");
  const d2 = new Date(toStr + "T00:00:00");
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

function parseSDKResponse(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw == null) return [];
  if (typeof raw === "object") {
    const vals = Object.values(raw);
    return (vals.length > 0 && typeof vals[0] === "object" && vals[0] !== null) ? vals : [];
  }
  return [];
}

async function listAll(entity, query = null, sortField = "-created_date") {
  const PAGE = 50;
  const results = [];
  let skip = 0;
  while (true) {
    await sleep(120);
    const raw = query
      ? await entity.filter(query, sortField, PAGE, skip)
      : await entity.list(sortField, PAGE, skip);
    const items = parseSDKResponse(raw);
    results.push(...items);
    if (items.length < PAGE) break;
    skip += PAGE;
    if (skip > 50000) break;
  }
  return results;
}

function buildEmailBody(today, contracts) {
  const rows = contracts.map(c => {
    const urgency = c.days_left <= 7 ? "🔴" : c.days_left <= 15 ? "🟡" : "🟢";
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${urgency}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${c.employee_name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${c.employee_code}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${c.position}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${c.contract_type}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${c.end_date}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:700;color:${c.days_left <= 7 ? '#dc2626' : c.days_left <= 15 ? '#d97706' : '#16a34a'};">${c.days_left} días</td>
      </tr>`;
  }).join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
      <div style="background:#4f46e5;padding:20px 24px;border-radius:8px 8px 0 0;">
        <h2 style="color:#fff;margin:0;">⚠️ Alerta de Vencimiento de Contratos</h2>
        <p style="color:#c7d2fe;margin:4px 0 0;font-size:13px;">Portal RRHH — Revisión generada el ${today}</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:20px 24px;">
        <p style="font-size:14px;color:#334155;margin:0 0 16px;">
          Los siguientes <strong>${contracts.length}</strong> contrato(s) vigente(s) vencen en menos de <strong>30 días</strong>.
          Se requiere coordinar renovación o cese según corresponda.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#1e293b;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #cbd5e1;"></th>
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #cbd5e1;">Empleado</th>
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #cbd5e1;">Código</th>
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #cbd5e1;">Cargo</th>
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #cbd5e1;">Tipo</th>
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #cbd5e1;">Vence</th>
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #cbd5e1;">Días restantes</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="font-size:12px;color:#64748b;margin:16px 0 0;">
          Ingrese al Portal RRHH → Gestión Contratos para revisar los detalles y tomar acción.<br/>
          Esta notificación se genera automáticamente todos los días.
        </p>
      </div>
    </div>
  `;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    // Verificar admin si es llamada manual
    try {
      const user = await base44.auth.me();
      if (user) {
        const callerEmp = await db.entities.Employee.filter({ work_email: user.email });
        const callerRole = callerEmp?.[0]?.role;
        if (!callerRole || !["admin", "super_admin"].includes(callerRole)) {
          return Response.json({ error: "Solo administradores pueden ejecutar esta función" }, { status: 403 });
        }
      }
    } catch { /* scheduler sin sesión → ok */ }

    const today = todayInLima();

    // 1. Cargar contratos vigentes, empleados, usuarios y preferencias
    const [contractsRaw, employeesRaw, usersRaw, prefsRaw] = await Promise.all([
      listAll(db.entities.Contract, { status: "Vigente" }, "-end_date"),
      listAll(db.entities.Employee, null, "-created_date"),
      listAll(db.entities.User, null, "-created_date"),
      listAll(db.entities.NotificationPreference, null, "-created_date"),
    ]);

    const employeeMap = {};
    employeesRaw.forEach(e => { employeeMap[e.id] = e; });

    const prefMap = {};
    prefsRaw.forEach(p => { prefMap[p.user_email] = p; });

    // 2. Filtrar contratos que vencen en ≤ 30 días
    const expiringContracts = contractsRaw.filter(c => {
      if (!c.end_date) return false;
      const days = daysBetween(today, c.end_date);
      return days >= 0 && days <= THRESHOLD_DAYS;
    });

    if (expiringContracts.length === 0) {
      return Response.json({ success: true, message: "No hay contratos por vencer en los próximos 30 días", notified: 0 });
    }

    // 3. Filtrar usuarios que deben recibir notificaciones de contrato
    const notifyUsers = usersRaw.filter(u => {
      if (!u.email) return false;
      const pref = prefMap[u.email];
      // Sin preferencia → default true
      return !pref || pref.contract_expiring !== false;
    });

    if (notifyUsers.length === 0) {
      return Response.json({ success: true, message: "No hay usuarios configurados para recibir notificaciones", notified: 0 });
    }

    // 4. Evitar duplicados del día (mismo contrato + mismo usuario)
    const existingNotifsRaw = await listAll(db.entities.Notification, { type: "contract_expiring" }, "-created_date");
    const todayNotifiedKeys = new Set();
    existingNotifsRaw.forEach(n => {
      const createdDate = (n.created_date || "").slice(0, 10);
      if (createdDate === today && n.related_entity_id) {
        todayNotifiedKeys.add(`${n.related_entity_id}:${n.user_email}`);
      }
    });

    // 5. Construir resumen de contratos
    const contractSummaries = expiringContracts.map(c => {
      const emp = employeeMap[c.employee_id];
      const daysLeft = daysBetween(today, c.end_date);
      return {
        contract_id: c.id,
        employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "N/A",
        employee_code: emp?.employee_code || "N/A",
        position: c.position || "N/A",
        contract_type: c.contract_type || "N/A",
        end_date: c.end_date,
        days_left: daysLeft,
      };
    }).sort((a, b) => a.days_left - b.days_left);

    // 6. Enviar notificaciones
    let emailsSent = 0;
    let notifsCreated = 0;

    for (const user of notifyUsers) {
      const pref = prefMap[user.email];
      const sendEmail = !pref || (pref.email_notifications !== false && pref.contract_expiring !== false);

      // Crear notificaciones in-app para cada contrato no notificado hoy
      const userNewContracts = [];
      for (const cs of contractSummaries) {
        const notifKey = `${cs.contract_id}:${user.email}`;
        if (todayNotifiedKeys.has(notifKey)) continue;
        userNewContracts.push(cs);

        try {
          await db.entities.Notification.create({
            user_email: user.email,
            type: "contract_expiring",
            title: `Contrato por vencer: ${cs.employee_name}`,
            message: `El contrato de ${cs.employee_name} (${cs.employee_code}) — ${cs.position} vence el ${cs.end_date} (faltan ${cs.days_left} días).`,
            link_page: "ContractManagement",
            priority: cs.days_left <= 7 ? "high" : "normal",
            related_entity_id: cs.contract_id,
            related_entity_type: "Contract",
          });
          notifsCreated++;
        } catch (e) { /* continue */ }

        todayNotifiedKeys.add(notifKey);
      }

      // Enviar email con todos los contratos nuevos del usuario
      if (sendEmail && userNewContracts.length > 0) {
        try {
          await db.integrations.Core.SendEmail({
            to: user.email,
            subject: `⚠️ Alerta: ${userNewContracts.length} contrato(s) por vencer en menos de 30 días`,
            body: buildEmailBody(today, userNewContracts),
          });
          emailsSent++;
        } catch (e) { /* continue */ }
      }
    }

    return Response.json({
      success: true,
      date: today,
      contracts_expiring: contractSummaries.length,
      users_notified: notifyUsers.length,
      emails_sent: emailsSent,
      notifications_created: notifsCreated,
      contracts: contractSummaries,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});