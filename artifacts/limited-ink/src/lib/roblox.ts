export function robloxHeadshot(userId: number | string, _size: number = 150): string {
  if (!userId || userId === 0 || userId === "0") return "";
  const base = (import.meta.env.VITE_API_URL || import.meta.env.BASE_URL || "").replace(/\/$/, "");
  return `${base}/api/quality/roblox-headshot/${userId}`;
}
