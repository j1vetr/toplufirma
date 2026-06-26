import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { SirketProvider } from "@/contexts/sirket-context";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Firmalar from "@/pages/firmalar";
import Gemiler from "@/pages/gemiler";
import GemiDetay from "@/pages/gemi-detay";
import BankaHesabiDetay from "@/pages/banka-hesabi-detay";
import Faturalar from "@/pages/faturalar";
import FaturaYeni from "@/pages/fatura-yeni";
import FaturaDetay from "@/pages/fatura-detay";
import Odemeler from "@/pages/odemeler";
import Ekipmanlar from "@/pages/ekipmanlar";
import Raporlar from "@/pages/raporlar";
import Kullanicilar from "@/pages/kullanicilar";
import TekrarlayanFaturalar from "@/pages/tekrarlayan-faturalar";
import Teklifler from "@/pages/teklifler";
import Ayarlar from "@/pages/ayarlar";
import GonderiGecmisi from "@/pages/gonderi-gecmisi";
import BagliFirmaDetay from "@/pages/bagli-firma-detay";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export interface KullaniciInfo {
  id: number;
  ad: string;
  email: string;
  rol: string;
  sirketler: Array<{ sirketId: number; rol: string }>;
}

function AuthGuard({
  kullanici,
  onLogout,
  children,
}: {
  kullanici: KullaniciInfo | null;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!kullanici) navigate("/login");
  }, [kullanici]);

  if (!kullanici) return null;
  return (
    <SirketProvider>
      <Layout kullanici={kullanici} onLogout={onLogout}>
        {children}
      </Layout>
    </SirketProvider>
  );
}

function Router({ kullanici, onLogout }: { kullanici: KullaniciInfo | null; onLogout: () => void }) {
  return (
    <Switch>
      <Route path="/login">
        {kullanici ? <Redirect to="/dashboard" /> : null}
      </Route>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/dashboard">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <Dashboard />
        </AuthGuard>
      </Route>
      <Route path="/firmalar/bagli/:id">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <BagliFirmaDetay />
        </AuthGuard>
      </Route>
      <Route path="/firmalar">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <Firmalar />
        </AuthGuard>
      </Route>
      <Route path="/gemiler">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <Gemiler />
        </AuthGuard>
      </Route>
      <Route path="/gemiler/:id">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <GemiDetay />
        </AuthGuard>
      </Route>
      <Route path="/banka-hesaplari">
        <Redirect to="/ayarlar" />
      </Route>
      <Route path="/banka-hesaplari/:id">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <BankaHesabiDetay />
        </AuthGuard>
      </Route>
      <Route path="/faturalar/yeni">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <FaturaYeni />
        </AuthGuard>
      </Route>
      <Route path="/faturalar/:id">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <FaturaDetay />
        </AuthGuard>
      </Route>
      <Route path="/faturalar">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <Faturalar />
        </AuthGuard>
      </Route>
      <Route path="/odemeler">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <Odemeler />
        </AuthGuard>
      </Route>
      <Route path="/ekipmanlar">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <Ekipmanlar />
        </AuthGuard>
      </Route>
      <Route path="/tanimlar">
        <Redirect to="/ayarlar" />
      </Route>
      <Route path="/raporlar">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <Raporlar />
        </AuthGuard>
      </Route>
      <Route path="/kullanicilar">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <Kullanicilar kullanici={kullanici} />
        </AuthGuard>
      </Route>
      <Route path="/tekrarlayan-faturalar">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <TekrarlayanFaturalar />
        </AuthGuard>
      </Route>
      <Route path="/teklifler">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <Teklifler />
        </AuthGuard>
      </Route>
      <Route path="/ayarlar">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <Ayarlar />
        </AuthGuard>
      </Route>
      <Route path="/gonderi-gecmisi">
        <AuthGuard kullanici={kullanici} onLogout={onLogout}>
          <GonderiGecmisi />
        </AuthGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [kullanici, setKullanici] = useState<KullaniciInfo | null>(() => {
    try {
      const saved = localStorage.getItem("panel_kullanici");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  function handleLogin(token: string, k: object) {
    localStorage.setItem("panel_token", token);
    localStorage.setItem("panel_kullanici", JSON.stringify(k));
    setKullanici(k as KullaniciInfo);
    queryClient.clear();
  }

  function handleLogout() {
    localStorage.removeItem("panel_token");
    localStorage.removeItem("panel_kullanici");
    setKullanici(null);
    queryClient.clear();
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          {!kullanici ? (
            <Login onLogin={handleLogin} />
          ) : (
            <Router kullanici={kullanici} onLogout={handleLogout} />
          )}
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
