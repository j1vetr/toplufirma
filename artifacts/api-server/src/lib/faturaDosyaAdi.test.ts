import { describe, expect, it } from "vitest";
import { faturaDosyaAdi, pdfDisposition } from "./faturaDosyaAdi";

describe("Fatura PDF dosya adı", () => {
  it("gemi adını önceliklendirir", () => {
    expect(faturaDosyaAdi("ADE00001", "CHRISTINA", "Firma")).toBe("CHRISTINA - ADE00001.pdf");
  });
  it("gemi yoksa müşteri firmasını kullanır", () => {
    expect(faturaDosyaAdi("ADE00002", " ", "İstanbul Denizcilik")).toBe("İstanbul Denizcilik - ADE00002.pdf");
  });
  it("ad yoksa numarayı korur ve tehlikeli karakterleri temizler", () => {
    expect(faturaDosyaAdi("ADE00003")).toBe("ADE00003.pdf");
    expect(faturaDosyaAdi("ADE/00004", 'A/B:"C')).toBe("A B C - ADE 00004.pdf");
  });
  it("Türkçe karakterleri UTF-8 header ile taşır", () => {
    const header = pdfDisposition("İstanbul - ADE00001.pdf");
    expect(header).toContain("filename*=UTF-8''");
    expect(decodeURIComponent(header.split("UTF-8''")[1])).toBe("İstanbul - ADE00001.pdf");
  });
});
