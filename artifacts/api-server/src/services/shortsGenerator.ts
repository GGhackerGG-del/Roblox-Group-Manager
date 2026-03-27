import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

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
    clean: ["Check this out 👀", "You need this.", "Simple. Clean. Fire."],
    hype: ["🔥 THIS IS INSANE 🔥", "BRO LOOK AT THIS", "NO WAY this exists!!"],
    minimal: ["Less is more.", "Details matter.", "Refined style."],
    luxury: ["Premium quality only.", "Exclusive drop.", "Elite taste."],
    streetwear: ["Drip check ✅", "Street approved.", "The fit goes crazy."],
  };

  const hooks = styleHooks[input.style] || styleHooks.clean;
  const hook = hooks[Math.floor(Math.random() * hooks.length)];

  const subtitles = [
    `${input.productName}`,
    input.productDescription.length > 60
      ? input.productDescription.substring(0, 57) + "..."
      : input.productDescription,
    input.price ? `Only ${input.price}` : "Available now",
  ];

  const ctaLine = input.cta || "Get yours now! Link in bio 🔗";

  const platformTags: Record<string, string[]> = {
    tiktok: ["#roblox", "#robloxclothing", "#robloxfit", "#fyp", "#viral", "#robloxdrip"],
    youtube: ["#roblox", "#shorts", "#robloxclothing", "#gaming", "#robloxoutfit"],
  };
  const hashtags = platformTags[input.platform] || platformTags.tiktok;

  const caption = `${hook} ${input.productName} - ${input.productDescription}. ${ctaLine}`;

  return { hook, subtitles, ctaLine, caption, hashtags };
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

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
    const WIDTH = 1080;
    const HEIGHT = 1920;
    const totalDuration = input.duration || 15;
    const imageCount = input.images.length;
    if (imageCount === 0) throw new Error("No images provided");

    const sceneDuration = totalDuration / (imageCount + 1);
    job.progress = 10;

    const sceneFiles: string[] = [];

    for (let i = 0; i < imageCount; i++) {
      const imgPath = input.images[i];
      const sceneFile = path.join(tempDir, `scene_${i}.mp4`);

      const textLine = i === 0
        ? input.script.hook
        : (input.script.subtitles[i - 1] || input.productName);

      const zoomExpr = i % 2 === 0
        ? `min(1+0.04*t/${sceneDuration}\\,1.15)`
        : `max(1.15-0.04*t/${sceneDuration}\\,1)`;

      const panExpr = i % 3 === 0
        ? `'(iw-ow)/2+20*sin(t*0.5)'` : `'(iw-ow)/2'`;

      const escapedText = escapeDrawtext(textLine);

      const brandColor = (input.brandColor || "#FFFFFF").replace("#", "0x");
      const bgColor = "0x00000088";

      const filterComplex = [
        `[0:v]scale=${WIDTH * 2}:${HEIGHT * 2},` +
        `zoompan=z='${zoomExpr}':x=${panExpr}:y='(ih-oh)/2':d=${Math.ceil(sceneDuration * 25)}:s=${WIDTH}x${HEIGHT}:fps=25,` +
        `setsar=1,format=yuv420p,` +
        `drawtext=text='${escapedText}':fontsize=52:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.78:` +
        `enable='between(t,0.3,${sceneDuration - 0.2})'`,
      ].join("");

      await execFileAsync("ffmpeg", [
        "-y", "-loop", "1", "-i", imgPath,
        "-filter_complex", filterComplex,
        "-t", String(sceneDuration),
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-pix_fmt", "yuv420p",
        sceneFile,
      ], { timeout: 60000 });

      sceneFiles.push(sceneFile);
      job.progress = 10 + Math.floor((i + 1) / (imageCount + 1) * 60);
    }

    const ctaScene = path.join(tempDir, "scene_cta.mp4");
    const ctaDuration = Math.max(sceneDuration, 3);
    const escapedCta = escapeDrawtext(input.script.ctaLine);
    const escapedProduct = escapeDrawtext(input.productName);

    const bgImg = input.images[0];
    const ctaFilter = [
      `[0:v]scale=${WIDTH * 2}:${HEIGHT * 2},` +
      `zoompan=z='1.1':x='(iw-ow)/2':y='(ih-oh)/2':d=${Math.ceil(ctaDuration * 25)}:s=${WIDTH}x${HEIGHT}:fps=25,` +
      `setsar=1,format=yuv420p,` +
      `drawbox=x=0:y=ih*0.35:w=iw:h=ih*0.30:color=0x00000099:t=fill,` +
      `drawtext=text='${escapedProduct}':fontsize=64:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.42,` +
      `drawtext=text='${escapedCta}':fontsize=44:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h*0.52`,
    ].join("");

    await execFileAsync("ffmpeg", [
      "-y", "-loop", "1", "-i", bgImg,
      "-filter_complex", ctaFilter,
      "-t", String(ctaDuration),
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-pix_fmt", "yuv420p",
      ctaScene,
    ], { timeout: 60000 });

    sceneFiles.push(ctaScene);
    job.progress = 75;

    if (input.watermarkText) {
      for (let i = 0; i < sceneFiles.length; i++) {
        const src = sceneFiles[i];
        const dst = path.join(tempDir, `wm_${i}.mp4`);
        const wmText = escapeDrawtext(input.watermarkText);
        await execFileAsync("ffmpeg", [
          "-y", "-i", src,
          "-vf", `drawtext=text='${wmText}':fontsize=24:fontcolor=white@0.4:x=w-text_w-20:y=20`,
          "-c:v", "libx264", "-preset", "fast", "-crf", "23",
          "-pix_fmt", "yuv420p",
          dst,
        ], { timeout: 30000 });
        sceneFiles[i] = dst;
      }
    }

    job.progress = 85;

    const concatList = path.join(tempDir, "concat.txt");
    const concatContent = sceneFiles.map((f) => `file '${f}'`).join("\n");
    await fs.writeFile(concatList, concatContent);

    const concatOutput = path.join(tempDir, "concat.mp4");
    await execFileAsync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", concatList,
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-pix_fmt", "yuv420p",
      concatOutput,
    ], { timeout: 60000 });

    job.progress = 90;

    if (input.musicPath) {
      try {
        await fs.access(input.musicPath);
        await execFileAsync("ffmpeg", [
          "-y", "-i", concatOutput, "-i", input.musicPath,
          "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
          "-map", "0:v:0", "-map", "1:a:0",
          "-shortest",
          outputPath,
        ], { timeout: 60000 });
      } catch {
        await fs.copyFile(concatOutput, outputPath);
      }
    } else {
      await fs.copyFile(concatOutput, outputPath);
    }

    job.progress = 100;
    job.status = "done";
    job.outputPath = outputPath;

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  } catch (err: any) {
    job.status = "error";
    job.error = err.message || "Video generation failed";
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}
