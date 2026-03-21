/**
 * Generates a unique, stable device fingerprint.
 * Uses screen details, timezone, and user agent, hashed via SubtleCrypto.
 */
export async function getDeviceFingerprint(): Promise<string> {
  const components = [
    navigator.userAgent,
    window.screen.width,
    window.screen.height,
    window.screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language
  ];

  const rawString = components.join('||');
  const encoder = new TextEncoder();
  const data = encoder.encode(rawString);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}
