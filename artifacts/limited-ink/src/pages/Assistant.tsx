import { useState, useRef, useEffect } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Loader2, User, Sparkles, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Напиши Lua скрипт для выдачи одежды за вход в игру",
  "Составь пост для Discord о новой коллекции",
  "Почему модерация удалила мою одежду?",
  "Как увеличить продажи одежды в Roblox?",
  "Какую цену поставить на новую футболку?",
  "Напиши описание для одежды в стиле streetwear",
];

export default function Assistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text?: string) {
    const content = (text || input).trim();
    if (!content || isStreaming) return;

    const userMsg: Message = { role: "user", content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMsg]);

    try {
      const { token, fingerprint } = getAuthCredentials();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;

      const resp = await fetch(`${BASE}/api/assistant/chat`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!resp.ok) throw new Error("Failed to get response");

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.done) break;
            if (data.content) {
              fullContent += data.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: fullContent };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "An error occurred. Please try again." };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 pb-0 border-b border-border/50">
        <div className="flex items-center gap-3 pb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">AI Assistant</h1>
            <p className="text-xs text-muted-foreground">Roblox expert at your service</p>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => setMessages([])}>
              <Trash2 className="w-4 h-4 mr-1" /> Clear
            </Button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="w-16 h-16 bg-gradient-to-br from-violet-500/10 to-purple-600/10 rounded-2xl flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-violet-500" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold mb-1">Ask me anything about Roblox</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Lua scripts, moderation policies, clothing strategies, Discord posts — I can help with it all.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  className="text-left text-xs p-3 rounded-xl border border-border/60 hover:bg-secondary/50 hover:border-border transition-all text-muted-foreground hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-black text-white rounded-br-md"
                    : "bg-secondary/70 border border-border/50 rounded-bl-md"
                }`}>
                  <div className="whitespace-pre-wrap break-words">{msg.content || (isStreaming && i === messages.length - 1 ? <Loader2 className="w-4 h-4 animate-spin" /> : "")}</div>
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-white" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <div className="p-4 border-t border-border/50 bg-card/50">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about Roblox..."
            className="min-h-[44px] max-h-[120px] resize-none rounded-xl text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
          />
          <Button type="submit" disabled={!input.trim() || isStreaming} className="rounded-xl h-11 w-11 p-0 shrink-0">
            {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
