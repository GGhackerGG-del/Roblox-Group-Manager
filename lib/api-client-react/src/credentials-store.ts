let _token: string | null = null;
let _fingerprint: string | null = null;

export function setAuthCredentials(token: string | null, fingerprint: string | null): void {
  _token = token;
  _fingerprint = fingerprint;
}

export function getAuthCredentials(): { token: string | null; fingerprint: string | null } {
  return { token: _token, fingerprint: _fingerprint };
}
