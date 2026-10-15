import { describe, it, expect, vi } from "vitest";
vi.mock("@workspace/db", () => ({ db: {}, faturalar: {}, gemiler: {} }));
import { gemiAciklamalariniUygula } from "./ekstreAciklamasi";

describe("Ekstre dışa aktarma açıklamaları", () => {
  it("belge numarasını ve tutarları koruyup yalnızca fatura açıklamasını gemi adı yapar", () => {
    const rows = [
      { id: "f-1", faturaId: 1, tip: "fatura", aciklama: "ADE00001", belgeNo: "ADE00001", borc: 100 },
      { id: "o-2", faturaId: 1, tip: "tahsilat", aciklama: "Havale", belgeNo: null, borc: 0 },
    ];
    const sonuc = gemiAciklamalariniUygula(rows, new Map([[1, "CHRISTINA"]]));
    expect(sonuc[0]).toEqual({ ...rows[0], aciklama: "CHRISTINA" });
    expect(sonuc[1]).toEqual(rows[1]);
    expect(rows[0].aciklama).toBe("ADE00001");
  });
  it("eski firma çıktılarının sayısal kimliklerini de destekler ve gemisiz satırda tire gösterir", () => {
    const rows = [
      { id: 1, tip: "fatura", aciklama: "ADE00001" },
      { id: 2, tip: "fatura", aciklama: "ADE00002" },
      { id: 3, tip: "odeme", aciklama: "Banka ödemesi" },
    ];
    const sonuc = gemiAciklamalariniUygula(rows, new Map([[1, "İSTANBUL"], [2, null]]));
    expect(sonuc.map(r => r.aciklama)).toEqual(["İSTANBUL", "-", "Banka ödemesi"]);
  });
});
