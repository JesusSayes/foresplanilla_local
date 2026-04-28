import express from "express";
import controller from "../../controllers/attendance/logsController.js";
import { authenticateToken } from "../../middleware/auth.js";

const router = express.Router();

router.use(authenticateToken);

router.get("/", controller.getByEmployeeAndDate);

export default router;
