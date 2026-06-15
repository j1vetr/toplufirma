import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Building2, 
  Ship, 
  Landmark, 
  FileText, 
  Wallet, 
  HardDrive, 
  Settings, 
  PieChart,
  ChevronDown,
  LogOut,
  UserCog,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSirket } from "@/contexts/sirket-context";
import { useListFirmalar, getListFirmalarQueryKey } from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { KullaniciInfo } from "@/App";

const navigation = [
  { name: "Ana Sayfa", href: "/dashboard", icon: LayoutDashboard },
  { name: "Firmalar", href: "/firmalar", icon: Building2 },
  { name: "Gemiler", href: "/gemiler", icon: Ship },
  { name: "Banka Hesapları", href: "/banka-hesaplari", icon: Landmark },
  { name: "Faturalar", href: "/faturalar", icon: FileText },
  { name: "Ödemeler", href: "/odemeler", icon: Wallet },
  { name: "Ekipmanlar", href: "/ekipmanlar", icon: HardDrive },
  { name: "Raporlar", href: "/raporlar", icon: PieChart },
  { name: "Tanımlar", href: "/tanimlar", icon: Settings },
];

interface LayoutProps {
  children: React.ReactNode;
  kullanici: KullaniciInfo | null;
  onLogout: () => void;
}

export function Layout({ children, kullanici, onLogout }: LayoutProps) {
  const [location] = useLocation();
  const { aktifSirketId, setAktifSirketId, aktifSirketAd } = useSirket();
  const { data: firmalar = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );

  const isYonetici = kullanici?.rol === "yonetici";

  const allNav = isYonetici
    ? [...navigation, { name: "Kullanıcılar", href: "/kullanicilar", icon: UserCog }]
    : navigation;

  const currentPage =
    allNav.find(n => n.href === location || (location === "/" && n.href === "/dashboard"))?.name || "Panel";

  const initials = kullanici?.ad
    ? kullanici.ad.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <div className="w-64 border-r bg-sidebar hidden md:flex flex-col">
        <div className="h-16 flex items-center px-6 border-b shrink-0">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold mr-3 shadow-md">
            M
          </div>
          <span className="font-display font-bold text-lg tracking-wide">Muhasebe</span>
        </div>

        <div className="px-3 py-3 border-b shrink-0">
          <p className="text-xs text-muted-foreground px-2 mb-1.5 font-medium uppercase tracking-wider">Aktif Firma</p>
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-sidebar-accent hover:bg-sidebar-accent/80 text-sm font-medium transition-colors" data-testid="sirket-secici">
              <span className="truncate">{aktifSirketAd}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem
                onClick={() => setAktifSirketId(null)}
                className={cn("cursor-pointer", aktifSirketId === null && "font-semibold text-primary")}
                data-testid="sirket-secici-tum"
              >
                Tüm Firmalar
              </DropdownMenuItem>
              {firmalar.length > 0 && <DropdownMenuSeparator />}
              {firmalar.map(f => (
                <DropdownMenuItem
                  key={f.id}
                  onClick={() => setAktifSirketId(f.id)}
                  className={cn("cursor-pointer", aktifSirketId === f.id && "font-semibold text-primary")}
                  data-testid={`sirket-secici-${f.id}`}
                >
                  {f.ad}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {allNav.map((item) => {
              const isActive = location === item.href || (location === "/" && item.href === "/dashboard");
              return (
                <li key={item.name}>
                  <Link href={item.href} className={cn(
                    "flex items-center px-3 py-2.5 rounded-full text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-sm" 
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}>
                    <item.icon className={cn("mr-3 h-5 w-5", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t px-3 py-3 shrink-0">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{kullanici?.ad}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {isYonetici && <ShieldCheck className="h-3 w-3 text-primary" />}
                {kullanici?.rol === "yonetici" ? "Yönetici" : kullanici?.rol === "muhasebeci" ? "Muhasebeci" : "Salt Okunur"}
              </p>
            </div>
            <button
              onClick={onLogout}
              title="Çıkış yap"
              className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 border-b bg-background flex items-center justify-between px-8 z-10 shrink-0">
          <div>
            <h1 className="text-xl font-display text-foreground hidden md:block">{currentPage}</h1>
            <p className="text-xs text-muted-foreground hidden md:block">{aktifSirketAd}</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 text-sm border rounded-full px-3 py-1.5">
                  <span className="max-w-[120px] truncate">{aktifSirketAd}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setAktifSirketId(null)} className={cn(aktifSirketId === null && "font-semibold text-primary")}>Tüm Firmalar</DropdownMenuItem>
                  {firmalar.map(f => (
                    <DropdownMenuItem key={f.id} onClick={() => setAktifSirketId(f.id)} className={cn(aktifSirketId === f.id && "font-semibold text-primary")}>{f.ad}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary hover:bg-primary/20 transition-colors">
                {initials}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-3 py-2 text-sm">
                  <p className="font-medium">{kullanici?.ad}</p>
                  <p className="text-xs text-muted-foreground">{kullanici?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-destructive cursor-pointer gap-2">
                  <LogOut className="h-4 w-4" /> Çıkış Yap
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-8 bg-background">
          <div className="mx-auto max-w-6xl w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
