import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  Ship, 
  Landmark, 
  FileText, 
  Wallet, 
  Wifi, 
  HardDrive, 
  Settings, 
  PieChart
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Ana Sayfa", href: "/dashboard", icon: LayoutDashboard },
  { name: "Şirketler", href: "/sirketler", icon: Building2 },
  { name: "Cariler", href: "/cariler", icon: Users },
  { name: "Gemiler", href: "/gemiler", icon: Ship },
  { name: "Banka Hesapları", href: "/banka-hesaplari", icon: Landmark },
  { name: "Faturalar", href: "/faturalar", icon: FileText },
  { name: "Ödemeler", href: "/odemeler", icon: Wallet },
  { name: "Starlink Planları", href: "/starlink-planlari", icon: Wifi },
  { name: "Ekipmanlar", href: "/ekipmanlar", icon: HardDrive },
  { name: "Raporlar", href: "/raporlar", icon: PieChart },
  { name: "Tanımlar", href: "/tanimlar", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <div className="w-64 border-r bg-sidebar hidden md:flex flex-col">
        <div className="h-16 flex items-center px-6 border-b">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold mr-3 shadow-md">
            M
          </div>
          <span className="font-display font-bold text-lg tracking-wide">Muhasebe</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {navigation.map((item) => {
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
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 border-b bg-background flex items-center justify-between px-8 z-10 shrink-0">
          <h1 className="text-xl font-display text-foreground hidden md:block">
            {navigation.find(n => n.href === location || (location === "/" && n.href === "/dashboard"))?.name || "Panel"}
          </h1>
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
              OP
            </div>
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
