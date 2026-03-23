export function robloxHeadshot(userId: number | string, _size: number = 150): string {
  if (!userId || userId === 0 || userId === "0") return "";
  const base = import.meta.env.VITE_API_URL || "";
  return `${base}/api/quality/roblox-headshot/${userId}`;
}
