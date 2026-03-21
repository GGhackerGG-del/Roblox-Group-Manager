import { createContext, useContext, useRef, useCallback, type ReactNode } from "react";

type CacheStore = Record<string, { data: unknown; ts: number }>;
const TTL = 10 * 60 * 1000;

interface PageCacheApi {
  get: <T>(key: string) => T | null;
  set: (key: string, data: unknown) => void;
  clear: (key: string) => void;
}

const PageCacheContext = createContext<PageCacheApi>({
  get: () => null,
  set: () => {},
  clear: () => {},
});

export function PageCacheProvider({ children }: { children: ReactNode }) {
  const store = useRef<CacheStore>({});

  const get = useCallback(<T,>(key: string): T | null => {
    const entry = store.current[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > TTL) {
      delete store.current[key];
      return null;
    }
    return entry.data as T;
  }, []);

  const set = useCallback((key: string, data: unknown) => {
    store.current[key] = { data, ts: Date.now() };
  }, []);

  const clear = useCallback((key: string) => {
    delete store.current[key];
  }, []);

  return (
    <PageCacheContext.Provider value={{ get, set, clear }}>
      {children}
    </PageCacheContext.Provider>
  );
}

export function usePageCache() {
  return useContext(PageCacheContext);
}
