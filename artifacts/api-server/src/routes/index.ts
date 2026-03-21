import { Router, type IRouter } from "express";
import { requireLicense } from "../middleware/requireLicense.js";
import healthRouter from "./health";
import licenseRouter from "./license";
import robloxRouter from "./roblox";
import clothingRouter, { tempImageGetRouter } from "./clothing";
import socialRouter from "./social";
import featuredGroupsRouter from "./featuredGroups";

const router: IRouter = Router();

router.use(healthRouter);
router.use(licenseRouter);
router.use(featuredGroupsRouter);

router.use(tempImageGetRouter);

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
router.use(robloxRouter);
router.use(clothingRouter);
router.use(socialRouter);

export default router;
