/** Prefer the authoritative filename returned by the PDF endpoint. */
export function pdfDosyaAdi(resp: Response, faturaNo: string): string {
  const header = resp.headers.get("Content-Disposition") ?? "";
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try { return decodeURIComponent(utf8[1].trim()); } catch { /* Try ASCII fallback. */ }
  }
  return header.match(/filename="([^"]+)"/i)?.[1] ?? `${faturaNo}.pdf`;
}
