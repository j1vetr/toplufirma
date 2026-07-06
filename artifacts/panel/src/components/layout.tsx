import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import toovBeyaz from "@assets/toov__beyaz_logo_1782430202251.png";
import {
  LayoutDashboard,
  Building2,
  Ship,
  FileText,
  HardDrive,
  Settings,
  PieChart,
  ChevronDown,
  LogOut,
  UserCog,
  ShieldCheck,
  Search,
  Repeat,
  X,
  Menu,
  Send,
  ClipboardList,
  BookOpen,
  Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSirket } from "@/contexts/sirket-context";
import { useListFirmalar, getListFirmalarQueryKey, useGlobalArama, getGlobalAramaQueryKey } from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { KullaniciInfo } from "@/App";

const navigation = [
  { name: "Ana Sayfa", href: "/dashboard", icon: LayoutDashboard },
  { name: "Firmalar", href: "/firmalar", icon: Building2 },
  { name: "Gemiler", href: "/gemiler", icon: Ship },
  { name: "Faturalar", href: "/faturalar", icon: FileText },
  { name: "Teklifler", href: "/teklifler", icon: FileText },
  { name: "Cariler", href: "/cariler", icon: BookOpen },
  { name: "Ekipmanlar", href: "/ekipmanlar", icon: HardDrive },
  { name: "Servis & Sözleşme", href: "/servis", icon: ClipboardList },
  { name: "Tekrarlayan Faturalar", href: "/tekrarlayan-faturalar", icon: Repeat },
  { name: "Gönderim Geçmişi", href: "/gonderi-gecmisi", icon: Send },
  { name: "Raporlar", href: "/raporlar", icon: PieChart },
  { name: "Ayarlarımız", href: "/ayarlar", icon: Settings },
  { name: "Bağlantı Tanısı", href: "/tani", icon: Stethoscope },
];

interface LayoutProps {
  children: React.ReactNode;
  kullanici: KullaniciInfo | null;
  onLogout: () => void;
}

function GlobalArama() {
  const [q, setQ] = useState("");
  const [aramaQ, setAramaQ] = useState("");
  const [acik, setAcik] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const kutuRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  const aramaParams = { q: aramaQ };
  const { data: sonuclar } = useGlobalArama(
    aramaParams,
    { query: { enabled: aramaQ.length >= 2, queryKey: getGlobalAramaQueryKey(aramaParams) } },
  );

  useEffect(() => {
    const timer = setTimeout(() => { if (q.trim().length >= 2) setAramaQ(q.trim()); else setAramaQ(""); }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (kutuRef.current && !kutuRef.current.contains(e.target as Node)) setAcik(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toplam = (sonuclar?.firmalar?.length ?? 0) + (sonuclar?.gemiler?.length ?? 0) + (sonuclar?.faturalar?.length ?? 0);

  return (
    <div ref={kutuRef} className="relative">
      <div className="relative flex items-center">
        <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={e => { setQ(e.target.value); setAcik(true); }}
          onFocus={() => setAcik(true)}
          placeholder="Ara..."
          className="h-8 w-36 md:w-48 rounded-none border bg-background/60 pl-8 pr-7 text-sm outline-none ring-offset-background focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
        />
        {q && (
          <button onClick={() => { setQ(""); setAramaQ(""); }} className="absolute right-2 text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {acik && aramaQ.length >= 2 && (
        <div className="absolute right-0 top-full mt-1 w-72 md:w-80 rounded-none border bg-popover shadow-lg z-50 overflow-hidden">
          {toplam === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Sonuç bulunamadı.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {(sonuclar?.firmalar?.length ?? 0) > 0 && (
                <div>
                  <p className="px-3 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted/50">Firmalar</p>
                  {sonuclar!.firmalar!.map(f => (
                    <button key={f.id} className="w-full px-4 py-2 text-left text-sm hover:bg-accent transition-colors" onClick={() => { navigate("/firmalar"); setAcik(false); setQ(""); }}>
                      <p className="font-medium">{f.ad}</p>
                      {f.vergiNo && <p className="text-xs text-muted-foreground">VKN: {f.vergiNo}</p>}
                    </button>
                  ))}
                </div>
              )}
              {(sonuclar?.gemiler?.length ?? 0) > 0 && (
                <div>
                  <p className="px-3 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted/50">Gemiler</p>
                  {sonuclar!.gemiler!.map(g => (
                    <button key={g.id} className="w-full px-4 py-2 text-left text-sm hover:bg-accent transition-colors" onClick={() => { navigate(`/gemiler/${g.id}`); setAcik(false); setQ(""); }}>
                      <p className="font-medium">{g.ad}</p>
                      {g.imoNumarasi && <p className="text-xs text-muted-foreground">IMO: {g.imoNumarasi}</p>}
                    </button>
                  ))}
                </div>
              )}
              {(sonuclar?.faturalar?.length ?? 0) > 0 && (
                <div>
                  <p className="px-3 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted/50">Faturalar</p>
                  {sonuclar!.faturalar!.map(f => (
                    <button key={f.id} className="w-full px-4 py-2 text-left text-sm hover:bg-accent transition-colors" onClick={() => { navigate(`/faturalar/${f.id}`); setAcik(false); setQ(""); }}>
                      <p className="font-medium">{f.faturaNo}</p>
                      <p className="text-xs text-muted-foreground">{f.bagliFirmaAd} — {f.faturaTarihi}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NavLinks({ allNav, location, onNavigate }: {
  allNav: typeof navigation;
  location: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-0.5 px-3">
      {allNav.map((item) => {
        const isActive = location === item.href || (location === "/" && item.href === "/dashboard");
        return (
          <li key={item.name}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center px-3 py-2.5 rounded-none text-sm font-medium transition-colors border-l-2",
                isActive
                  ? "bg-primary text-primary-foreground border-l-primary"
                  : "text-sidebar-foreground border-l-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:border-l-primary/50"
              )}
            >
              <item.icon className={cn("mr-3 h-4 w-4 shrink-0", isActive ? "text-primary-foreground" : "text-sidebar-foreground/60")} />
              {item.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Layout({ children, kullanici, onLogout }: LayoutProps) {
  const [location] = useLocation();
  const [menuAcik, setMenuAcik] = useState(false);
  const { aktifSirketId, setAktifSirketId, aktifSirketAd } = useSirket();
  const { data: firmalar = [] } = useListFirmalar(
    { tip: "cati" },
    { query: { queryKey: [...getListFirmalarQueryKey(), "cati"] } },
  );
  const aktifFirma = firmalar.find(f => f.id === aktifSirketId);
  const aktifFirmaEtiket = (aktifFirma as unknown as Record<string, unknown>)?.etiket as string | null | undefined;

  const isYonetici = kullanici?.rol === "yonetici";

  const allNav = isYonetici
    ? [...navigation, { name: "Kullanıcılar", href: "/kullanicilar", icon: UserCog }, { name: "Ayarlar", href: "/ayarlar", icon: ShieldCheck }]
    : navigation;

  const currentPage =
    allNav.find(n => n.href === location || (location === "/" && n.href === "/dashboard"))?.name || "Panel";

  const initials = kullanici?.ad
    ? kullanici.ad.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <div className="flex min-h-screen bg-background text-foreground">

      {/* ── Desktop Sidebar — always dark ── */}
      <div className="w-64 border-r border-sidebar-border bg-sidebar hidden md:flex flex-col">
        {/* Logo */}
        <div className="flex items-center justify-center px-5 py-5 border-b border-sidebar-border shrink-0">
          <img src={toovBeyaz} alt="TOOV" className="w-36 h-auto" />
        </div>

        {/* Firma seçici */}
        <div className="px-3 py-3 border-b border-sidebar-border shrink-0">
          <p className="text-[10px] text-sidebar-foreground/40 px-2 mb-1.5 font-bold uppercase tracking-widest">Aktif Firma</p>
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full flex items-center justify-between px-3 py-2 rounded-none bg-sidebar-accent hover:bg-sidebar-accent/80 text-sm font-medium transition-colors text-sidebar-foreground border border-sidebar-border" data-testid="sirket-secici">
              <span className="truncate text-[13px]">{aktifSirketAd}</span>
              <span className="flex items-center gap-1.5 shrink-0 ml-1.5">
                {aktifFirmaEtiket && (
                  <span className="text-[9px] font-bold bg-[#ffed00] text-black px-1 py-0.5 leading-none whitespace-nowrap">
                    {aktifFirmaEtiket}
                  </span>
                )}
                <ChevronDown className="h-4 w-4 text-sidebar-foreground/40" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem
                onClick={() => setAktifSirketId(null)}
                className={cn("cursor-pointer", aktifSirketId === null && "font-bold")}
                data-testid="sirket-secici-tum"
              >
                Tüm Firmalar
              </DropdownMenuItem>
              {firmalar.length > 0 && <DropdownMenuSeparator />}
              {firmalar.map(f => (
                <DropdownMenuItem
                  key={f.id}
                  onClick={() => setAktifSirketId(f.id)}
                  className={cn("cursor-pointer flex items-center justify-between gap-2", aktifSirketId === f.id && "font-bold")}
                  data-testid={`sirket-secici-${f.id}`}
                >
                  <span className="truncate">{f.ad}</span>
                  {(f as unknown as Record<string, unknown>).etiket && (
                    <span className="shrink-0 text-[10px] font-bold bg-[#ffed00] text-black px-1.5 py-0.5 leading-none">
                      {String((f as unknown as Record<string, unknown>).etiket)}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          <NavLinks allNav={allNav} location={location} />
        </nav>

        {/* Kullanıcı alanı */}
        <div className="border-t border-sidebar-border px-3 py-3 shrink-0">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="w-7 h-7 rounded-sm bg-primary flex items-center justify-center text-xs font-black text-primary-foreground shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-sidebar-foreground">{kullanici?.ad}</p>
              <p className="text-xs text-sidebar-foreground/50 flex items-center gap-1">
                {isYonetici && <ShieldCheck className="h-3 w-3 text-primary" />}
                {kullanici?.rol === "yonetici" ? "Yönetici" : kullanici?.rol === "muhasebeci" ? "Muhasebeci" : "Salt Okunur"}
              </p>
            </div>
            <button
              onClick={onLogout}
              title="Çıkış yap"
              className="w-7 h-7 rounded-sm flex items-center justify-center text-sidebar-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile Sheet ── */}
      <Sheet open={menuAcik} onOpenChange={setMenuAcik}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col bg-sidebar border-r-0">
          <SheetHeader className="flex flex-row items-center justify-center px-5 py-5 border-b border-sidebar-border shrink-0">
            <SheetTitle className="flex items-center justify-center">
              <img src={toovBeyaz} alt="TOOV" className="w-32 h-auto" />
            </SheetTitle>
          </SheetHeader>

          <div className="px-3 py-3 border-b border-sidebar-border shrink-0">
            <p className="text-[10px] text-sidebar-foreground/40 px-2 mb-1.5 font-bold uppercase tracking-widest">Aktif Firma</p>
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full flex items-center justify-between px-3 py-2 rounded-none bg-sidebar-accent hover:bg-sidebar-accent/80 text-sm font-medium transition-colors text-sidebar-foreground border border-sidebar-border">
                <span className="truncate text-[13px]">{aktifSirketAd}</span>
                <span className="flex items-center gap-1.5 shrink-0 ml-1.5">
                  {aktifFirmaEtiket && (
                    <span className="text-[9px] font-bold bg-[#ffed00] text-black px-1 py-0.5 leading-none whitespace-nowrap">
                      {aktifFirmaEtiket}
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 text-sidebar-foreground/40" />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => setAktifSirketId(null)} className={cn("cursor-pointer", aktifSirketId === null && "font-bold text-primary")}>
                  Tüm Firmalar
                </DropdownMenuItem>
                {firmalar.length > 0 && <DropdownMenuSeparator />}
                {firmalar.map(f => (
                  <DropdownMenuItem key={f.id} onClick={() => setAktifSirketId(f.id)} className={cn("cursor-pointer", aktifSirketId === f.id && "font-bold text-primary")}>
                    {f.ad}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <nav className="flex-1 overflow-y-auto py-3">
            <NavLinks allNav={allNav} location={location} onNavigate={() => setMenuAcik(false)} />
          </nav>

          <div className="border-t border-sidebar-border px-3 py-3 shrink-0">
            <div className="flex items-center gap-3 px-2 py-1.5">
              <div className="w-7 h-7 rounded-sm bg-primary flex items-center justify-center text-xs font-black text-primary-foreground shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate text-sidebar-foreground">{kullanici?.ad}</p>
                <p className="text-xs text-sidebar-foreground/50 flex items-center gap-1">
                  {isYonetici && <ShieldCheck className="h-3 w-3 text-primary" />}
                  {kullanici?.rol === "yonetici" ? "Yönetici" : kullanici?.rol === "muhasebeci" ? "Muhasebeci" : "Salt Okunur"}
                </p>
              </div>
              <button
                onClick={() => { onLogout(); setMenuAcik(false); }}
                title="Çıkış yap"
                className="w-7 h-7 rounded-sm flex items-center justify-center text-sidebar-foreground/40 hover:text-primary transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        {/* Header — white with bottom border */}
        <header className="h-14 md:h-16 border-b bg-background flex items-center justify-between px-4 md:px-8 z-10 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-none hover:bg-muted transition-colors shrink-0"
              onClick={() => setMenuAcik(true)}
              aria-label="Menüyü aç"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base md:text-xl font-bold truncate leading-tight">{currentPage}</h1>
              <p className="text-xs text-muted-foreground truncate hidden sm:block">{aktifSirketAd}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <GlobalArama />

            <DropdownMenu>
              <DropdownMenuTrigger className="w-8 h-8 rounded-sm bg-primary flex items-center justify-center text-xs font-black text-primary-foreground hover:bg-primary/80 transition-colors shrink-0">
                {initials}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-3 py-2 text-sm">
                  <p className="font-bold">{kullanici?.ad}</p>
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

        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-background">
          <div className="mx-auto max-w-6xl w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
