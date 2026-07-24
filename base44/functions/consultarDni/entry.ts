import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dni = String(body?.dni || '').trim();
    if (!/^\d{8}$/.test(dni)) {
      return Response.json({ success: false, error: 'DNI inválido' }, { status: 400 });
    }

    const token = Deno.env.get('PERU_DNI_TOKEN');
    if (!token) {
      return Response.json({ success: false, error: 'Token no configurado' }, { status: 500 });
    }

    const apiRes = await fetch(`https://apiperu.dev/api/dni/${dni}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await apiRes.json();
    return Response.json(data, { status: apiRes.status });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});