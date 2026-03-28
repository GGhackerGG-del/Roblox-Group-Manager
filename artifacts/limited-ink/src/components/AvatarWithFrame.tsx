import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { robloxHeadshot } from "@/lib/roblox";

export interface FrameDefinition {
  id: string;
  style: React.CSSProperties;
  className: string;
  overlay?: React.ReactNode;
  innerClassName?: string;
}

export const AVATAR_FRAMES: Record<string, FrameDefinition> = {
  none: {
    id: "none",
    style: {},
    className: "",
  },
  golden_crown: {
    id: "golden_crown",
    style: {
      background: "linear-gradient(135deg, #f6d365, #fda085, #f6d365)",
      padding: "3px",
    },
    className: "shadow-[0_0_15px_rgba(246,211,101,0.5)]",
  },
  sakura: {
    id: "sakura",
    style: {
      background: "linear-gradient(135deg, #fbc2eb, #f8b4d9, #fbc2eb, #fda4af)",
      padding: "3px",
    },
    className: "shadow-[0_0_16px_rgba(251,194,235,0.5)]",
  },
  ice_crystal: {
    id: "ice_crystal",
    style: {
      background: "linear-gradient(135deg, #89f7fe, #66a6ff, #89f7fe)",
      padding: "3px",
    },
    className: "shadow-[0_0_16px_rgba(137,247,254,0.4)]",
  },
  fire_blaze: {
    id: "fire_blaze",
    style: {
      background: "linear-gradient(135deg, #f83600, #fe8c00, #f83600)",
      padding: "3px",
    },
    className: "shadow-[0_0_18px_rgba(248,54,0,0.5)] animate-pulse",
  },
  neon_green: {
    id: "neon_green",
    style: {
      background: "linear-gradient(135deg, #00f260, #0575e6, #00f260)",
      padding: "3px",
    },
    className: "shadow-[0_0_16px_rgba(0,242,96,0.4)]",
  },
  purple_galaxy: {
    id: "purple_galaxy",
    style: {
      background: "linear-gradient(135deg, #7f00ff, #e100ff, #7f00ff)",
      padding: "3px",
    },
    className: "shadow-[0_0_18px_rgba(127,0,255,0.4)]",
  },
  rainbow: {
    id: "rainbow",
    style: {
      background: "conic-gradient(from 0deg, #ff0000, #ff8800, #ffff00, #00ff00, #0088ff, #8800ff, #ff0000)",
      padding: "3px",
    },
    className: "shadow-[0_0_14px_rgba(255,136,0,0.3)]",
  },
  rose_garden: {
    id: "rose_garden",
    style: {
      background: "linear-gradient(135deg, #ee0979, #ff6a00, #ee0979)",
      padding: "3px",
    },
    className: "shadow-[0_0_14px_rgba(238,9,121,0.4)]",
  },
  silver_steel: {
    id: "silver_steel",
    style: {
      background: "linear-gradient(135deg, #bdc3c7, #ffffff, #bdc3c7, #95a5a6)",
      padding: "3px",
    },
    className: "shadow-[0_0_12px_rgba(189,195,199,0.5)]",
  },
  midnight_blue: {
    id: "midnight_blue",
    style: {
      background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e, #0f0c29)",
      padding: "3px",
    },
    className: "shadow-[0_0_14px_rgba(48,43,99,0.5)]",
  },
  emerald: {
    id: "emerald",
    style: {
      background: "linear-gradient(135deg, #11998e, #38ef7d, #11998e)",
      padding: "3px",
    },
    className: "shadow-[0_0_16px_rgba(56,239,125,0.35)]",
  },
  blood_red: {
    id: "blood_red",
    style: {
      background: "linear-gradient(135deg, #8e0000, #cc0000, #8e0000)",
      padding: "3px",
    },
    className: "shadow-[0_0_14px_rgba(204,0,0,0.4)]",
  },
  pastel_dream: {
    id: "pastel_dream",
    style: {
      background: "linear-gradient(135deg, #a8edea, #fed6e3, #d4fc79, #a8edea)",
      padding: "3px",
    },
    className: "shadow-[0_0_12px_rgba(168,237,234,0.4)]",
  },
  sunset: {
    id: "sunset",
    style: {
      background: "linear-gradient(135deg, #fc466b, #3f5efb, #fc466b)",
      padding: "3px",
    },
    className: "shadow-[0_0_16px_rgba(252,70,107,0.35)]",
  },
  diamond: {
    id: "diamond",
    style: {
      background: "linear-gradient(135deg, #b8cbb8, #e0c3fc, #b8cbb8, #bbd2c5)",
      padding: "4px",
    },
    className: "shadow-[0_0_20px_rgba(224,195,252,0.5)]",
  },
  toxic: {
    id: "toxic",
    style: {
      background: "linear-gradient(135deg, #56ab2f, #a8e063, #56ab2f)",
      padding: "3px",
    },
    className: "shadow-[0_0_16px_rgba(168,224,99,0.4)] animate-pulse",
  },
};

export const FRAME_NAMES: Record<string, Record<string, string>> = {
  none: { en: "None", ru: "Без рамки", es: "Ninguno" },
  golden_crown: { en: "Golden Crown", ru: "Золотая корона", es: "Corona dorada" },
  sakura: { en: "Sakura Blossom", ru: "Цветок сакуры", es: "Flor de Sakura" },
  ice_crystal: { en: "Ice Crystal", ru: "Ледяной кристалл", es: "Cristal de hielo" },
  fire_blaze: { en: "Fire Blaze", ru: "Огненное пламя", es: "Llama de fuego" },
  neon_green: { en: "Neon Matrix", ru: "Неоновая матрица", es: "Matriz neón" },
  purple_galaxy: { en: "Galaxy Storm", ru: "Галактический шторм", es: "Tormenta galáctica" },
  rainbow: { en: "Rainbow Aura", ru: "Радужная аура", es: "Aura arcoíris" },
  rose_garden: { en: "Rose Garden", ru: "Розовый сад", es: "Jardín de rosas" },
  silver_steel: { en: "Silver Steel", ru: "Серебряная сталь", es: "Acero plateado" },
  midnight_blue: { en: "Midnight Shadow", ru: "Полуночная тень", es: "Sombra nocturna" },
  emerald: { en: "Emerald Glow", ru: "Изумрудное сияние", es: "Brillo esmeralda" },
  blood_red: { en: "Crimson Wrath", ru: "Багровый гнев", es: "Ira carmesí" },
  pastel_dream: { en: "Pastel Dream", ru: "Пастельная мечта", es: "Sueño pastel" },
  sunset: { en: "Sunset Vibes", ru: "Закатные вибрации", es: "Vibras del atardecer" },
  diamond: { en: "Diamond Prestige", ru: "Алмазный престиж", es: "Prestigio diamante" },
  toxic: { en: "Toxic Glow", ru: "Токсичное сияние", es: "Brillo tóxico" },
};

export const FRAME_RARITIES: Record<string, string> = {
  none: "common",
  golden_crown: "legendary",
  sakura: "epic",
  ice_crystal: "rare",
  fire_blaze: "legendary",
  neon_green: "rare",
  purple_galaxy: "epic",
  rainbow: "legendary",
  rose_garden: "epic",
  silver_steel: "common",
  midnight_blue: "rare",
  emerald: "rare",
  blood_red: "epic",
  pastel_dream: "common",
  sunset: "rare",
  diamond: "legendary",
  toxic: "epic",
};

interface AvatarWithFrameProps {
  src?: string | null;
  robloxId?: number;
  fallbackText?: string;
  frameId?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | number;
  className?: string;
}

const SIZE_MAP: Record<string, { outer: string; avatar: string; text: string }> = {
  xs: { outer: "w-6 h-6", avatar: "w-full h-full", text: "text-[8px]" },
  sm: { outer: "w-8 h-8", avatar: "w-full h-full", text: "text-[10px]" },
  md: { outer: "w-10 h-10", avatar: "w-full h-full", text: "text-xs" },
  lg: { outer: "w-14 h-14", avatar: "w-full h-full", text: "text-sm" },
  xl: { outer: "w-20 h-20", avatar: "w-full h-full", text: "text-xl" },
};

export default function AvatarWithFrame({
  src,
  robloxId,
  fallbackText = "U",
  frameId = "none",
  size = "md",
  className = "",
}: AvatarWithFrameProps) {
  const frame = AVATAR_FRAMES[frameId] || AVATAR_FRAMES.none;
  const isNumeric = typeof size === "number";
  const sizeClasses = isNumeric ? null : SIZE_MAP[size] || SIZE_MAP.md;
  const pxStyle = isNumeric ? { width: size, height: size } : undefined;
  const textClass = isNumeric ? (size <= 24 ? "text-[8px]" : size <= 32 ? "text-[10px]" : size <= 48 ? "text-xs" : "text-sm") : sizeClasses!.text;
  const imgSrc = src || (robloxId ? robloxHeadshot(robloxId) : undefined);

  if (frameId === "none" || !AVATAR_FRAMES[frameId]) {
    return (
      <Avatar className={`${sizeClasses?.outer || ""} border border-border ${className}`} style={pxStyle}>
        {imgSrc && <AvatarImage src={imgSrc} />}
        <AvatarFallback className={`${textClass} font-bold bg-secondary`}>
          {fallbackText}
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <div
      className={`${sizeClasses?.outer || ""} rounded-full shrink-0 ${frame.className} ${className}`}
      style={{ ...frame.style, ...pxStyle }}
    >
      <Avatar className="w-full h-full rounded-full border-2 border-background">
        {imgSrc && <AvatarImage src={imgSrc} className="rounded-full" />}
        <AvatarFallback className={`${textClass} font-bold bg-secondary rounded-full`}>
          {fallbackText}
        </AvatarFallback>
      </Avatar>
    </div>
  );
}
