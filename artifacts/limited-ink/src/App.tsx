import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
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

function Router() {
  return (
    <Switch>
      <Route path="/">
        <RequireAuth>
          <DashboardLayout>
            <Home />
          </DashboardLayout>
        </RequireAuth>
      </Route>
      <Route path="/profile">
        <RequireAuth>
          <DashboardLayout>
            <Profile />
          </DashboardLayout>
        </RequireAuth>
      </Route>
      <Route path="/community">
        <RequireAuth>
          <DashboardLayout>
            <Community />
          </DashboardLayout>
        </RequireAuth>
      </Route>
      <Route path="/settings">
        <RequireAuth>
          <DashboardLayout>
            <Settings />
          </DashboardLayout>
        </RequireAuth>
      </Route>
      <Route path="/group/:id">
        {(params) => (
          <RequireAuth>
            <DashboardLayout>
              <GroupView id={params.id} />
            </DashboardLayout>
          </RequireAuth>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
