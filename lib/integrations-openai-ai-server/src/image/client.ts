import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";

if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_BASE_URL must be set. Did you forget to provision the OpenAI AI integration?",
  );
}

if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_API_KEY must be set. Did you forget to provision the OpenAI AI integration?",
  );
}

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function generateImageBuffer(
  prompt: string,
  size: "1024x1024" | "512x512" | "256x256" = "1024x1024",
  background: "transparent" | "opaque" | "auto" = "transparent"
): Promise<Buffer> {
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size,
    // @ts-ignore — background is supported by gpt-image-1 but may not be in older SDK types
    background,
  });
  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string
): Promise<Buffer> {
  const images = await Promise.all(
    imageFiles.map((file) =>
      toFile(fs.createReadStream(file), file, {
        type: "image/png",
      })
    )
  );

  const response = await openai.images.edit({
    model: "gpt-image-1",
    image: images,
    prompt,
  });

  const imageBase64 = response.data?.[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}

/**
 * Edit/generate an image using in-memory buffers as references.
 * Accepts base64-encoded PNG strings. When imageBase64s is empty,
 * falls back to text-only generation.
 *
 * @param maskBase64 — optional PNG mask (alpha=0 = area to paint, alpha=255 = preserve).
 *   When provided it is sent as the `mask` parameter to images.edit so the model
 *   can ONLY generate content inside the transparent areas of the mask.
 */
export async function editImageBuffers(
  imageBase64s: string[],
  prompt: string,
  size: "1024x1024" | "1536x1024" | "1024x1536" = "1024x1024",
  maskBase64?: string
): Promise<Buffer> {
  if (imageBase64s.length === 0) {
    return generateImageBuffer(prompt, size, "transparent");
  }

  const images = await Promise.all(
    imageBase64s.map((b64, i) =>
      toFile(Buffer.from(b64, "base64"), `image_${i}.png`, { type: "image/png" })
    )
  );

  const editParams: Record<string, unknown> = {
    model: "gpt-image-1",
    image: images,
    prompt,
    size,
    background: "transparent",
  };

  if (maskBase64) {
    editParams.mask = await toFile(
      Buffer.from(maskBase64, "base64"),
      "mask.png",
      { type: "image/png" }
    );
  }

  // @ts-ignore — background + mask supported by gpt-image-1
  const response = await openai.images.edit(editParams);

  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}
