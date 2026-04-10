import axios from "axios";
import https from "https";

const apiClient = axios.create({
  baseURL: process.env.EXTERNAL_API_BASE_URL,
  headers: {
    "Content-Type": "application/json"
  },
  timeout: 15000,

  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  })
});

export default apiClient;
