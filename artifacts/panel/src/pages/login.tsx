import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import toovBeyaz from "@assets/toov__beyaz_logo_1782430202251.png";

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
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-10">

        <div className="flex flex-col items-center gap-4">
          <img src={toovBeyaz} alt="TOOV" className="w-52 h-auto" />
          <p className="text-[10px] font-bold text-white/30 tracking-widest text-center">
            Çoklu FİRMA Yönetim Sistemi
          </p>
        </div>

        <form onSubmit={girisYap} className="w-full space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-white/70">
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
              className="h-11 rounded-none bg-white/8 border-white/25 text-white placeholder:text-white/40 focus-visible:ring-[#ffed00] focus-visible:border-white/50 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="parola" className="text-xs font-bold uppercase tracking-wider text-white/70">
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
              className="h-11 rounded-none bg-white/8 border-white/25 text-white placeholder:text-white/40 focus-visible:ring-[#ffed00] focus-visible:border-white/50 text-sm"
            />
          </div>

          {hata && (
            <div className="border-l-4 border-destructive bg-destructive/10 px-4 py-3">
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
  );
}
