import { Router, type IRouter } from "express";
import { requireLicense } from "../middleware/requireLicense.js";
import healthRouter from "./health";
import licenseRouter from "./license";
import robloxRouter from "./roblox";
import clothingRouter from "./clothing";
import socialRouter from "./social";
import featuredGroupsRouter from "./featuredGroups";

import assistantRouter from "./assistant";
import banshieldRouter from "./banshield";
import sniperRouter from "./sniper";
import pnlRouter from "./pnl";
import forumRouter from "./forum";
import automationRouter from "./automation";
import aiToolsRouter from "./aiTools";
import securityRouter from "./security";
import marketingRouter from "./marketing";
import communityRouter from "./community";
import gameManagerRouter from "./gameManager";
import socialMediaRouter from "./socialMedia";
import financeRouter from "./finance";
import contentPlannerRouter from "./contentPlanner";
import gamificationRouter from "./gamification";
import integrationsRouter from "./integrations";
import teamRouter from "./team";
import qualityRouter from "./quality";
import accessoriesRouter from "./accessories";
import shortsRouter from "./shorts";
import presenceRouter from "./presence";

const router: IRouter = Router();

router.use(healthRouter);
router.use(licenseRouter);
router.use(featuredGroupsRouter);
router.use(qualityRouter);

router.delete("/roblox/session", (req, res): void => {
  delete req.session.robloxCookie;
  delete req.session.robloxUserId;
  delete req.session.robloxProfile;
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to clear Roblox session." });
      return;
    }
    res.json({ status: "ok" });
  });
});

router.use("/roblox", requireLicense);

router.use("/clothing", requireLicense);
router.use("/social", requireLicense);

router.use("/assistant", requireLicense);
router.use("/banshield", requireLicense);
router.use("/sniper", requireLicense);
router.use("/pnl", requireLicense);
router.use("/forum", requireLicense);
router.use("/automation", requireLicense);
router.use("/ai-tools", requireLicense);
router.use("/security", requireLicense);
router.use("/marketing", requireLicense);
router.use("/community", requireLicense);
router.use("/game-manager", requireLicense);
router.use("/social-media", requireLicense);
router.use("/finance", requireLicense);
router.use("/content", requireLicense);
router.use("/gamification", requireLicense);
router.use("/integrations", requireLicense);
router.use("/team", requireLicense);
router.use("/accessories", requireLicense);
router.use("/shorts", requireLicense);
router.use("/presence", requireLicense);
router.use(robloxRouter);
router.use(clothingRouter);
router.use(socialRouter);

router.use(assistantRouter);
router.use(banshieldRouter);
router.use(sniperRouter);
router.use(pnlRouter);
router.use(forumRouter);
router.use(automationRouter);
router.use(aiToolsRouter);
router.use(securityRouter);
router.use(marketingRouter);
router.use(communityRouter);
router.use(gameManagerRouter);
router.use(socialMediaRouter);
router.use(financeRouter);
router.use(contentPlannerRouter);
router.use(gamificationRouter);
router.use(integrationsRouter);
router.use(teamRouter);
router.use(accessoriesRouter);
router.use(shortsRouter);
router.use(presenceRouter);

export default router;
