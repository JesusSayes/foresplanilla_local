import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import controller from "../controllers/subdiarioController.js";

const router = express.Router();

router.use(authenticateToken);

router.get("/", controller.getAll);
router.get("/:id", controller.getById);
router.post("/filter", controller.filter);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.delete("/:id", controller.delete);

export default router;
