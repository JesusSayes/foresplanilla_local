import { getAsistenciasExternal } from "../../utils/externalApiService.js";

export const externalAttendanceController = {

  async getExternalAsistencias(req, res) {

    try {

      const data = await getAsistenciasExternal();

      return res.json({
        success: true,
        data
      });

    } catch (error) {

      console.error("External attendance error:", error.message);

      return res.status(500).json({
        success: false,
        message: error.message
      });

    }

  }

};
