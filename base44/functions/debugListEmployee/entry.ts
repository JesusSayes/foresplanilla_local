import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function parseSDKResponse(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw == null) return [];
  if (typeof raw === "object") {
    const vals = Object.values(raw);
    if (vals.length > 0 && typeof vals[0] === "object" && vals[0] !== null) return vals;
    return vals;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      return Object.values(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

async function listAll(entity, query = null, sortField = "-created_date", pageSize = 10) {
  const results = [];
  let skip = 0;
  while (true) {
    const raw = query
      ? await entity.filter(query, sortField, pageSize, skip)
      : await entity.list(sortField, pageSize, skip);
    const items = parseSDKResponse(raw);
    results.push(...items);
    if (items.length < pageSize) break;
    skip += pageSize;
    if (skip > 200000) break;
  }
  return results;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    const allEmployees = await listAll(db.entities.Employee);
    const active = allEmployees.filter(e => e.status === "Activo");

    return Response.json({
      total: allEmployees.length,
      active: active.length,
      firstId: allEmployees[0]?.id,
      firstCode: allEmployees[0]?.employee_code,
      firstStatus: allEmployees[0]?.status,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.slice(0,500) }, { status: 500 });
  }
});