import { describe, expect, it } from "vitest";
import { hesapAnaParaBirimi, hesapParaBirimleri } from "../utils/bankaParaBirimleri";

describe("banka hesabı para birimleri", () => {
  it("IBAN kayıtları varken tutarsız scalar para birimini yok sayar", () => {
    const hesap = {
      paraBirimi: "TRY",
      ibanlar: { USD: "US00 TEST", EUR: "DE00 TEST" },
    };

    expect(hesapParaBirimleri(hesap)).toEqual(["USD", "EUR"]);
    expect(hesapAnaParaBirimi(hesap)).toBe("USD");
  });

  it("IBAN kaydı yoksa legacy scalar para birimini kullanır", () => {
    expect(hesapParaBirimleri({ paraBirimi: "GBP", ibanlar: {} })).toEqual(["GBP"]);
    expect(hesapAnaParaBirimi({ paraBirimi: "GBP", ibanlar: {} })).toBe("GBP");
  });

  it("boş IBAN değerlerini kayıtlı para birimi saymaz", () => {
    const hesap = { paraBirimi: "CHF", ibanlar: { TRY: "  ", EUR: "" } };

    expect(hesapParaBirimleri(hesap)).toEqual(["CHF"]);
    expect(hesapAnaParaBirimi(hesap)).toBe("CHF");
  });
});