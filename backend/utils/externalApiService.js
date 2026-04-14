import apiClient from "../config/externalApi.js";

let cachedToken = null;
let tokenCreatedAt = null;
const TOKEN_DURATION = 50 * 60 * 1000; // 50 minutos

async function login() {
  try {

    const response = await apiClient.post("/api-login", {
      email: process.env.EXTERNAL_API_EMAIL,
      password: process.env.EXTERNAL_API_PASSWORD
    });

    cachedToken = response.data.token;
    tokenCreatedAt = Date.now();

    return cachedToken;

  } catch (error) {

    console.error("Error login external API:");
  console.error("Status:", error.response?.status);
  console.error("Data:", error.response?.data);
  console.error("Message:", error.message);

    console.error("Error login external API:", error.response?.data || error.message);
    throw new Error("No se pudo autenticar en API externo");

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

    const token = await getToken();

    const response = await apiClient.get("/asistencias", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = response.data?.data || response.data;

    if (limit && Array.isArray(data)) {
      return data.slice(0, limit);
    }

    return data;

  } catch (error) {

    console.error(
      "Error obteniendo asistencias:",
      error.response?.data || error.message
    );
    console.error("Error obteniendo asistencias:");
  console.error("Status:", error.response?.status);
  console.error("Data:", error.response?.data);
  console.error("Message:", error.message);
  console.error("URL:", process.env.EXTERNAL_API_BASE_URL);

    throw new Error("Error al obtener asistencias del API externo");
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
