import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import toovLogo from "@assets/TOOV_1781531572101.png";

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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center mb-4">
            <img src={toovLogo} alt="TOOV" className="h-16 w-auto object-contain" />
          </div>
          <h1 className="text-2xl font-display font-semibold">Çoklu Firma Yönetim Sistemi</h1>
        </div>

        <Card className="shadow-sm border-none">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-display">Giriş Yap</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={girisYap} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-posta</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="kullanici@ornek.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="parola">Parola</Label>
                <Input
                  id="parola"
                  type="password"
                  placeholder="••••••••"
                  value={parola}
                  onChange={e => setParola(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              {hata && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{hata}</p>
              )}
              <Button type="submit" className="w-full rounded-full" disabled={yukleniyor}>
                {yukleniyor ? "Giriş yapılıyor..." : "Giriş Yap"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
