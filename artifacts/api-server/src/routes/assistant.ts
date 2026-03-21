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

const SYSTEM_PROMPT = `You are the Limited.Ink AI Assistant — an expert on Roblox development, clothing creation, group management, UGC, and the Roblox platform.

You help users with:
- Writing Lua scripts for Roblox games
- Creating Discord/social media posts for clothing collections
- Understanding Roblox moderation policies and why items get removed
- Group management strategies to grow membership
- Pricing strategies for clothing items
- UGC creation tips and best practices
- Roblox economy analysis and trading advice

Always respond in the same language the user writes in (Russian or English).
Keep responses concise but thorough. Use code blocks for Lua scripts.
When discussing Roblox policies, cite specific rules when possible.`;

router.post("/assistant/chat", async (req, res): Promise<void> => {
  const { messages } = req.body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  try {
    const openai = getOpenAI();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error("[Assistant] Chat error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to get AI response." });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`);
      res.end();
    }
  }
});

export default router;
