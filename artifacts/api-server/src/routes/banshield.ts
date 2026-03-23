import { Router, type IRouter } from "express";
import OpenAI from "openai";

const router: IRouter = Router();

function getOpenAI(): OpenAI {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) {
    throw new Error("OpenAI AI integration not configured.");
  }
  return new OpenAI({ apiKey, baseURL });
}

const MODERATION_PROMPT = `You are a Roblox content moderation expert. Analyze the following clothing item details for potential policy violations.

Roblox prohibits:
- Sexual or suggestive content
- Violence, gore, or weapons
- Drug or alcohol references
- Hate speech, discrimination, or offensive symbols
- Copyrighted material (brand logos, character likenesses)
- Gambling references
- Personal information
- Scams or misleading content
- Profanity or inappropriate language (including in other languages)

Respond in JSON format only:
{
  "riskScore": <number 0-100>,
  "riskLevel": "low" | "medium" | "high" | "critical",
  "issues": [{"type": "string", "description": "string", "severity": "warning" | "danger"}],
  "suggestion": "string with improvement suggestion or 'Content appears safe' if no issues",
  "safeName": "suggested safe alternative name if original is risky, otherwise null",
  "safeDescription": "suggested safe alternative description if original is risky, otherwise null"
}`;

router.post("/banshield/analyze", async (req, res): Promise<void> => {
  const { name, description, clothingType } = req.body as {
    name?: string;
    description?: string;
    clothingType?: string;
  };

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  try {
    const openai = getOpenAI();

    const userContent = `Analyze this Roblox clothing item:
Name: "${name}"
Description: "${description || "No description"}"
Type: ${clothingType || "Shirt"}

Check for potential moderation violations and rate the risk.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: MODERATION_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";

    try {
      const analysis = JSON.parse(content);
      res.json(analysis);
    } catch {
      res.json({
        riskScore: 0,
        riskLevel: "low",
        issues: [],
        suggestion: "Content appears safe",
        safeName: null,
        safeDescription: null,
      });
    }
  } catch (err) {
    console.error("[BanShield] Analysis error:", err);
    res.status(500).json({ error: "Failed to analyze content." });
  }
});

const IMAGE_MODERATION_PROMPT = `You are a strict Roblox content moderation AI that analyzes IMAGES for policy violations.

You must carefully examine the image for:
1. **Text content**: ANY text, words, letters, numbers visible in the image. Read them carefully in ALL languages (English, Russian, Spanish, Chinese, etc.)
2. **Offensive symbols**: Nazi/fascist symbols (swastikas, SS runes, iron crosses), hate group logos, Confederate flags, extremist symbols
3. **Sexual/suggestive content**: Nudity, sexual poses, suggestive imagery, revealing clothing designs
4. **Violence/gore**: Blood, weapons, violent scenes, graphic injury depictions
5. **Drug/alcohol references**: Drug paraphernalia, cannabis leaves, pills, bottles
6. **Copyrighted material**: Brand logos (Nike, Adidas, Supreme, etc.), character likenesses (Disney, anime, etc.)
7. **Profanity**: Swear words, slurs, offensive language in ANY language
8. **Gambling references**: Cards, dice, slot machines, betting imagery
9. **Inappropriate for children**: Anything not suitable for Roblox's young audience

IMPORTANT: Be STRICT. If you see ANY problematic content, flag it. Roblox will ban accounts for policy violations.

Respond ONLY in valid JSON:
{
  "riskScore": <number 0-100, where 0=safe, 100=guaranteed ban>,
  "riskLevel": "low" | "medium" | "high" | "critical",
  "issues": [
    {
      "type": "<category: text|symbol|sexual|violence|drugs|copyright|profanity|gambling|other>",
      "description": "<what was detected and why it's problematic>",
      "severity": "warning" | "danger"
    }
  ],
  "detectedText": "<any text/words found in the image, or null if none>",
  "suggestion": "<actionable advice for the user>"
}`;

router.post("/banshield/analyze-image", async (req, res): Promise<void> => {
  const { imageBase64 } = req.body as { imageBase64?: string };

  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  if (imageBase64.length > 10 * 1024 * 1024) {
    res.status(400).json({ error: "Image too large (max ~7MB)" });
    return;
  }

  try {
    const openai = getOpenAI();

    let imgUrl = imageBase64;
    if (!imgUrl.startsWith("data:")) {
      imgUrl = `data:image/png;base64,${imgUrl}`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: IMAGE_MODERATION_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this Roblox clothing texture image for moderation risks. Carefully examine ALL visual content including any text, symbols, patterns, and imagery. Be thorough and strict.",
            },
            {
              type: "image_url",
              image_url: { url: imgUrl },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    console.log("[BanShield] Image analysis result:", content);

    try {
      const analysis = JSON.parse(content);
      res.json(analysis);
    } catch {
      res.json({
        riskScore: 0,
        riskLevel: "low",
        issues: [],
        detectedText: null,
        suggestion: "Could not parse analysis result.",
      });
    }
  } catch (err) {
    console.error("[BanShield] Image analysis error:", err);
    res.status(500).json({ error: "Failed to analyze image." });
  }
});

export default router;
