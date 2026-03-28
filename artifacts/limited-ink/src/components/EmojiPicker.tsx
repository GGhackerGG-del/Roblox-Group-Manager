import { useState, useRef, useEffect } from "react";
import { Smile } from "lucide-react";

const EMOJI_CATEGORIES: { name: string; icon: string; emojis: string[] }[] = [
  {
    name: "Smileys",
    icon: "😀",
    emojis: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃",
      "😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙",
      "🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫",
      "🤔","🫡","🤐","🤨","😐","😑","😶","🫥","😏","😒",
      "🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒",
      "🤕","🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳",
      "🥸","😎","🤓","🧐","😕","🫤","😟","🙁","😮","😯",
      "😲","😳","🥺","🥹","😦","😧","😨","😰","😥","😢",
      "😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤",
      "😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹",
    ],
  },
  {
    name: "Gestures",
    icon: "👋",
    emojis: [
      "👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴","👌",
      "🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉",
      "👆","🖕","👇","☝️","🫵","👍","👎","✊","👊","🤛",
      "🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","✍️","💅",
      "🤳","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠",
      "🫀","🫁","🦷","🦴","👀","👁️","👅","👄","🫦","💋",
    ],
  },
  {
    name: "Hearts",
    icon: "❤️",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔",
      "❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝",
      "💟","♥️","🫶","💌","💐","🌹","🥀","💍","💎","✨",
    ],
  },
  {
    name: "Animals",
    icon: "🐶",
    emojis: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨",
      "🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐒",
      "🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗",
      "🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪲",
      "🐍","🐢","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀",
      "🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆",
    ],
  },
  {
    name: "Food",
    icon: "🍕",
    emojis: [
      "🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈",
      "🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦",
      "🌶️","🫑","🥒","🥬","🧄","🧅","🥔","🍠","🥐","🥯",
      "🍞","🥖","🧀","🥚","🍳","🥞","🧇","🥓","🥩","🍗",
      "🍖","🌭","🍔","🍟","🍕","🫓","🥪","🌮","🌯","🫔",
      "🥙","🧆","🥘","🍝","🍜","🍲","🍛","🍣","🍱","🥟",
    ],
  },
  {
    name: "Objects",
    icon: "⚽",
    emojis: [
      "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱",
      "🎮","🕹️","🎯","🎲","🧩","🎭","🎨","🎬","🎤","🎧",
      "🎵","🎶","🎹","🥁","🎷","🎺","🎸","🪗","💻","⌨️",
      "🖥️","📱","📞","📷","📸","📹","🎥","📺","🔮","💡",
      "🔦","🕯️","📚","📖","✏️","📝","💰","💵","💸","🏆",
      "🥇","🥈","🥉","🎖️","🏅","🎗️","🎪","🎢","🎡","🎠",
    ],
  },
  {
    name: "Symbols",
    icon: "💯",
    emojis: [
      "💯","🔥","⭐","🌟","✨","⚡","💥","💫","🎉","🎊",
      "🎈","🎀","🎁","🏷️","💬","💭","🗯️","💢","💤","💮",
      "♻️","🔰","📛","⚠️","🚫","❌","⭕","🛑","❗","❓",
      "‼️","⁉️","🔅","🔆","✅","☑️","✔️","❎","➕","➖",
      "➗","✖️","🟰","♾️","💲","💱","©️","®️","™️","🔝",
    ],
  },
  {
    name: "Flags",
    icon: "🏁",
    emojis: [
      "🏳️","🏴","🏁","🚩","🏳️‍🌈","🏳️‍⚧️","🇷🇺","🇺🇸","🇬🇧","🇩🇪",
      "🇫🇷","🇪🇸","🇮🇹","🇯🇵","🇰🇷","🇨🇳","🇧🇷","🇮🇳","🇨🇦","🇦🇺",
      "🇲🇽","🇹🇷","🇺🇦","🇵🇱","🇳🇱","🇧🇪","🇸🇪","🇳🇴","🇫🇮","🇩🇰",
    ],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export default function EmojiPicker({ onSelect, disabled }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setActiveCategory(0);
    }
  }, [open]);

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
  };

  const filteredEmojis = search.trim()
    ? EMOJI_CATEGORIES.flatMap(c => c.emojis)
    : EMOJI_CATEGORIES[activeCategory]?.emojis || [];

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-40 shrink-0"
        title="Emoji"
      >
        <Smile className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 z-[100] w-[320px] bg-[#1e1f22] rounded-xl border border-white/10 shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-white/5">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="w-full h-8 px-3 rounded-lg bg-[#2b2d31] text-sm text-white placeholder:text-white/30 outline-none border-none"
              autoFocus
            />
          </div>

          {!search.trim() && (
            <div className="flex gap-0.5 p-1.5 border-b border-white/5 overflow-x-auto scrollbar-hide">
              {EMOJI_CATEGORIES.map((cat, i) => (
                <button
                  key={cat.name}
                  onClick={() => setActiveCategory(i)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 transition-colors ${
                    activeCategory === i ? "bg-[#5865f2]/30" : "hover:bg-white/5"
                  }`}
                  title={cat.name}
                >
                  {cat.icon}
                </button>
              ))}
            </div>
          )}

          <div className="h-[220px] overflow-y-auto p-2">
            {!search.trim() && (
              <div className="text-[10px] text-white/30 uppercase tracking-wider px-1 pb-1.5 font-medium">
                {EMOJI_CATEGORIES[activeCategory]?.name}
              </div>
            )}
            <div className="grid grid-cols-8 gap-0.5">
              {filteredEmojis.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  onClick={() => handleSelect(emoji)}
                  className="w-[36px] h-[36px] rounded-md flex items-center justify-center text-xl hover:bg-white/10 transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
            {search.trim() && filteredEmojis.length === 0 && (
              <div className="text-center text-white/30 text-sm py-8">Ничего не найдено</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
