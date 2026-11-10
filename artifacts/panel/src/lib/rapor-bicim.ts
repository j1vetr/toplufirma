export const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export const RENK = {
  fatura: "hsl(var(--foreground))",
  karsilanan: "#1F74AD",
  kalan: "#E98E2E",
  tahsilat: "#44986D",
  odeme: "#D8524F",
  net: "hsl(var(--foreground))",
};

export const DURUM_ETIKET: Record<string, string> = {
  taslak: "Taslak",
  acik: "Açık",
  kismi_odendi: "Kısmi ödendi",
  odendi: "Ödendi",
  iptal: "İptal",
};

export const DURUM_RENK: Record<string, string> = {
  acik: "#E98E2E",
  kismi_odendi: "#CED14E",
  odendi: "#44986D",
  taslak: "#979797",
  iptal: "#979797",
};

export const buyukHarf = (s: string) => s.toLocaleUpperCase("tr-TR");

const sayiBicim = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtPara(n: number, pb: string) {
  return `${sayiBicim.format(n)} ${pb}`;
}

export function fmtKisa(n: number) {
  const a = Math.abs(n);
  const f = (v: number, d: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(v);
  if (a >= 1_000_000) return f(n / 1_000_000, 1) + " Mn";
  if (a >= 1_000) return f(n / 1_000, 1) + " B";
  return f(n, a > 0 && a < 10 ? 2 : 0);
}

export function fmtTarih(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtTarihSaat(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function oran(pay: number, payda: number) {
  return payda > 0 ? (pay / payda) * 100 : 0;
}

/* ── CSV ── */
type Hucre = string | number | null | undefined;

function hucreKacir(v: Hucre): string {
  let s: string;
  if (v === null || v === undefined) s = "";
  else if (typeof v === "number") s = !Number.isFinite(v) ? "" : Number.isInteger(v) ? String(v) : v.toFixed(2);
  else {
    s = String(v);
    // Formül enjeksiyonunu etkisizleştir
    if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvIndir(basliklar: string[], satirlar: Hucre[][], dosyaAdi: string) {
  const metin = [basliklar, ...satirlar].map((r) => r.map(hucreKacir).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + metin], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dosyaAdi;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string) {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "firma";
}

export interface RaporBaglam {
  paraBirimi: string;
  yil: number;
  ay: number | null;
  firmaAd: string;
}

export function dosyaAdi(alan: string, b: RaporBaglam) {
  const donem = b.ay ? `${b.yil}-${String(b.ay).padStart(2, "0")}` : String(b.yil);
  return `rapor-${alan}-${slug(b.firmaAd)}-${donem}-${b.paraBirimi}.csv`;
}

export function donemEtiketi(yil: number, ay: number | null) {
  return ay ? `${AY_ADLARI[ay - 1]} ${yil}` : `${yil} yılı`;
}
