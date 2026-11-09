/**
 * Accept plain addresses only. Never let the mail transport reinterpret a
 * display name, header or malformed list as additional recipients.
 */
export function epostaAlicilari(value: unknown): string[] {
  if (typeof value !== "string" || value.length > 16000) {
    throw new Error("Geçerli bir alıcı e-posta adresi girin.");
  }
  const parts = value.trim().split(/[,;\s]+/).filter(Boolean);
  if (!parts.length) throw new Error("En az bir alıcı e-posta adresi girin.");
  if (parts.length > 50) throw new Error("Tek gönderimde en fazla 50 e-posta adresi kullanılabilir.");
  const seen = new Set<string>();
  const addresses: string[] = [];
  for (const part of parts) {
    if (part.length > 254 || !/^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/.test(part)) {
      throw new Error(`Geçersiz e-posta adresi: ${part}`);
    }
    const key = part.toLowerCase();
    if (!seen.has(key)) {
      addresses.push(part);
      seen.add(key);
    }
  }
  return addresses;
}
