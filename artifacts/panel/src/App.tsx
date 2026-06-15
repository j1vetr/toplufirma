import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { SirketProvider } from "@/contexts/sirket-context";
import Dashboard from "@/pages/dashboard";
import Sirketler from "@/pages/sirketler";
import Cariler from "@/pages/cariler";
import CariDetay from "@/pages/cari-detay";
import Gemiler from "@/pages/gemiler";
import GemiDetay from "@/pages/gemi-detay";
import BankaHesaplari from "@/pages/banka-hesaplari";
import BankaHesabiDetay from "@/pages/banka-hesabi-detay";
import Faturalar from "@/pages/faturalar";
import FaturaYeni from "@/pages/fatura-yeni";
import FaturaDetay from "@/pages/fatura-detay";
import Odemeler from "@/pages/odemeler";
import StarlinkPlanlari from "@/pages/starlink-planlari";
import Ekipmanlar from "@/pages/ekipmanlar";
import Tanimlar from "@/pages/tanimlar";
import Raporlar from "@/pages/raporlar";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/">
          <Redirect to="/dashboard" />
        </Route>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/sirketler" component={Sirketler} />
        <Route path="/cariler" component={Cariler} />
        <Route path="/cariler/:id" component={CariDetay} />
        <Route path="/gemiler" component={Gemiler} />
        <Route path="/gemiler/:id" component={GemiDetay} />
        <Route path="/banka-hesaplari" component={BankaHesaplari} />
        <Route path="/banka-hesaplari/:id" component={BankaHesabiDetay} />
        <Route path="/faturalar/yeni" component={FaturaYeni} />
        <Route path="/faturalar/:id" component={FaturaDetay} />
        <Route path="/faturalar" component={Faturalar} />
        <Route path="/odemeler" component={Odemeler} />
        <Route path="/starlink-planlari" component={StarlinkPlanlari} />
        <Route path="/ekipmanlar" component={Ekipmanlar} />
        <Route path="/tanimlar" component={Tanimlar} />
        <Route path="/raporlar" component={Raporlar} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SirketProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </SirketProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
