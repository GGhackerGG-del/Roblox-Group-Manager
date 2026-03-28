import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import { promises as fs } from "fs";
import { generateScript, generateScriptAI, startGeneration, getJob } from "../services/shortsGenerator.js";

const router: IRouter = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "shorts");
fs.mkdir(uploadsDir, { recursive: true }).catch((e) =>
  console.error("[Shorts] failed to create uploads dir:", e)
);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|webp|gif|mp3|wav|ogg|m4a|aac)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type"));
    }
  },
});

router.post("/shorts/generate-script", async (req, res): Promise<void> => {
  const { productName, productDescription, price, cta, style, platform, useAI } = req.body;
  if (!productName) {
    res.status(400).json({ error: "Product name is required" });
    return;
  }

  const input = {
    productName: productName || "",
    productDescription: productDescription || "",
    price: price || "",
    cta: cta || "",
    style: style || "clean",
    platform: platform || "tiktok",
  };

  if (useAI) {
    const aiScript = await generateScriptAI(input);
    if (aiScript) {
      res.json({ script: aiScript, source: "ai" });
      return;
    }
  }

  const script = generateScript(input);
  res.json({ script, source: "template" });
});

const uploadMiddleware = upload.fields([
  { name: "images", maxCount: 8 },
  { name: "music", maxCount: 1 },
  { name: "logo", maxCount: 1 },
]);

router.post(
  "/shorts/generate",
  (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err) {
        const msg = err instanceof multer.MulterError
          ? `Upload error: ${err.code} – ${err.message}`
          : err.message || "File upload failed";
        console.error("[Shorts] multer error:", msg);
        res.status(400).json({ error: msg });
        return;
      }
      next();
    });
  },
  async (req, res): Promise<void> => {
    try {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const images = files?.images?.map((f) => f.path) || [];

      console.log(`[Shorts] generate – received ${images.length} image(s), content-type: ${req.headers["content-type"]?.slice(0, 40)}`);

      if (images.length === 0) {
        res.status(400).json({ error: "At least one image is required" });
        return;
      }

      const body = req.body;
      let script;
      if (body.script) {
        try {
          const parsed = JSON.parse(body.script);
          if (!parsed.hook || !Array.isArray(parsed.subtitles) || !parsed.ctaLine) {
            res.status(400).json({ error: "Invalid script format: missing hook, subtitles, or ctaLine" });
            return;
          }
          script = parsed;
        } catch {
          res.status(400).json({ error: "Invalid script JSON" });
          return;
        }
      } else {
        script = generateScript({
          productName: body.productName || "Product",
          productDescription: body.productDescription || "",
          price: body.price || "",
          cta: body.cta || "",
          style: body.style || "clean",
          platform: body.platform || "tiktok",
        });
      }

      const ownerId = String(req.session.robloxUserId || "anon");
      const jobId = await startGeneration({
        productName: body.productName || "Product",
        productDescription: body.productDescription || "",
        price: body.price || "",
        itemUrl: body.itemUrl || "",
        cta: body.cta || "",
        platform: body.platform || "tiktok",
        duration: parseInt(body.duration) || 15,
        style: body.style || "clean",
        images,
        script,
        brandColor: body.brandColor,
        brandColorSecondary: body.brandColorSecondary,
        watermarkText: body.watermarkText,
        logoPath: files?.logo?.[0]?.path,
        musicPath: files?.music?.[0]?.path,
      }, ownerId);

      res.json({ jobId, status: "queued" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to start generation" });
    }
  }
);

router.get("/shorts/:id/status", (req, res): void => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  const ownerId = String(req.session.robloxUserId || "anon");
  if (job.ownerId !== ownerId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    error: job.error,
    createdAt: job.createdAt,
  });
});

router.get("/shorts/:id/download", async (req, res): Promise<void> => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  const ownerId = String(req.session.robloxUserId || "anon");
  if (job.ownerId !== ownerId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  if (job.status !== "done" || !job.outputPath) {
    res.status(400).json({ error: "Video not ready yet" });
    return;
  }
  try {
    await fs.access(job.outputPath);
    res.download(job.outputPath, `${job.id}.mp4`);
  } catch {
    res.status(404).json({ error: "Video file not found" });
  }
});

export default router;
