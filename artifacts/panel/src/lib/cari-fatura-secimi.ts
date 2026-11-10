export interface OdenebilirFatura {
  catiFirmaId: number;
  bagliFirmaId: number;
  gemiId?: number | null;
  durum: string;
  genelToplam: number;
  odenenTutar?: number | null;
  kalanTutar?: number | null;
}

/** A customer/group picker must never include another company's invoices. */
export function odenebilirFaturalariFiltrele<T extends OdenebilirFatura>(
  faturalar: T[],
  kapsam: { catiFirmaId: number; firmaIds: number[]; gemiId?: number | null },
): T[] {
  const firmalar = new Set(kapsam.firmaIds);
  return faturalar.filter(f =>
    f.catiFirmaId === kapsam.catiFirmaId &&
    firmalar.has(f.bagliFirmaId) &&
    (!kapsam.gemiId || f.gemiId === kapsam.gemiId) &&
    ["acik", "kismi_odendi"].includes(f.durum) &&
    Math.round((f.kalanTutar ?? f.genelToplam - (f.odenenTutar ?? 0)) * 100) > 0,
  );
}
