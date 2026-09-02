import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const mode = body.mode || "migrate";
    const asientoIds: string[] = body.asiento_ids || [];

    // Leer configuración activa
    const configs = await base44.asServiceRole.entities.StarsoftConfig.filter({ is_active: true });
    const config = configs && configs[0];
    if (!config) {
      return Response.json(
        { error: "No existe una configuración de Starsoft activa. Configure la integración en la página de Configuración Starsoft." },
        { status: 400 }
      );
    }
    if (!config.auth_url || !config.api_url) {
      return Response.json(
        { error: "Las URLs de autenticación y envío de Starsoft no están configuradas." },
        { status: 400 }
      );
    }

    // Leer credenciales desde la configuración (entidad)
    const clientId = config.client_id;
    const clientSecret = config.client_secret;
    if (!clientId || !clientSecret) {
      return Response.json(
        { error: "Credenciales Starsoft no configuradas. Ingrese ClientID y ClientSecret en la página de Configuración Starsoft." },
        { status: 400 }
      );
    }

    // Autenticar contra Starsoft (cada ejecución, sin cachear token)
    let accessToken: string | null = null;
    let expiresIn: number | null = null;
    try {
      const authRes = await fetch(config.auth_url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          clientID: clientId,
          clientSecret: clientSecret,
          codEmpresa: config.cod_empresa,
          codSistema: config.cod_sistema,
        }),
      });
      const authText = await authRes.text();
      let authData: any;
      try {
        authData = JSON.parse(authText);
      } catch {
        authData = { success: false, message: `Respuesta no JSON: ${authText.slice(0, 200)}` };
      }

      if (!authRes.ok || authData.success === false || !authData.datos?.access_token) {
        const msg = authData.message || authData.error || `HTTP ${authRes.status}`;
        // Registrar error de prueba si aplica
        if (mode === "test") {
          await base44.asServiceRole.entities.StarsoftConfig.update(config.id, {
            last_test_status: "error",
            last_test_date: new Date().toISOString(),
            last_test_message: `Autenticación fallida: ${msg}`,
          });
        }
        return Response.json(
          { error: `Autenticación Starsoft fallida: ${msg}`, auth_error: true },
          { status: 400 }
        );
      }

      accessToken = authData.datos.access_token;
      expiresIn = authData.datos.expires_in ?? null;
    } catch (err: any) {
      if (mode === "test") {
        await base44.asServiceRole.entities.StarsoftConfig.update(config.id, {
          last_test_status: "error",
          last_test_date: new Date().toISOString(),
          last_test_message: `Error de red: ${err.message}`,
        });
      }
      return Response.json(
        { error: `Error de conexión con Starsoft: ${err.message}`, auth_error: true },
        { status: 502 }
      );
    }

    // Modo prueba: solo autenticar
    if (mode === "test") {
      await base44.asServiceRole.entities.StarsoftConfig.update(config.id, {
        last_test_status: "success",
        last_test_date: new Date().toISOString(),
        last_test_message: `Autenticación exitosa. Token válido por ${expiresIn ?? "?"} segundos.`,
      });
      return Response.json({
        success: true,
        message: "Autenticación exitosa",
        expires_in: expiresIn,
        cod_empresa: config.cod_empresa,
      });
    }

    // Modo migración: validar asientos
    if (!asientoIds.length) {
      return Response.json({ error: "No se enviaron asientos a migrar." }, { status: 400 });
    }

    const asientos = await base44.asServiceRole.entities.AsientoContable.filter({
      id: { $in: asientoIds },
    });

    // La API REST de Starsoft usa System.Text.Json, que requiere fechas en
    // formato ISO 8601 (YYYY-MM-DD) para convertir a System.DateTime. La
    // entidad ya las guarda en ISO; solo normalizamos y garantizamos un valor
    // válido (nunca string vacío ni null para los campos obligatorios).
    // Devuelve ISO 8601 date-time completo (YYYY-MM-DDTHH:mm:ss). Si la fecha
    // original ya incluye componente de hora, se conserva; si solo tiene
    // YYYY-MM-DD se le agrega T00:00:00. Starsoft usa System.Text.Json que
    // espera $date-time para los campos DateTime.
    const toISODateTime = (d: any): string | null => {
      if (!d) return null;
      const s = String(d).trim();
      // Ya incluye componente de hora (ISO date-time)
      const dt = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/);
      if (dt) return `${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}`;
      // Solo fecha YYYY-MM-DD
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}T00:00:00`;
      // Formato dd/MM/yyyy
      const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}T00:00:00`;
      return null;
    };
    const todayISO = () => new Date().toISOString();
    // annomes debe ser solo dígitos (AAAAMM), sin guiones ni separadores.
    const sanitizeAnnomes = (a: any): string => String(a || "").replace(/\D/g, "");

    // Armar payload con todos los asientos en un solo envío (batch). Starsoft
    // espera un array de AsientoStandar en la raíz del body. La empresa no va
    // en cada item: se define al autenticar (codEmpresa en el token).
    const payload = asientos.map((a: any) => ({
      cuenta: a.cuenta || "",
      annomes: sanitizeAnnomes(a.annomes),
      subdiario: a.subdiario || "",
      comprobante: a.comprobante || "",
      fecha_Registro: toISODateTime(a.fecha_registro) || toISODateTime(a.fecha_doc) || todayISO(),
      fecha_Doc: toISODateTime(a.fecha_doc) || toISODateTime(a.fecha_registro) || todayISO(),
      tipo_Anexo: a.tipo_anexo || "",
      cod_Anexo: a.cod_anexo || "",
      tipo_Doc: a.tipo_doc || "",
      nro_Doc: a.nro_doc || "",
      fecha_Vencimiento: a.fecha_vencimiento ? toISODateTime(a.fecha_vencimiento) : null,
      moneda: a.moneda === "USD" ? "ME" : a.moneda === "PEN" ? "MN" : (a.moneda || ""),
      importe: Number(a.importe) || 0,
      conversion_Tc: a.conversion_tc || "M",
      tc: Number(a.tc) || 1,
      glosa: a.glosa || "",
      centro_Costos: a.centro_costos || "",
      glosa_Mov: a.glosa_mov || "",
      anulado: !!a.anulado,
      debe_Haber: a.debe_haber || "",
      medio_Pago: a.medio_pago || "",
    }));

    let sendRes: Response;
    try {
      sendRes = await fetch(config.api_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/plain",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      await base44.asServiceRole.entities.AsientoContable.updateMany(
        { id: { $in: asientoIds } },
        { $set: {
          estado_migracion: "Error",
          migrado: false,
          error_migracion: `Error de red: ${err.message}`,
          sistema_destino: "Starsoft",
        } }
      );
      return Response.json({
        success: false,
        error: `Error de red: ${err.message}`,
        total: asientos.length,
        migrados: 0,
        errores: asientos.length,
      }, { status: 502 });
    }

    const sendText = await sendRes.text();
    let sendData: any;
    try {
      sendData = JSON.parse(sendText);
    } catch {
      sendData = { success: sendRes.ok, message: sendText.slice(0, 500) };
    }

    const ok = sendRes.ok && sendData.success === true;
    const code =
      sendData.codigo || sendData.id || sendData.datos?.codigo || sendData.datos?.id || "OK";

    if (ok) {
      await base44.asServiceRole.entities.AsientoContable.updateMany(
        { id: { $in: asientoIds } },
        { $set: {
          estado_migracion: "Migrado",
          migrado: true,
          fecha_migracion: new Date().toISOString(),
          migrado_por: user.email,
          sistema_destino: "Starsoft",
          codigo_migracion: String(code),
          error_migracion: "",
        } }
      );
      return Response.json({
        success: true,
        total: asientos.length,
        migrados: asientos.length,
        errores: 0,
      });
    }

    // Error: extraer mensaje y marcar todos los asientos como error
    let errMsg = sendData.message || sendData.error || sendData.mensaje ||
      sendData.detail || sendData.details || "";
    if (!errMsg && sendData.datos && typeof sendData.datos === "object") {
      errMsg = sendData.datos.message || sendData.datos.error || sendData.datos.mensaje || "";
    }
    if (!errMsg && Array.isArray(sendData.errors)) errMsg = sendData.errors.join("; ");
    if (!errMsg && Array.isArray(sendData.datos) && sendData.datos.length) {
      errMsg = sendData.datos.map((x: any) => (typeof x === "string" ? x : JSON.stringify(x))).join("; ");
    }
    if (!errMsg) errMsg = `HTTP ${sendRes.status} — Respuesta: ${sendText.slice(0, 400)}`;

    await base44.asServiceRole.entities.AsientoContable.updateMany(
      { id: { $in: asientoIds } },
      { $set: {
        estado_migracion: "Error",
        migrado: false,
        error_migracion: errMsg,
        sistema_destino: "Starsoft",
      } }
    );

    return Response.json({
      success: false,
      error: errMsg,
      total: asientos.length,
      migrados: 0,
      errores: asientos.length,
      status: sendRes.status,
      raw: sendText.slice(0, 1000),
    }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}