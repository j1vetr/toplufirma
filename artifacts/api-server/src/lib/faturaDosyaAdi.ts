/** Preserve readable Unicode names, while removing unsafe filename characters. */
export function faturaDosyaAdi(faturaNo: string, gemiAd?: string | null, firmaAd?: string | null): string {
  const temizle = (deger: string) => deger
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  const ad = temizle(gemiAd?.trim() || firmaAd?.trim() || "");
  const numara = temizle(faturaNo) || "fatura";
  return `${ad ? `${ad} - ` : ""}${numara}.pdf`;
}

export function pdfDisposition(dosyaAdi: string): string {
  const ascii = dosyaAdi.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(dosyaAdi).replace(/['()*]/g, c =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
