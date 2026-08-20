export interface BankaParaBirimiKaydi {
  paraBirimi?: string | null;
  ibanlar?: Record<string, string> | null;
}

function ibanParaBirimleri(ibanlar?: Record<string, string> | null): string[] {
  return Object.entries(ibanlar ?? {})
    .filter(([paraBirimi, iban]) => paraBirimi.trim() !== "" && typeof iban === "string" && iban.trim() !== "")
    .map(([paraBirimi]) => paraBirimi);
}

export function hesapParaBirimleri(hesap: BankaParaBirimiKaydi): string[] {
  const ibanPbs = ibanParaBirimleri(hesap.ibanlar);
  if (ibanPbs.length > 0) return [...new Set(ibanPbs)];
  return hesap.paraBirimi ? [hesap.paraBirimi] : [];
}

export function hesapAnaParaBirimi(hesap: BankaParaBirimiKaydi, varsayilan = "TRY"): string {
  return hesapParaBirimleri(hesap)[0] ?? varsayilan;
}