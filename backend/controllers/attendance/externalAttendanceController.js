import { getAsistenciasExternal } from "../../utils/externalApiService.js";
import { syncExternalAttendance } from "../../services/externalAttendanceSync.js";

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

  },

  async syncExternalAttendance(req, res) {

    try {

      const { updateExisting = false, limit = null, dryRun = false } = req.body;

      const result = await syncExternalAttendance({ updateExisting, limit, dryRun });

      return res.json({
        success: result.success,
        ...result
      });

    } catch (error) {

      console.error("External attendance sync error:", error.message);

      return res.status(500).json({
        success: false,
        message: error.message
      });

    }

  }

};
