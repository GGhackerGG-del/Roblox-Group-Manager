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

export default router;
