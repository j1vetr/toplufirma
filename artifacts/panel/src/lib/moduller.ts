import type { KullaniciInfo } from "@/App";

/**
 * Panel modül anahtarları. API tarafındaki karşılığı:
 * artifacts/api-server/src/lib/moduller.ts — iki liste senkron tutulmalı.
 */
export const MODULLER = [
  { key: "dashboard", label: "Ana Sayfa (Dashboard)", rota: "/dashboard" },
  { key: "firmalar", label: "Firmalar", rota: "/firmalar" },
  { key: "gemiler", label: "Gemiler", rota: "/gemiler" },
  { key: "teklifler", label: "Teklifler", rota: "/teklifler" },
  { key: "faturalar", label: "Faturalar", rota: "/faturalar" },
  { key: "odemeler", label: "Ödemeler", rota: "/odemeler" },
  { key: "cariler", label: "Cariler", rota: "/cariler" },
  { key: "ekipmanlar", label: "Ekipmanlar", rota: "/ekipmanlar" },
  { key: "servis", label: "Servis & Sözleşme", rota: "/servis" },
  { key: "urunler", label: "Ürünler", rota: "/urunler" },
  { key: "raporlar", label: "Raporlar", rota: "/raporlar" },
  { key: "gonderi_gecmisi", label: "Gönderim Geçmişi", rota: "/gonderi-gecmisi" },
  { key: "ayarlar", label: "Ayarlar", rota: "/ayarlar" },
] as const;

export type ModulKey = (typeof MODULLER)[number]["key"];

/** Hazır şablonlar: tek tıkla uygulanan modül setleri. */
export const MODUL_SABLONLARI: Array<{ ad: string; moduller: ModulKey[] }> = [
  { ad: "Satış", moduller: ["firmalar", "gemiler", "teklifler", "faturalar"] },
];

/** Sayfa rotası -> modül anahtarı (önek eşleşmesi). */
const ROTA_MODUL: Array<{ prefix: string; modul: ModulKey }> = [
  { prefix: "/dashboard", modul: "dashboard" },
  { prefix: "/firmalar", modul: "firmalar" },
  { prefix: "/gemiler", modul: "gemiler" },
  { prefix: "/teklifler", modul: "teklifler" },
  { prefix: "/faturalar", modul: "faturalar" },
  { prefix: "/tekrarlayan-faturalar", modul: "faturalar" },
  { prefix: "/odemeler", modul: "odemeler" },
  { prefix: "/cariler", modul: "cariler" },
  { prefix: "/banka-hesaplari", modul: "ayarlar" },
  { prefix: "/ekipmanlar", modul: "ekipmanlar" },
  { prefix: "/servis", modul: "servis" },
  { prefix: "/urunler", modul: "urunler" },
  { prefix: "/raporlar", modul: "raporlar" },
  { prefix: "/gonderi-gecmisi", modul: "gonderi_gecmisi" },
  { prefix: "/ayarlar", modul: "ayarlar" },
  { prefix: "/tani", modul: "ayarlar" }, // tanı/debug sayfası firma-kapsamı dışı veri gösterebilir
];

export function rotaModulu(path: string): ModulKey | null {
  const kural = ROTA_MODUL.find((r) => path === r.prefix || path.startsWith(r.prefix + "/"));
  return kural?.modul ?? null;
}

export function modulIzinliMi(kullanici: KullaniciInfo | null, modul: ModulKey): boolean {
  if (!kullanici) return false;
  if (kullanici.rol === "yonetici") return true;
  const izinli = kullanici.modulIzinleri;
  if (izinli === null || izinli === undefined) return true; // kısıt tanımlanmamış = tüm modüller
  return izinli.includes(modul);
}

/** Kullanıcının erişebildiği ilk modülün rotası (dashboard izni yoksa yönlendirme hedefi). */
export function ilkIzinliRota(kullanici: KullaniciInfo | null): string {
  for (const m of MODULLER) {
    if (modulIzinliMi(kullanici, m.key)) return m.rota;
  }
  return "/firma-sec";
}
