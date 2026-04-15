import apiClient from "../config/externalApi.js";

let cachedToken = null;
let tokenCreatedAt = null;
const TOKEN_DURATION = 50 * 60 * 1000; // 50 minutos

async function login() {
  try {
    if (!process.env.EXTERNAL_API_EMAIL || !process.env.EXTERNAL_API_PASSWORD) {
      throw new Error("EXTERNAL_API_EMAIL y EXTERNAL_API_PASSWORD deben estar configurados en .env");
    }

    if (!process.env.EXTERNAL_API_BASE_URL) {
      throw new Error("EXTERNAL_API_BASE_URL debe estar configurado en .env");
    }

    console.log(`[LOGIN] Intentando autenticar en: ${process.env.EXTERNAL_API_BASE_URL}/api-login`);
    console.log(`[LOGIN] Email: ${process.env.EXTERNAL_API_EMAIL}`);

    const response = await apiClient.post("/api-login", {
      email: process.env.EXTERNAL_API_EMAIL,
      password: process.env.EXTERNAL_API_PASSWORD
    });

    cachedToken = response.data.token;
    tokenCreatedAt = Date.now();

    console.log("[LOGIN] ✓ Autenticación exitosa");
    return cachedToken;

  } catch (error) {
    console.error("[LOGIN] ✗ Error en autenticación:");
    console.error("  URL:", process.env.EXTERNAL_API_BASE_URL);
    console.error("  Email:", process.env.EXTERNAL_API_EMAIL);
    console.error("  Status:", error.response?.status);
    console.error("  Data:", JSON.stringify(error.response?.data, null, 2));
    console.error("  Message:", error.message);

    if (error.code === 'ECONNREFUSED') {
      throw new Error(`No se pudo conectar al API externo en ${process.env.EXTERNAL_API_BASE_URL}. Verifica que el servidor esté activo.`);
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      throw new Error(`Timeout o DNS error al conectar con ${process.env.EXTERNAL_API_BASE_URL}`);
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error("Credenciales inválidas (EXTERNAL_API_EMAIL o EXTERNAL_API_PASSWORD incorrectos)");
    }

    throw new Error(`Error de autenticación: ${error.message}`);
  }
}

async function getToken() {

  if (
    cachedToken &&
    tokenCreatedAt &&
    Date.now() - tokenCreatedAt < TOKEN_DURATION
  ) {
    return cachedToken;
  }

  return await login();
}

export async function getAsistenciasExternal(limit = null) {
  try {
    console.log("[GET_ASISTENCIAS] Obteniendo token...");
    const token = await getToken();

    console.log(`[GET_ASISTENCIAS] Solicitando asistencias desde: ${process.env.EXTERNAL_API_BASE_URL}/asistencias`);
    if (limit) {
      console.log(`[GET_ASISTENCIAS] Límite: ${limit} registros`);
    }

    const response = await apiClient.get("/asistencias", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = response.data?.data || response.data;

    console.log(`[GET_ASISTENCIAS] ✓ Recibidos ${Array.isArray(data) ? data.length : 0} registros`);

    if (limit && Array.isArray(data)) {
      return data.slice(0, limit);
    }

    return data;

  } catch (error) {
    console.error("[GET_ASISTENCIAS] ✗ Error obteniendo asistencias:");
    console.error("  URL:", process.env.EXTERNAL_API_BASE_URL);
    console.error("  Status:", error.response?.status);
    console.error("  Data:", JSON.stringify(error.response?.data, null, 2));
    console.error("  Message:", error.message);
    console.error("  Code:", error.code);

    if (error.code === 'ECONNREFUSED') {
      throw new Error(`No se pudo conectar al API externo en ${process.env.EXTERNAL_API_BASE_URL}/asistencias`);
    }

    if (error.code === 'ETIMEDOUT') {
      throw new Error(`Timeout al obtener asistencias desde ${process.env.EXTERNAL_API_BASE_URL}/asistencias`);
    }

    if (error.response?.status === 401) {
      console.error("[GET_ASISTENCIAS] Token expirado o inválido, limpiando cache...");
      cachedToken = null;
      tokenCreatedAt = null;
      throw new Error("Token de autenticación inválido o expirado. Intenta nuevamente.");
    }

    if (error.response?.status === 404) {
      throw new Error(`Endpoint /asistencias no encontrado en ${process.env.EXTERNAL_API_BASE_URL}`);
    }

    throw new Error(`Error al obtener asistencias: ${error.message}`);
  }
}

export async function confirmarAsistenciasExternal(ids) {

  try {

    const token = await getToken();

    const response = await apiClient.post("/asistencias/confirmar",
      { ids: ids },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    return response.data;

  } catch (error) {

    console.error("Error confirmando asistencias:");
    console.error("Status:", error.response?.status);
    console.error("Data:", error.response?.data);
    console.error("Message:", error.message);

    throw new Error("Error al confirmar asistencias en API externo");
  }
}
