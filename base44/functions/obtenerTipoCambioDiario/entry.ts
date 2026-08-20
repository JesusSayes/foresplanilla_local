import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

/**
 * Obtiene el tipo de cambio diario desde un API externo (ej: apis.net.pe SUNAT).
 *
 * - Lee la URL del API desde la entidad TipoCambioConfig (configurable desde la UI).
 * - Si ya existe un registro activo para hoy, no hace nada.
 * - Si no existe, consulta el API y crea un registro con fuente="auto".
 *
 * Modos:
 *   1. CRON diario (sin sesión de usuario): ejecución automática programada.
 *   2. Manual (con sesión): un admin hace clic en "Obtener automáticamente".
 *
 * Body params:
 *   force  → si true, ignora el registro existente y vuelve a consultar el API.
 */

function todayInPeru(): string {
  const now = new Date();
  const peruMs = now.getTime() + now.getTimezoneOffset() * 60000 + (-5 * 60 * 60000);
  const d = new Date(peruMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

Deno.serve(async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    // Si hay sesión de usuario, verificar que sea admin
    try {
      const user = await base44.auth.me();
      if (user) {
        const callerEmp = await db.entities.Employee.filter({ work_email: user.email });
        const callerRole = callerEmp?.[0]?.role;
        if (!callerRole || !["admin", "super_admin"].includes(callerRole)) {
          return Response.json(
            { error: "Solo administradores pueden ejecutar esta función" },
            { status: 403 }
          );
        }
      }
    } catch {
      /* scheduler sin sesión de usuario → ok */
    }

    let body: any = {};
    try { body = await req.json(); } catch {}
    const force = !!body.force;

    const today = todayInPeru();

    // Verificar si ya existe registro activo para hoy
    if (!force) {
      const existing = await db.entities.TipoCambio.filter({ fecha: today, estado: true });
      if (existing && existing.length > 0) {
        return Response.json({
          success: true,
          message: "Tipo de cambio ya registrado para hoy.",
          data: existing[0],
          already_exists: true,
        });
      }
    }

    // Leer configuración activa
    const configs = await db.entities.TipoCambioConfig.filter({ is_active: true });
    const config = configs && configs[0];
    if (!config || !config.api_url) {
      return Response.json(
        { error: "No hay configuración de API activa. Configure la URL en el módulo de Tipo de Cambio." },
        { status: 400 }
      );
    }

    // Consultar API externa
    let apiData: any;
    try {
      const res = await fetch(config.api_url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        return Response.json(
          { error: `Error al consultar API de tipo de cambio (HTTP ${res.status}).` },
          { status: 502 }
        );
      }
      apiData = await res.json();
    } catch (err: any) {
      return Response.json(
        { error: `No se pudo conectar con el API de tipo de cambio: ${err.message}` },
        { status: 502 }
      );
    }

    // Normalizar respuesta (apis.net.pe: { fecha, compra, venta })
    const fecha = apiData.fecha || today;
    const valorCompra = Number(apiData.compra);
    const valorVenta = Number(apiData.venta);

    if (!valorCompra || !valorVenta || isNaN(valorCompra) || isNaN(valorVenta)) {
      return Response.json(
        { error: "Respuesta del API no contiene valores válidos de compra/venta.", raw: apiData },
        { status: 502 }
      );
    }

    // Si se forzó y ya existe, actualizar; si no, crear
    if (force) {
      const existing = await db.entities.TipoCambio.filter({ fecha: today, estado: true });
      if (existing && existing.length > 0) {
        const updated = await db.entities.TipoCambio.update(existing[0].id, {
          valor_compra: valorCompra,
          valor_venta: valorVenta,
          fuente: "auto",
          registrado_por: "",
        });
        return Response.json({
          success: true,
          message: "Tipo de cambio actualizado correctamente.",
          data: updated,
        });
      }
    }

    const created = await db.entities.TipoCambio.create({
      fecha: today,
      valor_compra: valorCompra,
      valor_venta: valorVenta,
      estado: true,
      fuente: "auto",
      registrado_por: "",
    });

    return Response.json({
      success: true,
      message: "Tipo de cambio registrado correctamente.",
      data: created,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});