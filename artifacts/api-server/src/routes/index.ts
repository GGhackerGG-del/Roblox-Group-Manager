import { Router, type IRouter } from "express";
import { requireLicense } from "../middleware/requireLicense.js";
import healthRouter from "./health";
import licenseRouter from "./license";
import robloxRouter from "./roblox";
import clothingRouter from "./clothing";
import socialRouter from "./social";
import featuredGroupsRouter from "./featuredGroups";
import competitorRouter from "./competitor";
import assistantRouter from "./assistant";
import banshieldRouter from "./banshield";
import sniperRouter from "./sniper";
import pnlRouter from "./pnl";
import forumRouter from "./forum";
import automationRouter from "./automation";

const router: IRouter = Router();

router.use(healthRouter);
router.use(licenseRouter);
router.use(featuredGroupsRouter);

router.delete("/roblox/session", (req, res): void => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to end session." });
      return;
    }
    res.json({ status: "ok" });
  });
});

router.use("/roblox", requireLicense);

router.use("/clothing", requireLicense);
router.use("/social", requireLicense);
router.use("/competitor", requireLicense);
router.use("/assistant", requireLicense);
router.use("/banshield", requireLicense);
router.use("/sniper", requireLicense);
router.use("/pnl", requireLicense);
router.use("/forum", requireLicense);
router.use("/automation", requireLicense);
router.use(robloxRouter);
router.use(clothingRouter);
router.use(socialRouter);
router.use(competitorRouter);
router.use(assistantRouter);
router.use(banshieldRouter);
router.use(sniperRouter);
router.use(pnlRouter);
router.use(forumRouter);
router.use(automationRouter);

export default router;
