import { Router } from "express";
import * as controller from "../controllers/alerts.js";
const router = Router();
router.get("/", controller.list);
router.post("/scan", controller.scan);
router.post("/:alertId/snooze", controller.snooze);
router.post("/:alertId/resolve", controller.resolve);
export default router;
