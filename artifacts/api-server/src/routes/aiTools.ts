import { Router, type IRouter } from "express";
import OpenAI from "openai";

const router: IRouter = Router();

function getOpenAI(): OpenAI {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) throw new Error("OpenAI AI integration not configured.");
  return new OpenAI({ apiKey, baseURL });
}

async function chatJSON<T>(prompt: string, userContent: string): Promise<T> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
  });
  const content = response.choices[0]?.message?.content || "{}";
  return JSON.parse(content) as T;
}

router.post("/ai-tools/description", async (req, res): Promise<void> => {
  try {
    const { name, type, style, colors, mood, language } = req.body as {
      name?: string; type?: string; style?: string;
      colors?: string; mood?: string; language?: string;
    };
    if (!name) { res.status(400).json({ error: "name is required" }); return; }

    const result = await chatJSON<{ description: string; shortDescription: string; tags: string[] }>(
      `You are an expert Roblox clothing copywriter. Generate compelling item descriptions for Roblox UGC clothing.
Always respond in JSON: { "description": "...(150-250 words)", "shortDescription": "...(30-50 words)", "tags": ["tag1", ...10 tags] }
IMPORTANT: Always respond in English. Descriptions, short descriptions, and tags must all be in English.
Be creative, engaging, and use Roblox clothing market language.`,
      `Name: ${name}\nType: ${type || "Shirt"}\nStyle: ${style || "Casual"}\nColors: ${colors || "Mixed"}\nMood: ${mood || "Cool"}`
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "AI error" });
  }
});

router.post("/ai-tools/title", async (req, res): Promise<void> => {
  try {
    const { description, style, type, language } = req.body as {
      description?: string; style?: string; type?: string; language?: string;
    };
    if (!description) { res.status(400).json({ error: "description is required" }); return; }

    const result = await chatJSON<{ titles: string[] }>(
      `You are an expert Roblox clothing title creator. Generate catchy, searchable titles for Roblox UGC clothing.
Return JSON: { "titles": ["title1", ..., "title8"] }
Rules: under 64 chars each, use emojis strategically, mix styles (trendy, descriptive, brand-like).
IMPORTANT: Always respond in English. All titles must be in English.`,
      `Description: ${description}\nStyle: ${style || "Casual"}\nType: ${type || "Shirt"}`
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "AI error" });
  }
});

router.post("/ai-tools/keywords", async (req, res): Promise<void> => {
  try {
    const { name, description, type, language } = req.body as {
      name?: string; description?: string; type?: string; language?: string;
    };
    if (!name && !description) { res.status(400).json({ error: "name or description required" }); return; }

    const result = await chatJSON<{
      primary: string[]; secondary: string[]; longTail: string[]; hashtags: string[];
    }>(
      `You are an SEO expert for Roblox UGC marketplace. Generate keywords to maximize item discoverability.
Return JSON: {
  "primary": [...5 main keywords],
  "secondary": [...10 secondary keywords],
  "longTail": [...5 long-tail search phrases],
  "hashtags": [...8 hashtags without #]
}
IMPORTANT: Always respond in English. All keywords, phrases, and hashtags must be in English.`,
      `Name: ${name || ""}\nDescription: ${description || ""}\nType: ${type || "Shirt"}`
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "AI error" });
  }
});

router.post("/ai-tools/design", async (req, res): Promise<void> => {
  try {
    const { description, style, colors } = req.body as {
      description?: string; style?: string; colors?: string;
    };
    if (!description) { res.status(400).json({ error: "description is required" }); return; }

    const openai = getOpenAI();
    const enhancedPrompt = `Roblox clothing item flat-lay texture design, game asset style.
${description}. Style: ${style || "modern streetwear"}. Colors: ${colors || "varied"}.
Clean flat design, suitable for a Roblox shirt/pants template (585x559 PNG).
No background, no watermark, centered composition, high contrast, pixel-perfect edges.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    let response;
    try {
      response = await openai.images.generate({
        model: "gpt-image-1",
        prompt: enhancedPrompt,
        n: 1,
        size: "1024x1024",
      }, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    const b64 = (response.data?.[0] as any)?.b64_json;
    if (!b64) {
      const rawUrl = response.data?.[0]?.url;
      if (rawUrl) {
        const imgResp = await fetch(rawUrl);
        if (imgResp.ok) {
          const buf = Buffer.from(await imgResp.arrayBuffer());
          res.json({ b64_json: buf.toString("base64") });
          return;
        }
      }
      res.status(502).json({ error: "No image returned from API." });
      return;
    }
    res.json({ b64_json: b64 });
  } catch (e: any) {
    if (e?.name === "AbortError") {
      res.status(504).json({ error: "Image generation timed out." });
      return;
    }
    res.status(500).json({ error: e instanceof Error ? e.message : "AI error" });
  }
});

router.post("/ai-tools/trend", async (req, res): Promise<void> => {
  try {
    const { category, timeframe, language } = req.body as {
      category?: string; timeframe?: string; language?: string;
    };

    const lang = language === "en" ? "English" : "Russian";
    const result = await chatJSON<{
      hotStyles: Array<{ name: string; growth: string; description: string }>;
      risingColors: string[];
      decliningStyles: string[];
      opportunities: string[];
      bestUploadTime: string;
      summary: string;
    }>(
      `You are a Roblox UGC market analyst. Predict current clothing trends on Roblox marketplace based on your knowledge of gaming fashion, youth culture, and Roblox community.
Return JSON: {
  "hotStyles": [{ "name": "...", "growth": "+X%", "description": "..." }, ...5 items],
  "risingColors": ["color1", ...5],
  "decliningStyles": ["style1", ...3],
  "opportunities": ["opportunity1", ...4],
  "bestUploadTime": "...",
  "summary": "...2-3 sentences overall market summary"
}
Style names must always be in English. Respond descriptions/summaries in ${lang}.`,
      `Category: ${category || "All clothing"}\nTimeframe: ${timeframe || "Current season"}`
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "AI error" });
  }
});

router.post("/ai-tools/price", async (req, res): Promise<void> => {
  try {
    const { type, style, rarity, demand, competitorPrices, language } = req.body as {
      type?: string; style?: string; rarity?: string;
      demand?: string; competitorPrices?: string; language?: string;
    };

    const lang = language === "en" ? "English" : "Russian";
    const result = await chatJSON<{
      recommendedPrice: number;
      priceRange: { min: number; max: number };
      strategy: string;
      reasoning: string[];
      proTips: string[];
      expectedSalesPerWeek: string;
    }>(
      `You are a Roblox UGC pricing expert. Recommend optimal Robux pricing for clothing items.
Return JSON: {
  "recommendedPrice": number (in Robux),
  "priceRange": { "min": number, "max": number },
  "strategy": "budget|midrange|premium|luxury",
  "reasoning": ["reason1", ...4 reasons],
  "proTips": ["tip1", ...3 tips],
  "expectedSalesPerWeek": "X-Y sales/week"
}
Respond in ${lang}.`,
      `Type: ${type || "Shirt"}\nStyle: ${style || "Casual"}\nRarity: ${rarity || "Common"}\nDemand: ${demand || "Medium"}\nCompetitor prices: ${competitorPrices || "5-15 Robux typical"}`
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "AI error" });
  }
});

router.post("/ai-tools/chatbot-reply", async (req, res): Promise<void> => {
  try {
    const { post, tone, groupContext, language } = req.body as {
      post?: string; tone?: string; groupContext?: string; language?: string;
    };
    if (!post) { res.status(400).json({ error: "post is required" }); return; }

    const lang = language === "en" ? "English" : "Russian";
    const result = await chatJSON<{
      replies: Array<{ text: string; tone: string }>;
      sentiment: "positive" | "neutral" | "negative" | "question";
      suggestedAction: string;
    }>(
      `You are an AI community manager for a Roblox clothing group. Generate appropriate auto-replies for community posts.
Return JSON: {
  "replies": [
    { "text": "...", "tone": "friendly|professional|casual|promotional" },
    ...3 reply options
  ],
  "sentiment": "positive|neutral|negative|question",
  "suggestedAction": "reply|ignore|escalate|pin"
}
Respond in ${lang}. Keep replies under 200 characters each.`,
      `Post: "${post}"\nTone preference: ${tone || "friendly"}\nGroup context: ${groupContext || "Roblox clothing group"}`
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "AI error" });
  }
});

export default router;
