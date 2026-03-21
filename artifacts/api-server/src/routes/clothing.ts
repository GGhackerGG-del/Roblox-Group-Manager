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

async function uploadViaOpenCloud(
  apiKey: string,
  groupId: number,
  name: string,
  description: string,
  imageBuffer: Buffer,
  clothingType: string
): Promise<{ assetId: number | null; error?: string }> {
  const boundary = `----OpenCloudBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
  const crlf = "\r\n";

  const configJson = JSON.stringify({
    assetType: clothingType === "Pants" ? "ClassicPants" : "ClassicShirt",
    displayName: name,
    description: description || "Uploaded via Limited.Ink",
    creationContext: {
      creator: { groupId: String(groupId) },
    },
  });

  const parts: Buffer[] = [];
  parts.push(Buffer.from(
    `--${boundary}${crlf}` +
    `Content-Disposition: form-data; name="request"${crlf}` +
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

  console.log(`[Upload] Trying Open Cloud API for group ${groupId}...`);
  const resp = await fetch("https://apis.roblox.com/assets/v1/assets", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (resp.ok) {
    const data = await resp.json() as {
      path?: string;
      assetId?: string;
      response?: { assetId?: string };
      done?: boolean;
    };

    if (data.done && data.response?.assetId) {
      const assetId = parseInt(data.response.assetId, 10);
      if (!isNaN(assetId)) {
        console.log(`[Upload] Open Cloud immediate success: assetId=${assetId}`);
        return { assetId };
      }
    }

    if (data.assetId) {
      const assetId = parseInt(data.assetId, 10);
      if (!isNaN(assetId)) {
        console.log(`[Upload] Open Cloud success: assetId=${assetId}`);
        return { assetId };
      }
    }

    if (data.path && !data.done) {
      console.log(`[Upload] Open Cloud operation pending, polling: ${data.path}`);
      const operationUrl = `https://apis.roblox.com/${data.path}`;
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const pollResp = await fetch(operationUrl, {
            headers: { "x-api-key": apiKey },
          });
          if (pollResp.ok) {
            const pollData = await pollResp.json() as {
              done?: boolean;
              response?: { assetId?: string };
              error?: { message?: string };
            };
            if (pollData.done) {
              if (pollData.response?.assetId) {
                const assetId = parseInt(pollData.response.assetId, 10);
                if (!isNaN(assetId)) {
                  console.log(`[Upload] Open Cloud poll success: assetId=${assetId}`);
                  return { assetId };
                }
              }
              if (pollData.error?.message) {
                console.log(`[Upload] Open Cloud operation failed: ${pollData.error.message}`);
                return { assetId: null, error: `Upload processing failed: ${pollData.error.message}` };
              }
              break;
            }
          }
        } catch (pollErr) {
          console.log(`[Upload] Poll attempt ${attempt + 1} error:`, pollErr instanceof Error ? pollErr.message : pollErr);
        }
      }
    }

    console.log(`[Upload] Open Cloud returned OK but could not resolve asset ID:`, JSON.stringify(data).slice(0, 500));
    return { assetId: null, error: "Upload was accepted but the asset ID could not be resolved. The asset may still be processing on Roblox's side." };
  }

  const text = await resp.text();
  console.log(`[Upload] Open Cloud status=${resp.status} body=${text.slice(0, 500)}`);

  if (resp.status === 401 || resp.status === 403) {
    let detail = "";
    try {
      const errData = JSON.parse(text) as { message?: string; error?: string; code?: string };
      if (errData.message) detail = ` Roblox says: "${errData.message}"`;
      else if (errData.error) detail = ` Roblox says: "${errData.error}"`;
    } catch {}
    return { assetId: null, error: `Open Cloud API key is invalid or lacks permissions (${resp.status}).${detail} Check your API key in Settings and ensure it has "Asset" write permissions for this group.` };
  }
  if (resp.status === 429) {
    return { assetId: null, error: "Roblox rate limit hit. Please wait a moment and try again." };
  }

  let errorMessage = `Open Cloud upload failed (${resp.status})`;
  try {
    const errData = JSON.parse(text) as { message?: string; error?: string };
    if (errData.message) errorMessage += `: ${errData.message}`;
    else if (errData.error) errorMessage += `: ${errData.error}`;
  } catch {}
  return { assetId: null, error: errorMessage };
}

async function releaseAndPriceClothing(
  cookie: string,
  assetId: number,
  price: number
): Promise<void> {
  const salePrice = Math.max(price, 5);

  const csrfToken = await getRobloxCsrf(cookie);
  if (!csrfToken) {
    console.log(`[Upload] Could not get CSRF to publish asset ${assetId}`);
    return;
  }

  console.log(`[Upload] Publishing asset ${assetId} on sale at ${salePrice} R$...`);

  try {
    const resp = await fetch(`https://economy.roblox.com/v1/assets/${assetId}/itemtoggle`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "X-CSRF-TOKEN": csrfToken,
      },
      body: JSON.stringify({
        isForSale: true,
        price: salePrice,
      }),
    });
    if (resp.ok) {
      console.log(`[Upload] Published asset ${assetId} on sale at ${salePrice} R$ via economy/itemtoggle`);
      return;
    }
    const text = await resp.text();
    console.log(`[Upload] economy/itemtoggle failed (${resp.status}): ${text}`);

    if (resp.status === 403) {
      const csrf2 = await getRobloxCsrf(cookie);
      if (csrf2) {
        const retry = await fetch(`https://economy.roblox.com/v1/assets/${assetId}/itemtoggle`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Cookie": `.ROBLOSECURITY=${cookie}`,
            "X-CSRF-TOKEN": csrf2,
          },
          body: JSON.stringify({
            isForSale: true,
            price: salePrice,
          }),
        });
        if (retry.ok) {
          console.log(`[Upload] Published asset ${assetId} on sale at ${salePrice} R$ (CSRF retry)`);
          return;
        }
        const retryText = await retry.text();
        console.log(`[Upload] economy/itemtoggle retry failed (${retry.status}): ${retryText}`);
      }
    }
  } catch (err) {
    console.log(`[Upload] Error publishing asset ${assetId} via economy/itemtoggle:`, err);
  }

  try {
    const csrf3 = await getRobloxCsrf(cookie);
    if (!csrf3) return;

    const resp2 = await fetch(`https://itemconfiguration.roblox.com/v1/assets/${assetId}/update-price`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "X-CSRF-TOKEN": csrf3,
      },
      body: JSON.stringify({
        priceConfiguration: { priceInRobux: salePrice },
      }),
    });
    if (resp2.ok) {
      console.log(`[Upload] Price set to ${salePrice} R$ for asset ${assetId} via update-price`);
      return;
    }
    const text2 = await resp2.text();
    console.log(`[Upload] update-price fallback failed (${resp2.status}): ${text2}`);
  } catch (err) {
    console.log(`[Upload] Error in update-price fallback for asset ${assetId}:`, err);
  }

  try {
    const csrf4 = await getRobloxCsrf(cookie);
    if (!csrf4) return;

    const resp3 = await fetch(`https://itemconfiguration.roblox.com/v1/assets/${assetId}/release`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "X-CSRF-TOKEN": csrf4,
      },
      body: JSON.stringify({
        saleStatus: "OnSale",
        priceConfiguration: { priceInRobux: salePrice },
      }),
    });
    if (resp3.ok) {
      console.log(`[Upload] Released asset ${assetId} via itemconfiguration/release at ${salePrice} R$`);
      return;
    }
    const text3 = await resp3.text();
    console.log(`[Upload] itemconfiguration/release fallback failed (${resp3.status}): ${text3}`);
  } catch (err) {
    console.log(`[Upload] Error in release fallback for asset ${assetId}:`, err);
  }

  console.log(`[Upload] WARNING: Could not publish asset ${assetId} on sale. Manual publish may be required.`);
}

async function uploadViaCookie(
  cookie: string,
  groupId: number,
  name: string,
  description: string,
  imageBuffer: Buffer,
  clothingType: string,
  price?: number
): Promise<{ assetId: number | null; error?: string }> {
  const csrfToken = await getRobloxCsrf(cookie);
  if (!csrfToken) {
    return { assetId: null, error: "Failed to get CSRF token. Your Roblox cookie may be expired — re-login in Settings." };
  }

  const assetType = clothingType === "Pants" ? "Pants" : "Shirt";
  const expectedPrice = Math.max(10, price || 10);
  console.log(`[Upload] Cookie upload via user-auth API: type=${assetType} group=${groupId} name="${name}" price=${price ?? "default"}`);

  const requestData = JSON.stringify({
    displayName: name,
    description: description || "Uploaded via Limited.Ink",
    assetType: assetType,
    creationContext: {
      creator: { groupId: groupId },
      expectedPrice: expectedPrice,
    },
  });

  const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
  const crlf = "\r\n";

  const parts: Buffer[] = [];
  parts.push(Buffer.from(
    `--${boundary}${crlf}` +
    `Content-Disposition: form-data; name="request"${crlf}` +
    `Content-Type: application/json${crlf}${crlf}` +
    requestData + crlf, "utf8"
  ));
  parts.push(Buffer.from(
    `--${boundary}${crlf}` +
    `Content-Disposition: form-data; name="fileContent"; filename="clothing.png"${crlf}` +
    `Content-Type: image/png${crlf}${crlf}`, "utf8"
  ));
  parts.push(imageBuffer);
  parts.push(Buffer.from(`${crlf}--${boundary}--${crlf}`, "utf8"));

  const body = Buffer.concat(parts);
  const uploadUrl = "https://apis.roblox.com/assets/user-auth/v1/assets";

  for (let attempt = 0; attempt < 2; attempt++) {
    const currentCsrf = attempt === 0 ? csrfToken : await getRobloxCsrf(cookie);

    const resp = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "X-CSRF-TOKEN": currentCsrf,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Origin": "https://create.roblox.com",
        "Referer": "https://create.roblox.com/",
      },
      body,
    });

    if (resp.status === 403) {
      const newCsrf = resp.headers.get("x-csrf-token");
      if (newCsrf && attempt === 0) {
        console.log("[Upload] CSRF refreshed, retrying...");
        continue;
      }
      return { assetId: null, error: "Access denied (403). Cookie expired or no permission for this group." };
    }

    const text = await resp.text();

    if (!resp.ok) {
      console.log(`[Upload] user-auth failed: status=${resp.status} body=${text.slice(0, 400)}`);
      if (resp.status === 401) return { assetId: null, error: "Roblox cookie expired. Re-login in Settings." };
      if (resp.status === 429) return { assetId: null, error: "Roblox rate limit. Wait and try again." };
      let errorMsg = `Upload failed (${resp.status})`;
      try {
        const e = JSON.parse(text) as { message?: string; error?: string };
        if (e.message) errorMsg += `: ${e.message}`;
        else if (e.error) errorMsg += `: ${e.error}`;
      } catch {}
      return { assetId: null, error: errorMsg };
    }

    let uploadData: { operationId?: string; done?: boolean; response?: { assetId?: string }; path?: string };
    try { uploadData = JSON.parse(text); } catch {
      console.log(`[Upload] Could not parse response: ${text.slice(0, 200)}`);
      return { assetId: null, error: "Upload returned unparseable response." };
    }

    if (uploadData.done && uploadData.response?.assetId) {
      const assetId = parseInt(uploadData.response.assetId, 10);
      if (!isNaN(assetId)) {
        console.log(`[Upload] Immediate success: assetId=${assetId}`);
        return { assetId };
      }
    }

    const operationId = uploadData.operationId || uploadData.path;
    if (!operationId) {
      console.log(`[Upload] No operationId in response: ${text.slice(0, 300)}`);
      return { assetId: null, error: "Server did not return an operation ID." };
    }

    console.log(`[Upload] Operation created: ${operationId}, polling...`);

    const statusUrlBase = operationId.startsWith("http")
      ? operationId
      : operationId.startsWith("/")
        ? `https://apis.roblox.com${operationId}`
        : `https://apis.roblox.com/assets/user-auth/v1/operations/${operationId}`;

    for (let poll = 0; poll < 30; poll++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const pollResp = await fetch(statusUrlBase, {
          headers: {
            "Cookie": `.ROBLOSECURITY=${cookie}`,
            "X-CSRF-TOKEN": currentCsrf,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        if (pollResp.ok) {
          const pollData = await pollResp.json() as {
            done?: boolean;
            response?: { assetId?: string };
            error?: { message?: string };
          };
          if (pollData.done) {
            if (pollData.response?.assetId) {
              const assetId = parseInt(pollData.response.assetId, 10);
              if (!isNaN(assetId)) {
                console.log(`[Upload] Poll success: assetId=${assetId}`);
                return { assetId };
              }
            }
            if (pollData.error?.message) {
              return { assetId: null, error: `Roblox rejected: ${pollData.error.message}` };
            }
            return { assetId: null, error: "Operation completed but no asset ID returned." };
          }
        }
      } catch (e) {
        console.log(`[Upload] Poll ${poll + 1} error:`, e instanceof Error ? e.message : e);
      }
    }

    return { assetId: null, error: "Upload timed out waiting for Roblox to process the asset." };
  }

  return { assetId: null, error: "Upload failed after retries." };
}

async function uploadSingleClothing(
  cookie: string,
  _csrfToken: string,
  groupId: number,
  name: string,
  description: string,
  imageData: string,
  clothingType: string,
  openCloudApiKey?: string,
  price?: number
): Promise<{ assetId: number | null; error?: string }> {
  const imageBuffer = Buffer.from(imageData, "base64");

  if (cookie) {
    console.log("[Upload] Using cookie-based upload (user-auth API)...");
    const result = await uploadViaCookie(cookie, groupId, name, description, imageBuffer, clothingType, price);
    if (result.assetId) {
      await releaseAndPriceClothing(cookie, result.assetId, price ?? 5);
      return result;
    }
    console.log(`[Upload] Cookie upload failed: ${result.error}`);
    if (openCloudApiKey) {
      console.log("[Upload] Falling back to Open Cloud API...");
      return uploadViaOpenCloud(openCloudApiKey, groupId, name, description, imageBuffer, clothingType);
    }
    return result;
  }

  if (openCloudApiKey) {
    console.log("[Upload] No cookie, using Open Cloud API...");
    return uploadViaOpenCloud(openCloudApiKey, groupId, name, description, imageBuffer, clothingType);
  }

  return {
    assetId: null,
    error: "No upload method available. Please connect your Roblox account in Settings.",
  };
}

router.post("/clothing/upload", async (req, res): Promise<void> => {
  const altIndex: number | null = typeof req.body.altIndex === "number" ? req.body.altIndex : null;
  const openCloudApiKey = req.session.robloxOpenCloudApiKey;

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

  if (!cookie && !openCloudApiKey) {
    res.status(401).json({ error: "No upload method available. Please connect your Roblox account in Settings." });
    return;
  }

  const csrfToken = "";

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
        const itemPrice = typeof item.price === "number" ? item.price : undefined;
        const result = await uploadSingleClothing(
          cookie || "", csrfToken, itemGroupId, String(item.name || "Clothing").trim(),
          String(item.description || ""), item.imageData, item.clothingType,
          openCloudApiKey, itemPrice
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

  const { groupId, name, description, imageData, clothingType, price } = parsed.data;

  const result = await uploadSingleClothing(cookie || "", csrfToken, groupId, name, description || "", imageData, clothingType, openCloudApiKey, price);

  if (result.assetId) {
    res.json({
      assetId: result.assetId,
      name,
      status: "uploaded",
      uploadedWith: altIndex !== null ? `alt_${altIndex}` : "main",
    });
  } else {
    res.status(500).json({
      error: result.error || "Upload failed. Check your Roblox account connection in Settings.",
      name,
      status: "failed",
    });
  }
});

export default router;
