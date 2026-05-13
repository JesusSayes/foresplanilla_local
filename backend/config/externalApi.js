import axios from "axios";
import https from "https";

const apiClient = axios.create({
  headers: {
    "Content-Type": "application/json"
  },
  timeout: 15000,
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  })
});

apiClient.interceptors.request.use((config) => {
  config.baseURL = process.env.EXTERNAL_API_BASE_URL;
  return config;
});

export default apiClient;
