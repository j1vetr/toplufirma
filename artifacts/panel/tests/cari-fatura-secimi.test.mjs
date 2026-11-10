import { test } from "node:test";
import assert from "node:assert/strict";
import { odenebilirFaturalariFiltrele } from "../src/lib/cari-fatura-secimi.ts";

const fatura = (id, extra = {}) => ({
  id, catiFirmaId: 10, bagliFirmaId: 20, gemiId: 40,
  durum: "acik", genelToplam: 500, odenenTutar: 0, kalanTutar: 500, ...extra,
});
const kapsam = { catiFirmaId: 10, firmaIds: [20] };
test("yalnızca seçilen çatı ve bağlı firmanın faturaları", () => {
  const rows = [fatura(1), fatura(2, { catiFirmaId: 11 }), fatura(3, { bagliFirmaId: 21 })];
  assert.deepEqual(odenebilirFaturalariFiltrele(rows, kapsam).map(f => f.id), [1]);
});
test("grup bağlamında verilen üyeler dahil edilir, başka gruplar edilmez", () => {
  const rows = [fatura(1), fatura(2, { bagliFirmaId: 21 }), fatura(3, { bagliFirmaId: 22 })];
  assert.deepEqual(odenebilirFaturalariFiltrele(rows, { ...kapsam, firmaIds: [20, 21] }).map(f => f.id), [1, 2]);
});
test("taslak, iptal ve ödenmiş faturalar seçilemez", () => {
  const rows = ["acik", "kismi_odendi", "taslak", "iptal", "odendi"].map((durum, i) => fatura(i, { durum }));
  assert.deepEqual(odenebilirFaturalariFiltrele(rows, kapsam).map(f => f.durum), ["acik", "kismi_odendi"]);
});
test("gemi seçilmişse yalnızca o geminin faturaları", () => {
  const rows = [fatura(1), fatura(2, { gemiId: 41 }), fatura(3, { gemiId: null })];
  assert.deepEqual(odenebilirFaturalariFiltrele(rows, { ...kapsam, gemiId: 40 }).map(f => f.id), [1]);
  assert.equal(odenebilirFaturalariFiltrele(rows, kapsam).length, 3);
});
test("sıfır kalanlı fatura yok, son bir kuruş borcu olan var", () => {
  const rows = [fatura(1, { kalanTutar: 0 }), fatura(2, { kalanTutar: -1 }), fatura(3, { kalanTutar: 0.01 })];
  assert.deepEqual(odenebilirFaturalariFiltrele(rows, kapsam).map(f => f.id), [3]);
});
test("kalan tutar eksikse ödenen tutarı toplamdan düşer", () => {
  const rows = [fatura(1, { kalanTutar: undefined, odenenTutar: 500 }), fatura(2, { kalanTutar: null, odenenTutar: 250 })];
  assert.deepEqual(odenebilirFaturalariFiltrele(rows, kapsam).map(f => f.id), [2]);
});
test("firma seçilmeden hiçbir fatura gösterilmez", () => {
  assert.deepEqual(odenebilirFaturalariFiltrele([fatura(1)], { ...kapsam, firmaIds: [] }), []);
});
