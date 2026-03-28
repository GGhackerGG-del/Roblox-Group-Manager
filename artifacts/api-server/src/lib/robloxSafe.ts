import type { Request, Response } from "express";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export function robloxHeaders(cookie: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Cookie: `.ROBLOSECURITY=${cookie}`,
    "User-Agent": UA,
    Accept: "application/json",
    Referer: "https://www.roblox.com/",
    Origin: "https://www.roblox.com",
    ...extra,
  };
}

export async function verifyRobloxCookie(cookie: string): Promise<"valid" | "dead" | "unknown"> {
  const attempt = async (): Promise<"valid" | "dead" | "unknown"> => {
    try {
      const resp = await fetch("https://users.roblox.com/v1/users/authenticated", {
        headers: robloxHeaders(cookie),
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) return "valid";
      if (resp.status === 401) return "dead";
      return "unknown";
    } catch {
      return "unknown";
    }
  };

  const delays = [0, 2000, 3000];
  let lastResult: "valid" | "dead" | "unknown" = "unknown";
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await new Promise(r => setTimeout(r, delays[i]));
    lastResult = await attempt();
    if (lastResult === "valid") return "valid";
  }
  return lastResult;
}

export async function safeRobloxFetch(
  url: string,
  cookie: string,
  options: RequestInit = {},
  retries = 1,
): Promise<Response & { __robloxAuthDead?: boolean }> {
  const doFetch = () =>
    fetch(url, {
      ...options,
      redirect: "follow",
      headers: {
        ...robloxHeaders(cookie),
        ...(options.headers as Record<string, string> || {}),
      },
    });

  let resp = await doFetch();

  if ((resp.status === 401 || resp.status === 403) && retries > 0) {
    await new Promise(r => setTimeout(r, 1000));
    resp = await doFetch();
  }

  if (resp.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    resp = await doFetch();
    if (resp.status === 429) {
      await new Promise(r => setTimeout(r, 4000));
      resp = await doFetch();
    }
  }

  return resp;
}

export function mapRobloxError(
  robloxStatus: number,
  defaultMessage = "Roblox API error",
): { status: number; error: string } {
  if (robloxStatus === 429) {
    return { status: 429, error: "Roblox rate limit. Please try again in a few seconds." };
  }
  if (robloxStatus === 401 || robloxStatus === 403) {
    return { status: 502, error: "Roblox API returned an authentication error. Please try again." };
  }
  if (robloxStatus >= 500) {
    return { status: 502, error: "Roblox servers are experiencing issues. Please try again later." };
  }
  return { status: 502, error: `${defaultMessage} (${robloxStatus})` };
}

export async function clearSessionIfCookieDead(req: Request): Promise<boolean> {
  const cookie = req.session.robloxCookie;
  if (!cookie) return true;

  const result = await verifyRobloxCookie(cookie);
  if (result === "dead") {
    console.log("[Session] Cookie confirmed dead after 3 retries, clearing session");
    delete req.session.robloxCookie;
    delete req.session.robloxProfile;
    delete (req.session as any).robloxUserId;
    return true;
  }
  if (result === "unknown") {
    console.log("[Session] Cookie verification inconclusive (network issue?), keeping session intact");
  } else {
    console.log("[Session] Cookie still valid after re-check, keeping session intact");
  }
  return false;
}
