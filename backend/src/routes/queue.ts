import { Router } from "express";
import { list } from "../controllers/queue.js";

const router = Router();
router.get("/", list);

export default router;
