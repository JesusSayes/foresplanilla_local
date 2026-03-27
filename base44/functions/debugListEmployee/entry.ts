import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    // Test diferentes firmas del SDK
    const t1 = await db.entities.Employee.list();
    const t2 = await db.entities.Employee.list("-created_date");
    const t3 = await db.entities.Employee.filter({});
    const t4 = await db.entities.Employee.filter({ status: "Activo" });

    const info = (r, label) => ({
      label,
      isArray: Array.isArray(r),
      type: typeof r,
      length: Array.isArray(r) ? r.length : "n/a",
      keys: !Array.isArray(r) && r ? Object.keys(r) : [],
      firstId: Array.isArray(r) && r[0] ? r[0].id : null,
    });

    return Response.json({
      t1: info(t1, "list()"),
      t2: info(t2, "list(sort)"),
      t3: info(t3, "filter({})"),
      t4: info(t4, "filter({status:Activo})"),
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});