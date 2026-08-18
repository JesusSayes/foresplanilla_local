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

    const results = { success: [] as string[], errors: [] as any[] };

    // Starsoft/CONCAR espera fechas en formato DD/MM/YYYY. La entidad las guarda
    // en ISO (YYYY-MM-DD). Convertimos antes de armar la trama.
    const toDateDMY = (d: any): string => {
      if (!d) return "";
      const s = String(d);
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[3]}/${m[2]}/${m[1]}`;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
      return s;
    };
    // annomes debe ser solo dígitos (AAAAMM), sin guiones ni separadores.
    const sanitizeAnnomes = (a: any): string => String(a || "").replace(/\D/g, "");

    for (const a of asientos) {
      // Construir trama con los campos requeridos por Starsoft
      const trama: Record<string, any> = {
        empresa: a.empresa || config.cod_empresa,
        cuenta: a.cuenta || "",
        annomes: sanitizeAnnomes(a.annomes),
        subdiario: a.subdiario || "",
        comprobante: a.comprobante || "",
        fecha_Documento: toDateDMY(a.fecha_doc),
        tipo_Anexo: a.tipo_anexo || "",
        cod_Proveedor: a.cod_anexo || "",
        tipo_Doc: a.tipo_doc || "",
        nro_Doc: a.nro_doc || "",
        fecha_Vencimiento: toDateDMY(a.fecha_vencimiento || a.fecha_doc),
        importe_Doc: a.importe ?? 0,
        conversion_Tc: a.conversion_tc || "M",
        fecha_Registro: toDateDMY(a.fecha_registro),
        tc: a.tc ?? 1,
        glosa: a.glosa || "",
        destino_Compra: a.centro_costos || "",
        centro_Costos: a.centro_costos || "",
        glosa_Mov: a.glosa_mov || "",
        anulado: a.anulado ? "1" : "0",
        debe_Haber: a.debe_haber || "",
      };

      try {
        const sendRes = await fetch(config.api_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ asientos: [trama] }),
        });
        const sendText = await sendRes.text();
        let sendData: any;
        try {
          sendData = JSON.parse(sendText);
        } catch {
          sendData = { success: sendRes.ok, message: sendText.slice(0, 300) };
        }

        const ok = sendRes.ok && sendData.success !== false;
        const datosArr = Array.isArray(sendData.datos) ? sendData.datos[0] : null;
        const code =
          sendData.codigo || sendData.id || sendData.datos?.codigo || sendData.datos?.id ||
          (datosArr?.codigo || datosArr?.id) || "OK";

        if (ok) {
          await base44.asServiceRole.entities.AsientoContable.update(a.id, {
            estado_migracion: "Migrado",
            migrado: true,
            fecha_migracion: new Date().toISOString(),
            migrado_por: user.email,
            sistema_destino: "Starsoft",
            codigo_migracion: String(code),
            error_migracion: "",
          });
          results.success.push(a.id);
        } else {
          // Extraer el mensaje de rechazo de Starsoft desde los campos que pueda
          // usar (message, error, mensaje, detail, datos, errors[]). Si no hay
          // ninguno, mostrar la respuesta cruda para que se vea la causa real.
          let errMsg =
            sendData.message || sendData.error || sendData.mensaje ||
            sendData.detail || sendData.details || "";
          if (!errMsg && sendData.datos && typeof sendData.datos === "object") {
            errMsg = sendData.datos.message || sendData.datos.error || sendData.datos.mensaje || "";
          }
          if (!errMsg && Array.isArray(sendData.errors)) errMsg = sendData.errors.join("; ");
          if (!errMsg && Array.isArray(sendData.datos) && sendData.datos.length) {
            errMsg = sendData.datos.map((x: any) => (typeof x === "string" ? x : JSON.stringify(x))).join("; ");
          }
          if (!errMsg) errMsg = `HTTP ${sendRes.status} — Respuesta: ${sendText.slice(0, 400)}`;
          await base44.asServiceRole.entities.AsientoContable.update(a.id, {
            estado_migracion: "Error",
            migrado: false,
            error_migracion: errMsg,
            sistema_destino: "Starsoft",
          });
          results.errors.push({
            id: a.id,
            comprobante: a.comprobante,
            cuenta: a.cuenta,
            error: errMsg,
            status: sendRes.status,
            raw: sendText.slice(0, 1000),
          });
        }
      } catch (err: any) {
        await base44.asServiceRole.entities.AsientoContable.update(a.id, {
          estado_migracion: "Error",
          migrado: false,
          error_migracion: `Error de red: ${err.message}`,
          sistema_destino: "Starsoft",
        });
        results.errors.push({
          id: a.id,
          comprobante: a.comprobante,
          cuenta: a.cuenta,
          error: `Error de red: ${err.message}`,
        });
      }
    }

    return Response.json({
      success: true,
      total: asientos.length,
      migrados: results.success.length,
      errores: results.errors.length,
      detalle_errores: results.errors,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}