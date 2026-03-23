import { useState, useRef, useEffect, useCallback } from "react";
import { getAuthCredentials } from "@workspace/api-client-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageCache } from "@/contexts/PageCacheContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Loader2, User, Sparkles, Trash2, ImageIcon, MessageSquare, Download, Paperclip, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Message {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  attachedImage?: string;
}

function useSuggestions() {
  const { t } = useLanguage();
  return [
    t("assistant.sug1"), t("assistant.sug2"), t("assistant.sug3"),
    t("assistant.sug4"), t("assistant.sug5"), t("assistant.sug6"),
  ];
}

function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, li) => {
        if (line.startsWith("### ")) {
          return <div key={li} className="text-sm font-bold mt-2 mb-1">{formatInline(line.slice(4))}</div>;
        }
        if (line.startsWith("## ")) {
          return <div key={li} className="text-base font-bold mt-3 mb-1">{formatInline(line.slice(3))}</div>;
        }
        if (line.startsWith("# ")) {
          return <div key={li} className="text-lg font-bold mt-3 mb-1">{formatInline(line.slice(2))}</div>;
        }
        return <span key={li}>{li > 0 && "\n"}{formatInline(line)}</span>;
      })}
    </>
  );
}

function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`([\s\S]*)$/);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(...parseBoldItalic(codeMatch[1], key)); key += 10;
      parts.push(<code key={key++} className="bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono">{codeMatch[2]}</code>);
      remaining = codeMatch[3];
      continue;
    }
    parts.push(...parseBoldItalic(remaining, key));
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function parseBoldItalic(text: string, baseKey: number): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = baseKey;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*([\s\S]*)$/);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(<strong key={key++} className="font-bold">{boldMatch[2]}</strong>);
      remaining = boldMatch[3];
      continue;
    }
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*([\s\S]*)$/);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
      parts.push(<em key={key++}>{italicMatch[2]}</em>);
      remaining = italicMatch[3];
      continue;
    }
    if (remaining) parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return parts;
}

export default function Assistant() {
  const { t } = useLanguage();
  const suggestions = useSuggestions();
  const cache = usePageCache();
  const [messages, setMessages] = useState<Message[]>(() => cache.get<Message[]>("assistant_messages") || []);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState<"chat" | "image">("chat");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<Message[]>(messages);
  const scrollPosRef = useRef<number | null>(null);
  const prevMsgCountRef = useRef(messages.length);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesRef.current = messages;
    if (messages.length > 0) {
      cache.set("assistant_messages", messages);
    } else {
      cache.set("assistant_messages", null);
    }
  }, [messages]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const wrapper = container.closest(".block, .hidden");
    if (!wrapper) return;

    const observer = new MutationObserver(() => {
      const isNowVisible = wrapper.classList.contains("block");
      if (isNowVisible && scrollRef.current && scrollPosRef.current !== null) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollPosRef.current!;
            }
          });
        });
      }
    });

    observer.observe(wrapper, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      scrollPosRef.current = el.scrollTop;
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const isNewMessage = messages.length > prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;

    if (isNewMessage || (messages.length > 0 && scrollPosRef.current === null)) {
      el.scrollTop = el.scrollHeight;
      scrollPosRef.current = el.scrollTop;
    }
  }, [messages]);

  const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const generateImage = useCallback(async (prompt: string) => {
    const userMsg: Message = { role: "user", content: `🖼 ${prompt}` };
    setMessages(prev => {
      const updated = [...prev, userMsg];
      return [...updated, { role: "assistant" as const, content: t("assistant.generating") || "Generating image..." }];
    });
    setInput("");
    setIsStreaming(true);

    try {
      const { token, fingerprint } = getAuthCredentials();
      const hdrs: Record<string, string> = { "Content-Type": "application/json" };
      if (token) hdrs["Authorization"] = `Bearer ${token}`;
      if (fingerprint) hdrs["X-Device-Fingerprint"] = fingerprint;

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 130000);

      let resp: Response;
      try {
        resp = await fetch(`${BASE}/api/assistant/generate-image`, {
          method: "POST",
          credentials: "include",
          headers: hdrs,
          body: JSON.stringify({ prompt }),
          signal: ac.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: t("assistant.failed") }));
        throw new Error(errData.error || t("assistant.failedGenerate"));
      }

      const data = await resp.json() as { b64_json: string };
      const imageUrl = `data:image/png;base64,${data.b64_json}`;

      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "", imageUrl };
        return updated;
      });
    } catch (ex: any) {
      const msg = ex?.name === "AbortError" ? t("assistant.timeout") : (ex instanceof Error ? ex.message : t("assistant.error"));
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: msg };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [t]);

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text || input).trim();
    if (isStreaming) return;
    if (!content && !attachedImage) return;

    if (mode === "image") {
      if (!content) return;
      return generateImage(content);
    }

    const currentImage = attachedImage;
    const userMsg: Message = { role: "user", content, attachedImage: currentImage || undefined };

    const apiMessages = [
      ...messagesRef.current.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.attachedImage ? { imageBase64: m.attachedImage } : {}),
      })),
      { role: "user" as const, content, ...(currentImage ? { imageBase64: currentImage } : {}) },
    ];

    setMessages(prev => [...prev, userMsg, { role: "assistant" as const, content: "" }]);
    setInput("");
    setAttachedImage(null);
    setIsStreaming(true);

    try {
      const { token, fingerprint } = getAuthCredentials();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;

      const resp = await fetch(`${BASE}/api/assistant/chat`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: t("assistant.serverError") }));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error(t("assistant.noStream"));

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
              const fc = fullContent;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: fc };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error && err.message !== "Failed to fetch" ? err.message : t("assistant.error");
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: errMsg };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, attachedImage, mode, generateImage, t]);

  const clearChat = useCallback(() => {
    setMessages([]);
    cache.set("assistant_messages", null);
  }, [cache]);

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      <div className="p-6 pb-0 border-b border-border/50">
        <div className="flex items-center gap-3 pb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{t("assistant.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("assistant.desc")}</p>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={clearChat}>
              <Trash2 className="w-4 h-4 mr-1" /> {t("assistant.clear")}
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
              <h2 className="text-lg font-bold mb-1">{t("assistant.askAnything")}</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                {t("assistant.capabilities")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
              {suggestions.map((s, i) => (
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
                  {msg.attachedImage && (
                    <img src={msg.attachedImage} alt="Attached" className="rounded-lg max-w-[200px] max-h-[150px] object-cover mb-2" />
                  )}
                  {msg.imageUrl ? (
                    <div className="space-y-2">
                      <img src={msg.imageUrl} alt="Generated" className="rounded-xl max-w-full" />
                      <a href={msg.imageUrl} download="generated-image.png" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                        <Download className="w-3 h-3" /> {t("assistant.downloadImage") || "Download"}
                      </a>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{msg.content ? <FormattedText text={msg.content} /> : (isStreaming && i === messages.length - 1 ? <Loader2 className="w-4 h-4 animate-spin" /> : "")}</div>
                  )}
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

      <div className="p-4 border-t border-border/50 bg-card/50 space-y-2">
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={mode === "chat" ? "default" : "outline"}
            className="rounded-lg text-xs gap-1.5 h-7"
            onClick={() => setMode("chat")}
          >
            <MessageSquare className="w-3 h-3" /> {t("assistant.chatMode") || "Chat"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "image" ? "default" : "outline"}
            className="rounded-lg text-xs gap-1.5 h-7"
            onClick={() => setMode("image")}
          >
            <ImageIcon className="w-3 h-3" /> {t("assistant.imageMode") || "Image"}
          </Button>
        </div>
        {attachedImage && (
          <div className="flex items-center gap-2 px-1">
            <div className="relative">
              <img src={attachedImage} alt="Attached" className="h-12 w-12 rounded-lg object-cover border border-border" />
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <span className="text-xs text-muted-foreground">{t("assistant.imageAttached") || "Image attached"}</span>
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageAttach}
          />
          {mode === "chat" && (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl h-11 w-11 p-0 shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
            >
              <Paperclip className="w-4 h-4" />
            </Button>
          )}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === "image" ? (t("assistant.imagePlaceholder") || "Describe the image...") : t("assistant.placeholder")}
            className="min-h-[44px] max-h-[120px] resize-none rounded-xl text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
          />
          <Button type="submit" disabled={(!input.trim() && !attachedImage) || isStreaming} className="rounded-xl h-11 w-11 p-0 shrink-0">
            {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "image" ? <ImageIcon className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
