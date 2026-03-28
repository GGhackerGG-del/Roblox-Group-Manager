import { Router, type IRouter } from "express";
import { getOnlineUsers } from "../signaling.js";

const router: IRouter = Router();

router.get("/presence/online", (_req, res): void => {
  const users = getOnlineUsers();
  res.json({ users, count: users.length });
});

export default router;
