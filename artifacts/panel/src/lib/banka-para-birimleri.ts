/**
 * Bir banka hesabı kaydından kayıtlı para birimlerinin listesini türetir:
 * IBAN kayıtları varsa onların para birimleri, yoksa legacy scalar alan.
 * Böylece eski kayıtlardaki yanıltıcı TRY varsayılanı hayalet seçenek üretmez.
 */
export function hesapParaBirimleri(hesap: {
  paraBirimi?: string | null;
  ibanlar?: Record<string, string> | null;
}): string[] {
  const ibanPbs = Object.entries(hesap.ibanlar ?? {})
    .filter(([pb, iban]) => pb.trim() !== "" && iban.trim() !== "")
    .map(([pb]) => pb);
  if (ibanPbs.length > 0) return [...new Set(ibanPbs)];
  return hesap.paraBirimi ? [hesap.paraBirimi] : [];
}
