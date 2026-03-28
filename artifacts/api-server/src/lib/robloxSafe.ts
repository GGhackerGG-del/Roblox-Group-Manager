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

export async function verifyRobloxCookie(cookie: string): Promise<boolean> {
  try {
    const resp = await fetch("https://users.roblox.com/v1/users/authenticated", {
      headers: robloxHeaders(cookie),
    });
    return resp.ok;
  } catch {
    return true;
  }
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

  const isValid = await verifyRobloxCookie(cookie);
  if (!isValid) {
    delete req.session.robloxCookie;
    delete req.session.robloxProfile;
    delete (req.session as any).robloxUserId;
    return true;
  }
  return false;
}
