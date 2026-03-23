import { useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PageCacheProvider } from "@/contexts/PageCacheContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { Loader2 } from "lucide-react";

import NotFound from "@/pages/not-found";
import Activation from "@/pages/Activation";
import RobloxLogin from "@/pages/RobloxLogin";
import DashboardLayout from "@/pages/DashboardLayout";
import Home from "@/pages/Home";
import GroupView from "@/pages/GroupView";
import Profile from "@/pages/Profile";
import Community from "@/pages/Community";
import Settings from "@/pages/Settings";
import Assistant from "@/pages/Assistant";
import Competitors from "@/pages/Competitors";
import Sniper from "@/pages/Sniper";
import Automation from "@/pages/Automation";
import AITools from "@/pages/AITools";
import Security from "@/pages/Security";
import Marketing from "@/pages/Marketing";
import GameManager from "@/pages/GameManager";
import SocialMedia from "@/pages/SocialMedia";
import Finance from "@/pages/Finance";
import ContentPlanner from "@/pages/ContentPlanner";
import Gamification from "@/pages/Gamification";
import Integrations from "@/pages/Integrations";


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppLoader() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="flex flex-col items-center space-y-4">
        <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center animate-pulse">
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        </div>
        <p className="text-sm font-semibold tracking-widest uppercase text-muted-foreground animate-pulse">Initializing</p>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoading, licenseToken, licenseDetails, profile } = useAuth();

  if (isLoading) {
    return <AppLoader />;
  }

  if (!licenseToken || !licenseDetails?.valid) {
    return <Activation />;
  }

  if (!profile) {
    return <RobloxLogin />;
  }

  return <>{children}</>;
}

const STATIC_PAGES = [
  { path: "/", key: "home" },
  { path: "/profile", key: "profile" },
  { path: "/community", key: "community" },
  { path: "/settings", key: "settings" },
  { path: "/assistant", key: "assistant" },
  { path: "/competitors", key: "competitors" },
  { path: "/sniper", key: "sniper" },
  { path: "/automation", key: "automation" },
  { path: "/ai-tools", key: "ai-tools" },
  { path: "/security", key: "security" },
  { path: "/marketing", key: "marketing" },
];

function PersistentPages() {
  const [location] = useLocation();

  const groupMatch = location.match(/^\/group\/(\d+)/);
  const groupId = groupMatch ? groupMatch[1] : null;

  const isStaticPage = STATIC_PAGES.some(p => p.path === location);
  const isGroupPage = !!groupId;
  const isKnownPage = isStaticPage || isGroupPage;

  if (!isKnownPage) {
    return <NotFound />;
  }

  return (
    <DashboardLayout>
      <div className={location === "/" ? "block" : "hidden"}><Home /></div>
      <div className={location === "/profile" ? "block" : "hidden"}><Profile /></div>
      <div className={location === "/community" ? "block" : "hidden"}><Community /></div>
      <div className={location === "/settings" ? "block" : "hidden"}><Settings /></div>
      <div className={`${location === "/assistant" ? "block" : "hidden"} h-full`}><Assistant /></div>
      <div className={location === "/competitors" ? "block" : "hidden"}><Competitors /></div>
      <div className={location === "/sniper" ? "block" : "hidden"}><Sniper /></div>
      <div className={location === "/automation" ? "block" : "hidden"}><Automation /></div>
      <div className={location === "/ai-tools" ? "block" : "hidden"}><AITools /></div>
      <div className={location === "/security" ? "block" : "hidden"}><Security /></div>
      <div className={location === "/marketing" ? "block" : "hidden"}><Marketing /></div>
      <div className={location === "/game-manager" ? "block" : "hidden"}><GameManager /></div>
      <div className={location === "/social-media" ? "block" : "hidden"}><SocialMedia /></div>
      <div className={location === "/finance" ? "block" : "hidden"}><Finance /></div>
      <div className={location === "/content-planner" ? "block" : "hidden"}><ContentPlanner /></div>
      <div className={location === "/gamification" ? "block" : "hidden"}><Gamification /></div>
      <div className={location === "/integrations" ? "block" : "hidden"}><Integrations /></div>
      {isGroupPage && <GroupView id={groupId!} />}
    </DashboardLayout>
  );
}

function Router() {
  return (
    <RequireAuth>
      <PersistentPages />
    </RequireAuth>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <AuthProvider>
            <PageCacheProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
            </PageCacheProvider>
          </AuthProvider>
        </LanguageProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
