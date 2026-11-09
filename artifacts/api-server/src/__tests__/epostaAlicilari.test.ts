import { describe, expect, it } from "vitest";
import { epostaAlicilari } from "../lib/epostaAlicilari";

describe("Fatura e-posta alıcıları", () => {
  it("tek adresi ve çevresindeki boşlukları kabul eder", () => {
    expect(epostaAlicilari("  hesap@example.com  ")).toEqual(["hesap@example.com"]);
  });
  it("birden fazla adresi taşıma katmanına ayrı alıcılar olarak verir", () => {
    expect(epostaAlicilari("a@example.com, b@example.com;c@example.com\nd@example.com"))
      .toEqual(["a@example.com", "b@example.com", "c@example.com", "d@example.com"]);
  });
  it("aynı adrese tekrar göndermez", () => {
    expect(epostaAlicilari("A@example.com, a@EXAMPLE.com, b@example.com"))
      .toEqual(["A@example.com", "b@example.com"]);
  });
  it.each(["", " , ; ", null, undefined, ["a@example.com"], "yanlis", "a@example.com, bozuk", "a@@example.com",
    '"Kişi" <a@example.com>', "a@example.com\r\nBcc: gizli@example.com"])("geçersiz girdiyi reddeder: %s", value => {
    expect(() => epostaAlicilari(value)).toThrow();
  });
  it("aşırı sayıda adresi reddeder", () => {
    expect(() => epostaAlicilari(Array.from({ length: 51 }, (_, i) => `a${i}@example.com`).join(","))).toThrow("50");
  });
});
