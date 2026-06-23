import axios from "axios";
import { API_BASE_URL, API_PREFIX } from "@/api/apiConfig";

const API_URL = `${API_BASE_URL}${API_PREFIX}`;

export const uploadFile = async (file) => {
  const formData = new FormData();

  formData.append("file", file);

  const response = await axios.post(
    `${API_URL}/upload`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    }
  );

  return response.data;
};
