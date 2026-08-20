import { describe, expect, it } from "vitest";
import { hesaplaParaBirimiBakiyeleri } from "../utils/cariBakiye";

describe("cari para birimi bakiyeleri", () => {
  it("fazla tahsilatta negatif alacak bakiyesini korur", () => {
    const bakiye = hesaplaParaBirimiBakiyeleri(
      [{ paraBirimi: "USD", genelToplam: 2930, durum: "acik" }],
      [{ paraBirimi: "USD", tutar: 5860, tip: "tahsilat" }],
    );

    expect(bakiye).toEqual([{
      paraBirimi: "USD",
      toplamBorc: 2930,
      toplamAlacak: 5860,
      bakiye: -2930,
    }]);
  });

  it("farklı para birimlerini birbirine katmadan hesaplar", () => {
    const bakiye = hesaplaParaBirimiBakiyeleri(
      [
        { paraBirimi: "USD", genelToplam: 100, durum: "acik" },
        { paraBirimi: "EUR", genelToplam: 200, durum: "acik" },
      ],
      [
        { paraBirimi: "USD", tutar: 150, tip: "tahsilat" },
        { paraBirimi: "EUR", tutar: 50, tip: "tahsilat" },
      ],
    );

    expect(bakiye).toEqual([
      { paraBirimi: "USD", toplamBorc: 100, toplamAlacak: 150, bakiye: -50 },
      { paraBirimi: "EUR", toplamBorc: 200, toplamAlacak: 50, bakiye: 150 },
    ]);
  });
});