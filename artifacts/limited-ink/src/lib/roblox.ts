export function robloxHeadshot(userId: number | string, size: number = 150): string {
  return `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=${size}&height=${size}&format=png`;
}
