import express from "express";
import { externalAttendanceController } from "../../controllers/attendance/externalAttendanceController.js";

const router = express.Router();

router.get(
  "/external-asistencias",
  externalAttendanceController.getExternalAsistencias
);

export default router;
