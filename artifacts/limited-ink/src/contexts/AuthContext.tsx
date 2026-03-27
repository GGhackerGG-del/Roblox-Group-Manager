import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { checkLicenseStatus, setAuthCredentials, getAuthCredentials } from "@workspace/api-client-react";
import type { RobloxProfile, LicenseStatusResponse } from "@workspace/api-client-react";
import { getDeviceFingerprint } from "@/lib/fingerprint";
import { encryptToken, decryptToken, clearToken } from "@/lib/encrypted-storage";
import { toast } from "@/hooks/use-toast";

const PROFILE_STORAGE_KEY = "limitedink_profile";
const DEVICE_FP_STORAGE_KEY = "limitedink_device_fp";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AuthContextType {
  licenseToken: string | null;
  licenseDetails: LicenseStatusResponse | null;
  profile: RobloxProfile | null;
  isLoading: boolean;
  loginLicense: (token: string) => Promise<void>;
  loginRoblox: (profile: RobloxProfile) => void;
  logoutRoblox: () => Promise<void>;
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
        localStorage.setItem(DEVICE_FP_STORAGE_KEY, fingerprint);

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

        const storedProfileRaw = localStorage.getItem(PROFILE_STORAGE_KEY);
        if (storedProfileRaw) {
          try {
            const storedProfile = JSON.parse(storedProfileRaw) as RobloxProfile;
            if (mounted) setProfile(storedProfile);
          } catch {
            localStorage.removeItem(PROFILE_STORAGE_KEY);
          }
        }

        if (!localStorage.getItem(PROFILE_STORAGE_KEY) && activeToken && mounted) {
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
                localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(prof));
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
    localStorage.setItem(DEVICE_FP_STORAGE_KEY, fingerprint);
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
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(prof));
    setProfile(prof);
  }, []);

  const logoutRoblox = useCallback(async () => {
    const { token, fingerprint: fp } = getAuthCredentials();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (fp) headers["X-Device-Fingerprint"] = fp;
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    setProfile(null);
    try {
      await fetch(`${BASE}/api/roblox/session`, { method: "DELETE", credentials: "include", headers });
    } catch {}
    toast({ title: "Disconnected", description: "Roblox session ended." });
  }, []);

  const logoutLicense = useCallback(async () => {
    const { token, fingerprint: fp } = getAuthCredentials();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (fp) headers["X-Device-Fingerprint"] = fp;
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    setProfile(null);
    clearToken();
    setAuthCredentials(null, null);
    localStorage.removeItem(DEVICE_FP_STORAGE_KEY);
    setLicenseToken(null);
    setLicenseDetails(null);
    try {
      await fetch(`${BASE}/api/roblox/session`, { method: "DELETE", credentials: "include", headers });
    } catch {}
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
