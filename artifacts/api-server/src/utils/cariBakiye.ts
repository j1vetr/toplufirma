export type BakiyeFatura = {
  paraBirimi: string | null;
  genelToplam: string | number;
  durum: string;
};

export type BakiyeOdeme = {
  paraBirimi: string | null;
  tutar: string | number;
  tip: string;
};

export type ParaBirimiBakiyesi = {
  paraBirimi: string;
  toplamBorc: number;
  toplamAlacak: number;
  bakiye: number;
};

/**
 * Cari bakiye her para birimi için ayrı hesaplanır:
 * borç (fatura + müşteriye ödeme) − alacak (müşteriden tahsilat).
 */
export function hesaplaParaBirimiBakiyeleri(
  faturaRows: BakiyeFatura[],
  odemeRows: BakiyeOdeme[],
): ParaBirimiBakiyesi[] {
  const gecerliFaturalar = faturaRows.filter(f => !["taslak", "iptal"].includes(f.durum));
  const paraBirimleri = new Set([
    ...gecerliFaturalar.map(f => f.paraBirimi ?? "USD"),
    ...odemeRows.map(o => o.paraBirimi ?? "USD"),
  ]);

  return [...paraBirimleri].map(paraBirimi => {
    const faturaBorcu = gecerliFaturalar
      .filter(f => (f.paraBirimi ?? "USD") === paraBirimi)
      .reduce((toplam, f) => toplam + Number(f.genelToplam), 0);
    const odemeBorcu = odemeRows
      .filter(o => (o.paraBirimi ?? "USD") === paraBirimi && o.tip === "odeme")
      .reduce((toplam, o) => toplam + Number(o.tutar), 0);
    const tahsilat = odemeRows
      .filter(o => (o.paraBirimi ?? "USD") === paraBirimi && o.tip === "tahsilat")
      .reduce((toplam, o) => toplam + Number(o.tutar), 0);
    const toplamBorc = faturaBorcu + odemeBorcu;

    return {
      paraBirimi,
      toplamBorc,
      toplamAlacak: tahsilat,
      bakiye: toplamBorc - tahsilat,
    };
  }).filter(d => d.toplamBorc > 0.005 || d.toplamAlacak > 0.005);
}