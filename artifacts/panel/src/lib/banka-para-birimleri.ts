/**
 * Bir banka hesabı kaydından kayıtlı para birimlerinin listesini türetir:
 * scalar `paraBirimi` alanı + `ibanlar` JSON anahtarları, tekilleştirilmiş.
 */
export function hesapParaBirimleri(hesap: {
  paraBirimi?: string | null;
  ibanlar?: Record<string, string> | null;
}): string[] {
  const pbs: string[] = [];
  if (hesap.paraBirimi) pbs.push(hesap.paraBirimi);
  for (const pb of Object.keys(hesap.ibanlar ?? {})) {
    if (!pbs.includes(pb)) pbs.push(pb);
  }
  return pbs;
}
