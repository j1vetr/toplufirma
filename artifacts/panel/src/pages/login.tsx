import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Props {
  onLogin: (token: string, kullanici: object) => void;
}

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [parola, setParola] = useState("");
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  async function girisYap(e: React.FormEvent) {
    e.preventDefault();
    setHata("");
    setYukleniyor(true);
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, parola }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setHata(data.error ?? "Giriş başarısız");
        return;
      }
      onLogin(data.token, data.kullanici);
    } catch {
      setHata("Sunucuya bağlanılamadı");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Sol panel — siyah / marka alanı ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-black flex-col justify-between p-12">
        {/* Logo */}
        <div>
          <span className="text-2xl font-black tracking-tight">
            <span className="text-white/30">&lt;</span>
            <span className="text-white mx-1.5">TOOV</span>
            <span className="text-[#ffed00]">/&gt;</span>
          </span>
        </div>

        {/* Başlık */}
        <div>
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-4">Çoklu Firma Yönetim Sistemi</p>
          <h1 className="text-5xl font-black text-white leading-[0.95] mb-6">
            DENİZCİLİK<br />
            <span className="text-[#ffed00]">FİNANS</span><br />
            PANELİ
          </h1>
          <p className="text-white/50 text-sm leading-relaxed max-w-xs">
            Starlink aboneliklerini, faturaları ve teklifleri tek ekrandan yönetin.
          </p>
        </div>

        {/* Alt footnote */}
        <p className="text-[10px] text-white/20 font-medium">© {new Date().getFullYear()} TOOV. Tüm hakları saklıdır.</p>
      </div>

      {/* ── Sağ panel — beyaz / form alanı ── */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 md:p-16 bg-white">
        {/* Mobile logo */}
        <div className="lg:hidden mb-10 text-center">
          <span className="text-2xl font-black tracking-tight">
            <span className="text-black/20">&lt;</span>
            <span className="text-black mx-1.5">TOOV</span>
            <span className="text-[#ffed00]">/&gt;</span>
          </span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <p className="text-[10px] font-bold text-black/30 uppercase tracking-widest mb-2">Hoş geldiniz</p>
            <h2 className="text-3xl font-black text-black leading-[0.95]">Giriş Yap</h2>
          </div>

          <form onSubmit={girisYap} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-black/60">
                E-posta
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="kullanici@ornek.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="h-11 rounded-none border-black/20 focus-visible:ring-[#ffed00] focus-visible:border-black text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="parola" className="text-xs font-bold uppercase tracking-wider text-black/60">
                Parola
              </Label>
              <Input
                id="parola"
                type="password"
                placeholder="••••••••"
                value={parola}
                onChange={e => setParola(e.target.value)}
                autoComplete="current-password"
                required
                className="h-11 rounded-none border-black/20 focus-visible:ring-[#ffed00] focus-visible:border-black text-sm"
              />
            </div>

            {hata && (
              <div className="border-l-4 border-destructive bg-destructive/5 px-4 py-3">
                <p className="text-sm text-destructive font-medium">{hata}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 rounded-none bg-[#ffed00] text-black font-black text-sm uppercase tracking-wider hover:bg-[#e6d200] border-0"
              disabled={yukleniyor}
            >
              {yukleniyor ? "Giriş yapılıyor..." : "Giriş Yap"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
