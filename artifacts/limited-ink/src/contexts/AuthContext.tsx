import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { checkLicenseStatus, setAuthCredentials, getAuthCredentials } from "@workspace/api-client-react";
import type { RobloxProfile, LicenseStatusResponse } from "@workspace/api-client-react";
import { getDeviceFingerprint } from "@/lib/fingerprint";
import { encryptToken, decryptToken, clearToken } from "@/lib/encrypted-storage";
import { toast } from "@/hooks/use-toast";

const PROFILE_SESSION_KEY = "limitedink_profile";
const DEVICE_FP_SESSION_KEY = "limitedink_device_fp";

interface AuthContextType {
  licenseToken: string | null;
  licenseDetails: LicenseStatusResponse | null;
  profile: RobloxProfile | null;
  isLoading: boolean;
  loginLicense: (token: string) => Promise<void>;
  loginRoblox: (profile: RobloxProfile) => void;
  logoutRoblox: () => void;
  logoutLicense: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [licenseToken, setLicenseToken] = useState<string | null>(null);
  const [licenseDetails, setLicenseDetails] = useState<LicenseStatusResponse | null>(null);
  const [profile, setProfile] = useState<RobloxProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const fingerprint = await getDeviceFingerprint();
        sessionStorage.setItem(DEVICE_FP_SESSION_KEY, fingerprint);

        const storedToken = await decryptToken(fingerprint);
        let activeToken: string | null = null;
        if (storedToken) {
          try {
            setAuthCredentials(storedToken, fingerprint);
            const status = await checkLicenseStatus({ token: storedToken, deviceFingerprint: fingerprint });
            if (status.valid && mounted) {
              setLicenseToken(storedToken);
              setLicenseDetails(status);
              activeToken = storedToken;
            } else {
              clearToken();
              setAuthCredentials(null, null);
            }
          } catch {
            clearToken();
            setAuthCredentials(null, null);
          }
        }

        // Try to restore profile from sessionStorage first (fast path)
        const storedProfileRaw = sessionStorage.getItem(PROFILE_SESSION_KEY);
        if (storedProfileRaw) {
          try {
            const storedProfile = JSON.parse(storedProfileRaw) as RobloxProfile;
            if (mounted) setProfile(storedProfile);
          } catch {
            sessionStorage.removeItem(PROFILE_SESSION_KEY);
          }
        }

        // If no profile in sessionStorage but we have a valid license, check if the
        // server still has a Roblox session (persists across page refreshes via PostgreSQL).
        // This avoids asking users to re-enter their Roblox cookie on every page load.
        if (!sessionStorage.getItem(PROFILE_SESSION_KEY) && activeToken && mounted) {
          try {
            const resp = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/roblox/me`, {
              credentials: "include",
              headers: {
                "Authorization": `Bearer ${activeToken}`,
                "X-Device-Fingerprint": fingerprint,
              },
            });
            if (resp.ok) {
              const prof = await resp.json() as RobloxProfile;
              if (mounted) {
                sessionStorage.setItem(PROFILE_SESSION_KEY, JSON.stringify(prof));
                setProfile(prof);
              }
            }
          } catch {
            // no server session — user will need to log in
          }
        }
      } catch {
        // ignore init errors
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    init();
    return () => { mounted = false; };
  }, []);

  const loginLicense = useCallback(async (token: string) => {
    const fingerprint = await getDeviceFingerprint();
    sessionStorage.setItem(DEVICE_FP_SESSION_KEY, fingerprint);
    await encryptToken(token, fingerprint);
    setAuthCredentials(token, fingerprint);
    setLicenseToken(token);
    try {
      const status = await checkLicenseStatus({ token, deviceFingerprint: fingerprint });
      setLicenseDetails(status);
    } catch {
      // ignore
    }
  }, []);

  const loginRoblox = useCallback((prof: RobloxProfile) => {
    sessionStorage.setItem(PROFILE_SESSION_KEY, JSON.stringify(prof));
    setProfile(prof);
  }, []);

  const logoutRoblox = useCallback(() => {
    const { token, fingerprint: fp } = getAuthCredentials();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (fp) headers["X-Device-Fingerprint"] = fp;
    fetch("/api/roblox/session", { method: "DELETE", credentials: "include", headers }).catch(() => {});
    sessionStorage.removeItem(PROFILE_SESSION_KEY);
    setProfile(null);
    toast({ title: "Disconnected", description: "Roblox session ended." });
  }, []);

  const logoutLicense = useCallback(() => {
    const { token, fingerprint: fp } = getAuthCredentials();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (fp) headers["X-Device-Fingerprint"] = fp;
    clearToken();
    setAuthCredentials(null, null);
    sessionStorage.removeItem(DEVICE_FP_SESSION_KEY);
    setLicenseToken(null);
    setLicenseDetails(null);
    fetch("/api/roblox/session", { method: "DELETE", credentials: "include", headers }).catch(() => {});
    sessionStorage.removeItem(PROFILE_SESSION_KEY);
    setProfile(null);
    toast({ title: "License revoked", description: "You have been fully signed out." });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        licenseToken,
        licenseDetails,
        profile,
        isLoading,
        loginLicense,
        loginRoblox,
        logoutRoblox,
        logoutLicense,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
