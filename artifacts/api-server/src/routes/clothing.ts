import { Router, type IRouter } from "express";
import { generateImageBuffer, editImageBuffers } from "@workspace/integrations-openai-ai-server/image";
import { UploadClothingBody } from "@workspace/api-zod";
import sharp from "sharp";
import crypto from "crypto";

const router: IRouter = Router();
export const tempImageGetRouter: IRouter = Router();

const tempImages = new Map<string, { data: Buffer; mime: string; expires: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of tempImages) {
    if (v.expires < now) tempImages.delete(k);
  }
}, 60_000);

router.post("/clothing/temp-image", (req, res): void => {
  const { base64, mime } = req.body as { base64?: string; mime?: string };
  if (!base64) { res.status(400).json({ error: "base64 required" }); return; }
  const buf = Buffer.from(base64, "base64");
  const id = crypto.randomBytes(16).toString("hex");
  tempImages.set(id, { data: buf, mime: mime || "image/png", expires: Date.now() + 5 * 60_000 });
  const devDomain = process.env.REPLIT_DEV_DOMAIN || "";
  const url = devDomain
    ? `https://${devDomain}/api/clothing/temp-image/${id}`
    : `${req.protocol}://${req.headers.host}/api/clothing/temp-image/${id}`;
  res.json({ url, id });
});

router.post("/clothing/pollinations-generate", async (req, res): Promise<void> => {
  const { prompt, imageUrl, width, height } = req.body as {
    prompt?: string; imageUrl?: string; width?: number; height?: number;
  };
  if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }

  const seed = Math.floor(Math.random() * 999999);
  const w = width || 585;
  const h = height || 559;

  let pollinationsUrl: string;
  if (imageUrl) {
    pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&model=kontext&seed=${seed}&image=${encodeURIComponent(imageUrl)}`;
  } else {
    pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&model=flux&seed=${seed}`;
  }

  try {
    console.log("[Pollinations] Requesting:", pollinationsUrl.substring(0, 200));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    const response = await fetch(pollinationsUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error("[Pollinations] Error status:", response.status);
      if (imageUrl) {
        console.log("[Pollinations] Retrying without image (flux model)...");
        const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&model=flux&seed=${seed}`;
        const fallback = await fetch(fallbackUrl, { signal: AbortSignal.timeout(120_000) });
        if (!fallback.ok) {
          res.status(502).json({ error: `Pollinations returned ${fallback.status}` });
          return;
        }
        const buf = Buffer.from(await fallback.arrayBuffer());
        res.json({ b64: buf.toString("base64") });
        return;
      }
      res.status(502).json({ error: `Pollinations returned ${response.status}` });
      return;
    }

    const buf = Buffer.from(await response.arrayBuffer());
    console.log("[Pollinations] Success, image size:", buf.length);
    res.json({ b64: buf.toString("base64") });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Pollinations] Fetch error:", msg);
    res.status(502).json({ error: msg });
  }
});

tempImageGetRouter.get("/clothing/temp-image/:id", (req, res): void => {
  const entry = tempImages.get(req.params.id);
  if (!entry || entry.expires < Date.now()) { res.status(404).send("Not found"); return; }
  res.set("Content-Type", entry.mime);
  res.set("Cache-Control", "no-store");
  res.set("Access-Control-Allow-Origin", "*");
  res.send(entry.data);
});

/**
 * Build a mask from the UV template: any non-transparent pixel in the template
 * becomes white (opaque) in the mask; fully transparent pixels become black (transparent).
 * Then apply this mask to the generated image so content only appears inside UV islands.
 * Finally composite the template lines on top.
 */
async function applyUvMask(
  generated: Buffer,
  templateBase64: string,
  w: number,
  h: number
): Promise<Buffer> {
  const templateBuf = Buffer.from(templateBase64, "base64");
  const resizedTemplate = await sharp(templateBuf)
    .resize(w, h, { fit: "fill" })
    .ensureAlpha()
    .png()
    .toBuffer();

  const { data: tplPixels, info: tplInfo } = await sharp(resizedTemplate)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const maskData = Buffer.alloc(tplInfo.width * tplInfo.height);
  for (let i = 0; i < tplInfo.width * tplInfo.height; i++) {
    const alpha = tplPixels[i * 4 + 3];
    maskData[i] = alpha > 10 ? 255 : 0;
  }

  const mask = await sharp(maskData, {
    raw: { width: tplInfo.width, height: tplInfo.height, channels: 1 },
  })
    .blur(1.5)
    .png()
    .toBuffer();

  const resizedGenerated = await sharp(generated)
    .resize(w, h, { fit: "fill" })
    .ensureAlpha()
    .png()
    .toBuffer();

  const { data: genPixels, info: genInfo } = await sharp(resizedGenerated)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data: maskPixels } = await sharp(mask)
    .resize(genInfo.width, genInfo.height, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const result = Buffer.alloc(genInfo.width * genInfo.height * 4);
  for (let i = 0; i < genInfo.width * genInfo.height; i++) {
    const maskVal = maskPixels[i];
    result[i * 4 + 0] = genPixels[i * 4 + 0];
    result[i * 4 + 1] = genPixels[i * 4 + 1];
    result[i * 4 + 2] = genPixels[i * 4 + 2];
    result[i * 4 + 3] = Math.min(genPixels[i * 4 + 3], maskVal);
  }

  return sharp(result, {
    raw: { width: genInfo.width, height: genInfo.height, channels: 4 },
  })
    .composite([{ input: resizedTemplate, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

async function resizeImageBase64(b64: string, w: number, h: number): Promise<string> {
  const buf = Buffer.from(b64, "base64");
  const resized = await sharp(buf)
    .resize(w, h, { fit: "fill" })
    .png()
    .toBuffer();
  return resized.toString("base64");
}

async function getRobloxCsrf(cookie: string): Promise<string> {
  try {
    const csrfResp = await fetch("https://auth.roblox.com/v2/logout", {
      method: "POST",
      headers: { Cookie: `.ROBLOSECURITY=${cookie}` },
    });
    return csrfResp.headers.get("x-csrf-token") || "";
  } catch {
    return "";
  }
}

function buildClothingPrompt(
  userPrompt: string,
  clothingType: string,
  hasExample: boolean,
  hasRefs: boolean
): string {
  const typeLabel = clothingType !== "Pants" ? "shirt" : "pants";

  if (hasExample && hasRefs) {
    return [
      `IMAGE 1 is a Roblox ${typeLabel} UV texture map — a flat 2D sheet with rectangular UV islands laid out on a grid.`,
      `IMAGE 2+ are reference photos of real clothing.`,
      ``,
      `Your job: REPAINT IMAGE 1 so the colored rectangular blocks adopt the colors and surface pattern from the reference photos.`,
      ``,
      `CRITICAL RULES:`,
      `• Output must have the EXACT SAME rectangular block layout as IMAGE 1 — same number of blocks, same positions, same sizes.`,
      `• Only change the FILL COLOR / PATTERN inside each rectangular block.`,
      `• Keep all transparent/empty areas exactly as they are (alpha=0).`,
      `• NO text, NO logos, NO 3D shading, NO new shapes. Just recolor the existing blocks.`,
      `• The output is a FLAT 2D texture map, NOT a 3D garment render.`,
      userPrompt ? `\nAdditional notes: ${userPrompt}` : "",
    ].filter(Boolean).join("\n");
  }

  if (hasExample) {
    return [
      `IMAGE 1 is a Roblox ${typeLabel} UV texture map — a flat 2D sheet with rectangular UV islands on a grid.`,
      ``,
      `Create a new color/pattern variation: "${userPrompt || "new color scheme"}"`,
      ``,
      `CRITICAL RULES:`,
      `• Keep the EXACT SAME rectangular block layout — same blocks, same positions, same sizes.`,
      `• Only change the FILL COLOR / PATTERN inside each block.`,
      `• Keep transparent/empty areas exactly as they are.`,
      `• NO text, NO logos, NO 3D shading. Output is a FLAT 2D texture map.`,
    ].join("\n");
  }

  if (hasRefs) {
    return [
      `Create a Roblox ${typeLabel} UV texture map matching the clothing in the reference photos.`,
      `A UV texture map is a flat 2D sheet with rectangular blocks arranged on a grid — NOT a 3D render.`,
      `Fill each rectangular UV island block with colors/patterns from the reference photos.`,
      `Transparent areas between blocks must be alpha=0. NO 3D shading. Flat 2D texture only.`,
      userPrompt ? `\nAdditional notes: ${userPrompt}` : "",
    ].filter(Boolean).join("\n");
  }

  return [
    `Create a Roblox ${typeLabel} UV texture map.`,
    `Design: ${userPrompt}`,
    `A UV texture map is a flat 2D sheet with rectangular blocks on a grid. Fill each block with the design. Transparent areas between blocks = alpha=0. NO 3D shading.`,
  ].join("\n");
}

router.post("/clothing/generate", async (req, res): Promise<void> => {
  const body = req.body as {
    prompt?: string;
    size?: string;
    clothingType?: string;
    referenceImages?: string[];
    exampleImage?: string;
    uvTemplate?: string;
  };

  if (!body.prompt?.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const prompt = body.prompt.trim();
  const clothingType = body.clothingType || "Shirt";
  const exampleImage = body.exampleImage || null;
  const uvTemplate = body.uvTemplate || null;
  const referenceImages: string[] = Array.isArray(body.referenceImages) ? body.referenceImages : [];

  const hasImages = exampleImage !== null || referenceImages.length > 0;

  const enhancedPrompt = buildClothingPrompt(prompt, clothingType, exampleImage !== null, referenceImages.length > 0);

  try {
    let imageBuffer: Buffer;
    const TARGET = 1024;

    if (hasImages) {
      const imageBase64s: string[] = [];

      if (exampleImage) {
        console.log("[Clothing] Using Example image as layout reference...");
        const resized = await resizeImageBase64(exampleImage, TARGET, TARGET);
        imageBase64s.push(resized);
      }

      for (const ref of referenceImages.slice(0, 4)) {
        const resized = await resizeImageBase64(ref, TARGET, TARGET);
        imageBase64s.push(resized);
      }

      console.log("[Clothing] Generating with", imageBase64s.length, "images (example + refs)...");
      imageBuffer = await editImageBuffers(imageBase64s, enhancedPrompt, "1024x1024");
    } else {
      imageBuffer = await generateImageBuffer(enhancedPrompt, "1024x1024");
    }

    if (uvTemplate) {
      console.log("[Clothing] Applying UV mask — content will only appear inside UV islands...");
      imageBuffer = await applyUvMask(imageBuffer, uvTemplate, TARGET, TARGET);
      console.log("[Clothing] UV mask applied");
    }

    const b64 = imageBuffer.toString("base64");
    res.json({ b64_json: b64, prompt: enhancedPrompt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed";
    console.error("[Clothing] Generation error:", msg);
    res.status(500).json({ error: msg });
  }
});

async function uploadSingleClothing(
  cookie: string,
  csrfToken: string,
  groupId: number,
  name: string,
  description: string,
  imageData: string,
  clothingType: string
): Promise<{ assetId: number | null; error?: string }> {
  const imageBuffer = Buffer.from(imageData, "base64");
  const assetTypeId = clothingType === "Pants" ? 12 : 11;

  const endpoints = [
    {
      name: "itemconfiguration",
      fn: async () => {
        const boundary = `----WebKitFormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
        const crlf = "\r\n";

        const configJson = JSON.stringify({
          assetType: clothingType === "Pants" ? "ClassicPants" : "ClassicShirt",
          displayName: name,
          description: description || "Uploaded via Limited.Ink",
          creationContext: { creator: { groupId } },
        });

        const parts: Buffer[] = [];
        parts.push(Buffer.from(
          `--${boundary}${crlf}` +
          `Content-Disposition: form-data; name="config"; filename="config.json"${crlf}` +
          `Content-Type: application/json${crlf}${crlf}` +
          configJson + crlf, "utf8"
        ));
        parts.push(Buffer.from(
          `--${boundary}${crlf}` +
          `Content-Disposition: form-data; name="fileContent"; filename="clothing.png"${crlf}` +
          `Content-Type: image/png${crlf}${crlf}`, "utf8"
        ));
        parts.push(imageBuffer);
        parts.push(Buffer.from(`${crlf}--${boundary}--${crlf}`, "utf8"));

        const body = Buffer.concat(parts);

        const resp = await fetch("https://itemconfiguration.roblox.com/v1/avatar-assets/upload", {
          method: "POST",
          headers: {
            Cookie: `.ROBLOSECURITY=${cookie}`,
            "X-CSRF-TOKEN": csrfToken,
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          body,
        });

        if (resp.ok) {
          const data = await resp.json() as { assetId?: number; id?: number };
          return data.assetId || data.id || null;
        }
        const text = await resp.text();
        console.log(`[Upload] itemconfiguration status=${resp.status} body=${text.slice(0, 500)}`);
        return null;
      },
    },
    {
      name: "data.roblox.com",
      fn: async () => {
        const typeName = clothingType === "Pants" ? "Pants" : "Shirt";
        const url = `https://data.roblox.com/Data/Upload.ashx?json=1&type=${typeName}&groupId=${groupId}&name=${encodeURIComponent(name)}&description=${encodeURIComponent(description || "Uploaded via Limited.Ink")}&isOwnCreation=true`;
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            Cookie: `.ROBLOSECURITY=${cookie}`,
            "X-CSRF-TOKEN": csrfToken,
            "Content-Type": "application/octet-stream",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          body: imageBuffer,
        });
        if (resp.ok) {
          const text = await resp.text();
          const match = text.match(/(\d{8,})/);
          return match ? parseInt(match[1], 10) : null;
        }
        const text = await resp.text();
        console.log(`[Upload] data.roblox.com status=${resp.status} body=${text.slice(0, 500)}`);
        return null;
      },
    },
    {
      name: "item.ashx",
      fn: async () => {
        const boundary = `----FormBoundary${Date.now()}`;
        const crlf = "\r\n";

        const parts: Buffer[] = [];
        const fields: Record<string, string> = {
          name,
          description: description || "Uploaded via Limited.Ink",
          assetTypeId: String(assetTypeId),
          groupId: String(groupId),
          isOwnCreation: "True",
        };

        for (const [key, val] of Object.entries(fields)) {
          parts.push(Buffer.from(
            `--${boundary}${crlf}` +
            `Content-Disposition: form-data; name="${key}"${crlf}${crlf}` +
            val + crlf, "utf8"
          ));
        }

        parts.push(Buffer.from(
          `--${boundary}${crlf}` +
          `Content-Disposition: form-data; name="file"; filename="clothing.png"${crlf}` +
          `Content-Type: image/png${crlf}${crlf}`, "utf8"
        ));
        parts.push(imageBuffer);
        parts.push(Buffer.from(`${crlf}--${boundary}--${crlf}`, "utf8"));

        const body = Buffer.concat(parts);

        const resp = await fetch("https://www.roblox.com/build/upload", {
          method: "POST",
          headers: {
            Cookie: `.ROBLOSECURITY=${cookie}`,
            "X-CSRF-TOKEN": csrfToken,
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          body,
        });

        if (resp.ok) {
          const text = await resp.text();
          const match = text.match(/(\d{8,})/);
          return match ? parseInt(match[1], 10) : null;
        }
        const text = await resp.text();
        console.log(`[Upload] build/upload status=${resp.status} body=${text.slice(0, 500)}`);
        return null;
      },
    },
  ];

  for (const ep of endpoints) {
    try {
      console.log(`[Upload] Trying ${ep.name}...`);
      const result = await ep.fn();
      if (result) {
        console.log(`[Upload] Success via ${ep.name}: assetId=${result}`);
        return { assetId: result };
      }
    } catch (err) {
      console.error(`[Upload] ${ep.name} error:`, err instanceof Error ? err.message : err);
    }
  }

  return { assetId: null, error: "All upload methods failed. Please check your Roblox session." };
}

router.post("/clothing/upload", async (req, res): Promise<void> => {
  const altIndex: number | null = typeof req.body.altIndex === "number" ? req.body.altIndex : null;

  let cookie: string | undefined;
  if (altIndex !== null) {
    const alts = req.session.altAccounts || [];
    if (!alts[altIndex]) {
      res.status(404).json({ error: "Alt account not found." });
      return;
    }
    cookie = alts[altIndex].cookie;
  } else {
    cookie = req.session.robloxCookie;
  }

  if (!cookie) {
    res.status(401).json({ error: "No active Roblox session. Please sign in again." });
    return;
  }

  const csrfToken = await getRobloxCsrf(cookie);
  if (!csrfToken) {
    res.status(401).json({ error: "Failed to get Roblox CSRF token. Please check your cookie." });
    return;
  }

  const rawItems = req.body.items;

  if (rawItems && Array.isArray(rawItems) && rawItems.length > 0) {
    const results: Array<{ name: string; assetId: number | null; status: string; error?: string }> = [];

    for (let idx = 0; idx < rawItems.length; idx++) {
      const item = rawItems[idx];
      if (!item || typeof item.imageData !== "string" || !item.imageData || typeof item.clothingType !== "string") {
        results.push({ name: item?.name || `Item ${idx}`, assetId: null, status: "failed", error: "Missing required fields (imageData, clothingType)" });
        continue;
      }
      const itemGroupId = typeof item.groupId === "number" ? item.groupId : parseInt(String(item.groupId), 10);
      if (isNaN(itemGroupId)) {
        results.push({ name: item.name || `Item ${idx}`, assetId: null, status: "failed", error: "Invalid groupId" });
        continue;
      }

      try {
        const result = await uploadSingleClothing(
          cookie, csrfToken, itemGroupId, String(item.name || "Clothing").trim(),
          String(item.description || ""), item.imageData, item.clothingType
        );
        results.push({
          name: item.name || `Item ${idx}`,
          assetId: result.assetId,
          status: result.assetId ? "uploaded" : "failed",
          error: result.error,
        });
      } catch (err) {
        results.push({
          name: item.name || `Item ${idx}`,
          assetId: null,
          status: "failed",
          error: err instanceof Error ? err.message : "Unexpected error",
        });
      }

      if (idx < rawItems.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    res.json({
      results,
      uploaded: results.filter(r => r.assetId).length,
      failed: results.filter(r => !r.assetId).length,
      uploadedWith: altIndex !== null ? `alt_${altIndex}` : "main",
    });
    return;
  }

  const parsed = UploadClothingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { groupId, name, description, imageData, clothingType } = parsed.data;

  const result = await uploadSingleClothing(cookie, csrfToken, groupId, name, description || "", imageData, clothingType);

  if (result.assetId) {
    res.json({
      assetId: result.assetId,
      name,
      status: "uploaded",
      uploadedWith: altIndex !== null ? `alt_${altIndex}` : "main",
    });
  } else {
    res.status(500).json({
      error: result.error || "Upload failed. Please try again.",
      name,
      status: "failed",
    });
  }
});

export default router;
