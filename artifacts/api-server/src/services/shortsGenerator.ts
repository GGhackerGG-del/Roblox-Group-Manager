import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);

const __dirname_local = path.dirname(fileURLToPath(import.meta.url));
const FONT_CANDIDATES = [
  path.resolve(__dirname_local, "../../assets/fonts/DejaVuSans-Bold.ttf"),
  path.resolve(process.cwd(), "assets/fonts/DejaVuSans-Bold.ttf"),
  path.resolve(process.cwd(), "artifacts/api-server/assets/fonts/DejaVuSans-Bold.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
];

import { existsSync } from "fs";
let FONT_PATH = "";
for (const candidate of FONT_CANDIDATES) {
  if (existsSync(candidate)) {
    FONT_PATH = candidate;
    break;
  }
}
console.log(`[Shorts] Font path resolved: ${FONT_PATH || "NONE FOUND"}`);
const fontFileParam = FONT_PATH ? `fontfile=${FONT_PATH.replace(/:/g, "\\\\:")}:` : "";

export interface ShortsJobInput {
  productName: string;
  productDescription: string;
  price: string;
  itemUrl: string;
  cta: string;
  platform: "tiktok" | "youtube";
  duration: number;
  style: string;
  images: string[];
  script: GeneratedScript;
  brandColor?: string;
  brandColorSecondary?: string;
  watermarkText?: string;
  logoPath?: string;
  musicPath?: string;
}

export interface GeneratedScript {
  hook: string;
  subtitles: string[];
  ctaLine: string;
  caption: string;
  hashtags: string[];
}

export interface ShortsJob {
  id: string;
  ownerId: string;
  status: "queued" | "processing" | "done" | "error";
  progress: number;
  outputPath?: string;
  error?: string;
  createdAt: number;
  inputFiles: string[];
}

const jobs = new Map<string, ShortsJob>();

export function getJob(id: string): ShortsJob | undefined {
  return jobs.get(id);
}

export function generateScript(input: {
  productName: string;
  productDescription: string;
  price: string;
  cta: string;
  style: string;
  platform: string;
}): GeneratedScript {
  const styleHooks: Record<string, string[]> = {
    clean: ["Check this out", "You NEED this.", "Simple. Clean. Fire."],
    hype: ["THIS IS INSANE", "BRO LOOK AT THIS!!", "NO WAY this exists!!"],
    minimal: ["Less is more.", "Details matter.", "Refined style."],
    luxury: ["Premium quality only.", "Exclusive drop.", "Elite taste."],
    streetwear: ["Drip check", "Street approved.", "The fit goes CRAZY"],
  };

  const hooks = styleHooks[input.style] || styleHooks.clean;
  const hook = hooks[Math.floor(Math.random() * hooks.length)];

  const subtitles: string[] = [];
  subtitles.push(input.productName);
  if (input.productDescription) {
    subtitles.push(
      input.productDescription.length > 60
        ? input.productDescription.substring(0, 57) + "..."
        : input.productDescription
    );
  }
  if (input.price) subtitles.push(`Only ${input.price}`);
  subtitles.push("Available now");

  const ctaLine = input.cta || "Get yours now! Link in bio";

  const platformTags: Record<string, string[]> = {
    tiktok: ["#roblox", "#robloxclothing", "#robloxfit", "#fyp", "#viral", "#robloxdrip"],
    youtube: ["#roblox", "#shorts", "#robloxclothing", "#gaming", "#robloxoutfit"],
  };
  const hashtags = platformTags[input.platform] || platformTags.tiktok;

  const caption = `${hook} ${input.productName}${input.productDescription ? " — " + input.productDescription : ""}. ${ctaLine}`;

  return { hook, subtitles, ctaLine, caption, hashtags };
}

export async function generateScriptAI(input: {
  productName: string;
  productDescription: string;
  price: string;
  cta: string;
  style: string;
  platform: string;
}): Promise<GeneratedScript | null> {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) return null;

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ baseURL, apiKey });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert social media marketer for Roblox clothing and group promotions. Generate short-form video scripts. Always respond in valid JSON only, no markdown.`,
        },
        {
          role: "user",
          content: `Create a ${input.platform === "youtube" ? "YouTube Shorts" : "TikTok"} video script for:
Product: ${input.productName}
Description: ${input.productDescription || "N/A"}
Price: ${input.price || "N/A"}
Style: ${input.style}
CTA: ${input.cta || "Get yours now"}

Return JSON with fields:
- "hook": catchy opening text (max 8 words)
- "subtitles": array of 3-4 short overlay texts shown per scene (max 10 words each)
- "ctaLine": call-to-action text for final scene (max 12 words)
- "caption": post caption for social media (1-2 sentences)
- "hashtags": array of 6-8 relevant hashtags`,
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content || "";
    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    if (!cleaned || cleaned.length < 10) {
      console.warn("[ShortsAI] AI returned empty or too-short response, falling back to template");
      return null;
    }
    const parsed = JSON.parse(cleaned);

    if (parsed.hook && parsed.subtitles && parsed.ctaLine && parsed.caption && parsed.hashtags) {
      return parsed as GeneratedScript;
    }
    return null;
  } catch (err: any) {
    console.error("[ShortsAI] Script generation failed:", err.message);
    return null;
  }
}

function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/;/g, "\\;")
    .replace(/\n/g, " ");
}

const STYLE_CONFIGS: Record<string, {
  textColor: string;
  accent: string;
  bgOpacity: string;
  fontSize: number;
  ctaFontSize: number;
  titleFontSize: number;
  vignette: number;
  contrast: number;
  brightness: number;
  saturation: number;
}> = {
  clean: {
    textColor: "white", accent: "0x5B88BDCC", bgOpacity: "0x00000088",
    fontSize: 56, ctaFontSize: 64, titleFontSize: 72,
    vignette: 0.4, contrast: 1.05, brightness: 0.0, saturation: 1.1,
  },
  hype: {
    textColor: "white", accent: "0xFF4500CC", bgOpacity: "0x00000099",
    fontSize: 62, ctaFontSize: 70, titleFontSize: 78,
    vignette: 0.5, contrast: 1.15, brightness: -0.02, saturation: 1.2,
  },
  minimal: {
    textColor: "white", accent: "0x333333CC", bgOpacity: "0x00000066",
    fontSize: 50, ctaFontSize: 58, titleFontSize: 66,
    vignette: 0.3, contrast: 1.0, brightness: 0.0, saturation: 0.9,
  },
  luxury: {
    textColor: "white", accent: "0x8B6914CC", bgOpacity: "0x000000AA",
    fontSize: 54, ctaFontSize: 62, titleFontSize: 70,
    vignette: 0.5, contrast: 1.1, brightness: -0.03, saturation: 0.85,
  },
  streetwear: {
    textColor: "white", accent: "0x00CC66CC", bgOpacity: "0x00000088",
    fontSize: 58, ctaFontSize: 66, titleFontSize: 74,
    vignette: 0.45, contrast: 1.1, brightness: -0.01, saturation: 1.15,
  },
};

const XFADE_TRANSITIONS = [
  "pixelize", "diagtl", "diagtr", "fadeblack", "fadewhite",
  "wipeleft", "wiperight", "wipeup", "wipedown",
  "slideleft", "slideright", "slideup", "slidedown",
  "circlecrop", "rectcrop", "horzopen", "vertopen",
  "squeezeh", "squeezev", "hlslice", "hrslice",
  "vuslice", "vdslice", "radial", "zoomin",
];

export async function startGeneration(input: ShortsJobInput, ownerId: string): Promise<string> {
  const id = `short_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const allInputFiles = [...input.images];
  if (input.musicPath) allInputFiles.push(input.musicPath);
  if (input.logoPath) allInputFiles.push(input.logoPath);

  const job: ShortsJob = {
    id,
    ownerId,
    status: "queued",
    progress: 0,
    createdAt: Date.now(),
    inputFiles: allInputFiles,
  };
  jobs.set(id, job);

  processJob(id, input).catch((err) => {
    const j = jobs.get(id);
    if (j) {
      j.status = "error";
      j.error = err.message;
    }
  });

  return id;
}

function getJob_(id: string): ShortsJob | undefined {
  return jobs.get(id);
}

async function cleanupInputFiles(job: ShortsJob): Promise<void> {
  for (const f of job.inputFiles) {
    await fs.unlink(f).catch(() => {});
  }
}

setInterval(() => {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (now - job.createdAt > ONE_HOUR && (job.status === "done" || job.status === "error")) {
      if (job.outputPath) fs.unlink(job.outputPath).catch(() => {});
      cleanupInputFiles(job).catch(() => {});
      jobs.delete(id);
    }
  }
}, 10 * 60 * 1000);

async function ffrun(args: string[], timeout = 120000): Promise<void> {
  await execFileAsync("ffmpeg", args, { timeout, maxBuffer: 10 * 1024 * 1024 });
}

async function probeDuration(file: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ], { timeout: 10000 });
  return parseFloat(stdout.trim()) || 0;
}

function pickTransition(index: number): string {
  return XFADE_TRANSITIONS[index % XFADE_TRANSITIONS.length];
}

async function renderScene(opts: {
  imgPath: string;
  outPath: string;
  text: string;
  duration: number;
  sceneIndex: number;
  styleCfg: typeof STYLE_CONFIGS[string];
  W: number;
  H: number;
  SW: number;
  SH: number;
  isIntro: boolean;
}): Promise<void> {
  const { imgPath, outPath, text, duration, sceneIndex, styleCfg, W, H, SW, SH, isIntro } = opts;
  const fps = 30;
  const frames = Math.ceil(duration * fps);
  const escapedText = esc(text);

  const zoomPatterns = [
    `if(lte(1+0.04*on/${fps}/${duration},1.15),1+0.04*on/${fps}/${duration},1.15)`,
    `if(gte(1.15-0.04*on/${fps}/${duration},1),1.15-0.04*on/${fps}/${duration},1)`,
    `1.08+0.07*sin(on/${fps}*0.6)`,
    `if(lte(1+0.06*on/${fps}/${duration},1.2),1+0.06*on/${fps}/${duration},1.2)`,
  ];
  const zoomExpr = zoomPatterns[sceneIndex % zoomPatterns.length];

  const panPatterns = [
    `(iw-ow)/2+40*sin(on/${fps}*0.35)`,
    `(iw-ow)/2-30*sin(on/${fps}*0.5)`,
    `(iw-ow)/2+20*cos(on/${fps}*0.25)`,
    `(iw-ow)/2`,
  ];
  const panX = panPatterns[sceneIndex % panPatterns.length];
  const panY = sceneIndex % 2 === 0 ? `(ih-oh)/2+15*sin(on/${fps}*0.25)` : `(ih-oh)/2`;

  const vignetteAngle = styleCfg.vignette.toFixed(2);
  const eq = `eq=contrast=${styleCfg.contrast}:brightness=${styleCfg.brightness}:saturation=${styleCfg.saturation}`;

  const textY = isIntro ? "h*0.42" : "h*0.12";
  const fontSize = isIntro ? styleCfg.titleFontSize : styleCfg.fontSize;
  const borderW = isIntro ? 5 : 4;

  const textAppear = 0.15;
  const textEnd = duration - 0.2;

  let filterParts: string[];

  if (isIntro) {
    const introSlide = `'if(lt(t,0.5),-text_h+(text_h+h*0.42)*t/0.5,h*0.42)'`;
    filterParts = [
      `[0:v]split[bg][fg]`,
      `[bg]scale=${SW}:${SH}:force_original_aspect_ratio=increase,crop=${SW}:${SH},gblur=sigma=25[blurbg]`,
      `[fg]scale=${SW}:${SH}:force_original_aspect_ratio=decrease[fgscaled]`,
      `[blurbg][fgscaled]overlay=(W-w)/2:(H-h)/2[combined]`,
      `[combined]zoompan=z='${zoomExpr}':x='${panX}':y='${panY}':d=${frames}:s=${W}x${H}:fps=${fps}[zp]`,
      `[zp]setsar=1,format=yuv420p,${eq},vignette=angle=${vignetteAngle},` +
      `fade=t=in:st=0:d=0.3,fade=t=out:st=${(duration - 0.4).toFixed(2)}:d=0.4,` +
      `drawbox=x=0:y=0:w=iw:h=ih:color=0x000000@0.15:t=fill,` +

      `drawtext=${fontFileParam}text='${escapedText}':fontsize=${fontSize + 6}:fontcolor=white@0.08:` +
      `borderw=16:bordercolor=white@0.04:x=(w-text_w)/2:y=${introSlide}:` +
      `enable='between(t,${textAppear},${textEnd})',` +

      `drawtext=${fontFileParam}text='${escapedText}':fontsize=${fontSize + 3}:fontcolor=white@0.15:` +
      `borderw=10:bordercolor=white@0.08:x=(w-text_w)/2:y=${introSlide}:` +
      `enable='between(t,${textAppear},${textEnd})',` +

      `drawtext=${fontFileParam}text='${escapedText}':fontsize=${fontSize}:fontcolor=white:` +
      `borderw=${borderW}:bordercolor=0x111111:x=(w-text_w)/2:y=${introSlide}:` +
      `enable='between(t,${textAppear},${textEnd})'`,
    ];
  } else {
    const sceneSlide = `'if(lt(t,0.35),-text_w+(text_w+60)*t/0.35,60)'`;
    filterParts = [
      `[0:v]split[bg][fg]`,
      `[bg]scale=${SW}:${SH}:force_original_aspect_ratio=increase,crop=${SW}:${SH},gblur=sigma=25[blurbg]`,
      `[fg]scale=${SW}:${SH}:force_original_aspect_ratio=decrease[fgscaled]`,
      `[blurbg][fgscaled]overlay=(W-w)/2:(H-h)/2[combined]`,
      `[combined]zoompan=z='${zoomExpr}':x='${panX}':y='${panY}':d=${frames}:s=${W}x${H}:fps=${fps}[zp]`,
      `[zp]setsar=1,format=yuv420p,${eq},vignette=angle=${vignetteAngle},` +
      `fade=t=in:st=0:d=0.2,fade=t=out:st=${(duration - 0.35).toFixed(2)}:d=0.35,` +

      `drawtext=${fontFileParam}text='${escapedText}':fontsize=${fontSize + 3}:fontcolor=0x000000@0.35:` +
      `borderw=10:bordercolor=0x000000@0.12:x=${sceneSlide}:y=${textY}:` +
      `enable='between(t,${textAppear},${textEnd})',` +

      `drawtext=${fontFileParam}text='${escapedText}':fontsize=${fontSize}:fontcolor=white:` +
      `borderw=${borderW}:bordercolor=0x111111:x=${sceneSlide}:y=${textY}:` +
      `enable='between(t,${textAppear},${textEnd})'`,
    ];
  }

  const filter = filterParts.join(";");

  await ffrun([
    "-y", "-loop", "1", "-i", imgPath,
    "-filter_complex", filter,
    "-t", String(duration),
    "-c:v", "libx264", "-preset", "fast", "-crf", "19",
    "-pix_fmt", "yuv420p", "-r", String(fps),
    "-threads", "2",
    outPath,
  ]);
}

async function renderCtaScene(opts: {
  imgPath: string;
  outPath: string;
  productName: string;
  price: string;
  ctaLine: string;
  duration: number;
  styleCfg: typeof STYLE_CONFIGS[string];
  W: number;
  H: number;
  SW: number;
  SH: number;
}): Promise<void> {
  const { imgPath, outPath, productName, price, ctaLine, duration, styleCfg, W, H, SW, SH } = opts;
  const fps = 30;
  const frames = Math.ceil(duration * fps);
  const escapedProduct = esc(productName);
  const escapedPrice = price ? esc(price) : "";
  const escapedCta = esc(ctaLine);

  const eq = `eq=contrast=${styleCfg.contrast}:brightness=${styleCfg.brightness - 0.06}:saturation=${styleCfg.saturation * 0.7}`;

  const slideIn = `'if(lt(t,0.6),w+50-(w+50)*t/0.6,(w-text_w)/2)'`;
  const slideInPrice = `'if(lt(t,0.8),w+50-(w+50)*(t-0.15)/0.65,(w-text_w)/2)'`;
  const slideInCta = `'if(lt(t,1.0),w+50-(w+50)*(t-0.3)/0.7,(w-text_w)/2)'`;

  const productGlowLayers = [
    `drawtext=${fontFileParam}text='${escapedProduct}':fontsize=${styleCfg.ctaFontSize + 6}:fontcolor=white@0.06:` +
    `borderw=18:bordercolor=white@0.03:x=${slideIn}:y=h*0.36:enable='gte(t,0.3)'`,

    `drawtext=${fontFileParam}text='${escapedProduct}':fontsize=${styleCfg.ctaFontSize + 2}:fontcolor=white@0.12:` +
    `borderw=10:bordercolor=white@0.06:x=${slideIn}:y=h*0.36+2:enable='gte(t,0.3)'`,

    `drawtext=${fontFileParam}text='${escapedProduct}':fontsize=${styleCfg.ctaFontSize}:fontcolor=white:` +
    `borderw=5:bordercolor=0x111111:x=${slideIn}:y=h*0.36+4:enable='gte(t,0.3)'`,
  ];

  let priceLayers = "";
  let priceYBase = "h*0.46";
  if (escapedPrice) {
    priceLayers = `,drawtext=${fontFileParam}text='${escapedPrice}':fontsize=54:fontcolor=0xFFD700@0.2:` +
      `borderw=10:bordercolor=0xFFD700@0.06:x=${slideInPrice}:y=${priceYBase}:enable='gte(t,0.5)'` +
      `,drawtext=${fontFileParam}text='${escapedPrice}':fontsize=52:fontcolor=0xFFD700:` +
      `borderw=4:bordercolor=0x332200:x=${slideInPrice}:y=${priceYBase}:enable='gte(t,0.5)'`;
  }

  const ctaYBase = escapedPrice ? "h*0.55" : "h*0.48";
  const ctaLayers =
    `,drawtext=${fontFileParam}text='${escapedCta}':fontsize=44:fontcolor=white@0.1:` +
    `borderw=8:bordercolor=white@0.04:x=${slideInCta}:y=${ctaYBase}:enable='gte(t,0.6)'` +
    `,drawtext=${fontFileParam}text='${escapedCta}':fontsize=42:fontcolor=0xEEEEEE:` +
    `borderw=3:bordercolor=0x111111:x=${slideInCta}:y=${ctaYBase}:enable='gte(t,0.6)'`;

  const filterParts = [
    `[0:v]split[bg][fg]`,
    `[bg]scale=${SW}:${SH}:force_original_aspect_ratio=increase,crop=${SW}:${SH},gblur=sigma=35[blurbg]`,
    `[fg]scale=${SW}:${SH}:force_original_aspect_ratio=decrease[fgscaled]`,
    `[blurbg][fgscaled]overlay=(W-w)/2:(H-h)/2[combined]`,
    `[combined]zoompan=z='1.04+0.02*sin(on/${fps}*0.4)':x='(iw-ow)/2':y='(ih-oh)/2':d=${frames}:s=${W}x${H}:fps=${fps}[zp]`,
    `[zp]setsar=1,format=yuv420p,${eq},gblur=sigma=8,vignette=angle=0.55,` +

    `fade=t=in:st=0:d=0.5,` +

    `drawbox=x=0:y=0:w=iw:h=ih:color=0x000000@0.5:t=fill,` +

    productGlowLayers.join(",") +
    priceLayers +
    ctaLayers,
  ];

  const filter = filterParts.join(";");

  await ffrun([
    "-y", "-loop", "1", "-i", imgPath,
    "-filter_complex", filter,
    "-t", String(duration),
    "-c:v", "libx264", "-preset", "fast", "-crf", "19",
    "-pix_fmt", "yuv420p", "-r", String(fps),
    "-threads", "2",
    outPath,
  ]);
}

async function createFlashFrame(outPath: string, W: number, H: number): Promise<void> {
  await ffrun([
    "-y", "-f", "lavfi", "-i", `color=c=white:s=${W}x${H}:d=0.08:r=30`,
    "-vf", "format=yuv420p,fade=t=out:st=0:d=0.08",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
    "-pix_fmt", "yuv420p",
    outPath,
  ], 15000);
}

async function processJob(id: string, input: ShortsJobInput): Promise<void> {
  const job = jobs.get(id)!;
  job.status = "processing";
  job.progress = 5;

  const outputDir = path.join(process.cwd(), "uploads", "shorts");
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${id}.mp4`);
  const tempDir = path.join(outputDir, `temp_${id}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    const W = 1080;
    const H = 1920;
    const SW = Math.round(W * 1.3);
    const SH = Math.round(H * 1.3);
    const totalDuration = input.duration || 15;
    const imageCount = input.images.length;
    if (imageCount === 0) throw new Error("No images provided");

    const styleCfg = STYLE_CONFIGS[input.style] || STYLE_CONFIGS.clean;

    const xfadeDur = 0.6;
    const totalScenes = imageCount + 1;
    const sceneBaseDur = totalDuration / totalScenes + xfadeDur * 0.5;

    job.progress = 8;

    const allTexts = [
      input.script.hook,
      ...input.script.subtitles.slice(0, imageCount - 1),
    ];
    while (allTexts.length < imageCount) allTexts.push(input.productName);

    const sceneFiles: string[] = [];

    for (let i = 0; i < imageCount; i++) {
      const imgPath = input.images[i];
      const sceneFile = path.join(tempDir, `scene_${i}.mp4`);
      const text = allTexts[i];

      await renderScene({
        imgPath, outPath: sceneFile, text,
        duration: sceneBaseDur,
        sceneIndex: i, styleCfg, W, H, SW, SH,
        isIntro: i === 0,
      });

      sceneFiles.push(sceneFile);
      job.progress = 8 + Math.floor((i + 1) / totalScenes * 50);
    }

    const ctaScene = path.join(tempDir, "scene_cta.mp4");
    const ctaDur = Math.max(sceneBaseDur, 3.5);

    await renderCtaScene({
      imgPath: input.images[input.images.length > 1 ? input.images.length - 1 : 0],
      outPath: ctaScene,
      productName: input.productName,
      price: input.price,
      ctaLine: input.script.ctaLine,
      duration: ctaDur,
      styleCfg, W, H, SW, SH,
    });

    sceneFiles.push(ctaScene);
    job.progress = 62;

    if (input.watermarkText) {
      for (let i = 0; i < sceneFiles.length; i++) {
        const src = sceneFiles[i];
        const dst = path.join(tempDir, `wm_${i}.mp4`);
        const wmText = esc(input.watermarkText);
        await ffrun([
          "-y", "-i", src,
          "-vf", `drawtext=${fontFileParam}text='${wmText}':fontsize=24:fontcolor=white@0.3:x=w-text_w-30:y=30`,
          "-c:v", "libx264", "-preset", "fast", "-crf", "19",
          "-pix_fmt", "yuv420p",
          dst,
        ], 30000);
        sceneFiles[i] = dst;
      }
    }

    if (input.logoPath) {
      try {
        await fs.access(input.logoPath);
        for (let i = 0; i < sceneFiles.length; i++) {
          const src = sceneFiles[i];
          const dst = path.join(tempDir, `logo_${i}.mp4`);
          await ffrun([
            "-y", "-i", src, "-i", input.logoPath,
            "-filter_complex",
            `[1:v]scale=100:100:force_original_aspect_ratio=decrease,format=yuva420p,colorchannelmixer=aa=0.6[logo];[0:v][logo]overlay=40:40`,
            "-c:v", "libx264", "-preset", "fast", "-crf", "19",
            "-pix_fmt", "yuv420p",
            dst,
          ], 30000);
          sceneFiles[i] = dst;
        }
      } catch {}
    }

    job.progress = 70;

    let finalOutput: string;

    if (sceneFiles.length >= 2) {
      let current = sceneFiles[0];

      for (let i = 1; i < sceneFiles.length; i++) {
        const next = sceneFiles[i];
        const dst = path.join(tempDir, `xfade_${i}.mp4`);

        let offset: number;
        try {
          const dur = await probeDuration(current);
          offset = Math.max(0.1, dur - xfadeDur);
        } catch {
          offset = sceneBaseDur - xfadeDur;
        }

        const transition = pickTransition(i);

        try {
          await ffrun([
            "-y", "-i", current, "-i", next,
            "-filter_complex",
            `[0:v][1:v]xfade=transition=${transition}:duration=${xfadeDur}:offset=${offset.toFixed(2)},format=yuv420p`,
            "-c:v", "libx264", "-preset", "fast", "-crf", "19",
            "-pix_fmt", "yuv420p",
            dst,
          ], 120000);
          current = dst;
        } catch (xfadeErr: any) {
          console.error(`[Shorts] xfade ${transition} failed at scene ${i}, trying fadeblack:`, xfadeErr.message?.substring(0, 200));
          try {
            await ffrun([
              "-y", "-i", current, "-i", next,
              "-filter_complex",
              `[0:v][1:v]xfade=transition=fadeblack:duration=${xfadeDur}:offset=${offset.toFixed(2)},format=yuv420p`,
              "-c:v", "libx264", "-preset", "fast", "-crf", "19",
              "-pix_fmt", "yuv420p",
              dst,
            ], 120000);
            current = dst;
          } catch {
            console.error(`[Shorts] All xfade failed at scene ${i}, falling back to concat`);
            const concatList = path.join(tempDir, "concat.txt");
            const concatContent = sceneFiles.map((f) => `file '${f}'`).join("\n");
            await fs.writeFile(concatList, concatContent);
            const concatOut = path.join(tempDir, "concat_fallback.mp4");
            await ffrun([
              "-y", "-f", "concat", "-safe", "0", "-i", concatList,
              "-c:v", "libx264", "-preset", "fast", "-crf", "19",
              "-pix_fmt", "yuv420p",
              concatOut,
            ], 120000);
            current = concatOut;
            break;
          }
        }

        job.progress = 70 + Math.floor((i / (sceneFiles.length - 1)) * 18);
      }

      finalOutput = current;
    } else {
      finalOutput = sceneFiles[0];
    }

    job.progress = 90;

    if (input.musicPath) {
      try {
        await fs.access(input.musicPath);
        const withMusic = path.join(tempDir, "with_music.mp4");
        const vidDur = await probeDuration(finalOutput);
        await ffrun([
          "-y", "-i", finalOutput, "-i", input.musicPath,
          "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
          "-map", "0:v:0", "-map", "1:a:0",
          "-shortest",
          "-af", `afade=t=in:st=0:d=0.8,afade=t=out:st=${Math.max(0, vidDur - 1.5)}:d=1.5`,
          withMusic,
        ], 60000);
        finalOutput = withMusic;
      } catch (musicErr: any) {
        console.error("[Shorts] Music overlay failed:", musicErr.message);
      }
    }

    job.progress = 95;

    await fs.copyFile(finalOutput, outputPath);

    job.progress = 100;
    job.status = "done";
    job.outputPath = outputPath;

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await cleanupInputFiles(job).catch(() => {});
  } catch (err: any) {
    job.status = "error";
    job.error = err.message || "Video generation failed";
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await cleanupInputFiles(job).catch(() => {});
    throw err;
  }
}
