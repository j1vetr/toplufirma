import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Enums ──────────────────────────────────────────────────────────────────
export const firmaTipEnum = pgEnum("firma_tip", ["cati", "bagli", "grup"]);

export const faturaDurumEnum = pgEnum("fatura_durum", [
  "taslak",
  "acik",
  "kismi_odendi",
  "odendi",
  "iptal",
]);

export const odemeTipEnum = pgEnum("odeme_tip", ["tahsilat", "odeme"]);

export const odemeYontemiEnum = pgEnum("odeme_yontemi", [
  "banka_havalesi",
  "eft",
  "nakit",
  "kredi_karti",
  "wise",
  "paypal",
  "diger",
]);

export const kullaniciRolEnum = pgEnum("kullanici_rol", ["yonetici", "muhasebeci", "salt_okunur"]);

// ── Firmalar (çatı + bağlı) ───────────────────────────────────────────────
export const firmalar = pgTable("firmalar", {
  id: serial("id").primaryKey(),
  tip: firmaTipEnum("tip").notNull().default("cati"),
  ustFirmaId: integer("ust_firma_id").references((): AnyPgColumn => firmalar.id),
  grupFirmaId: integer("grup_firma_id").references((): AnyPgColumn => firmalar.id),
  ad: text("ad").notNull(),
  vergiNo: text("vergi_no"),
  vergiDairesi: text("vergi_dairesi"),
  adres: text("adres"),
  telefon: text("telefon"),
  eposta: text("eposta"),
  yetkiliKisi: text("yetkili_kisi"),
  paraBirimi: text("para_birimi").notNull().default("USD"),
  notlar: text("notlar"),
  seriOneki: text("seri_oneki"),
  etiket: text("etiket"),
  logo: text("logo"),
  aktif: boolean("aktif").notNull().default(true),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

// ── Firma E-posta Ayarları ────────────────────────────────────────────────
export const firmaEpostaAyarlari = pgTable("firma_eposta_ayarlari", {
  id: serial("id").primaryKey(),
  firmaId: integer("firma_id").notNull().references(() => firmalar.id, { onDelete: "cascade" }),
  smtpHost: text("smtp_host").notNull(),
  smtpPort: integer("smtp_port").notNull().default(587),
  smtpGuvenlik: text("smtp_guvenlik").notNull().default("starttls"),
  smtpKullanici: text("smtp_kullanici").notNull(),
  smtpSifre: text("smtp_sifre").notNull(),
  gonderenAd: text("gonderen_ad").notNull(),
  gonderenAdres: text("gonderen_adres").notNull(),
  aktif: boolean("aktif").notNull().default(true),
});

// ── Gemiler ───────────────────────────────────────────────────────────────
export const gemiler = pgTable("gemiler", {
  id: serial("id").primaryKey(),
  firmaId: integer("firma_id").notNull().references(() => firmalar.id),
  ad: text("ad").notNull(),
  imoNumarasi: text("imo_numarasi"),
  bayrakDevleti: text("bayrak_devleti"),
  notlar: text("notlar"),
  aktif: boolean("aktif").notNull().default(true),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

// ── Firma Şirket Görünürlük ───────────────────────────────────────────────
export const firmaSirketGorunurluk = pgTable("firma_sirket_gorunurluk", {
  id: serial("id").primaryKey(),
  firmaId: integer("firma_id").notNull().references(() => firmalar.id, { onDelete: "cascade" }),
  catiFirmaId: integer("cati_firma_id").notNull().references(() => firmalar.id, { onDelete: "cascade" }),
});

// ── Banka Hesapları ───────────────────────────────────────────────────────
export const bankaHesaplari = pgTable("banka_hesaplari", {
  id: serial("id").primaryKey(),
  catiFirmaId: integer("cati_firma_id").notNull().references(() => firmalar.id),
  bankaAdi: text("banka_adi"),
  hesapAdi: text("hesap_adi").notNull(),
  iban: text("iban"),
  swift: text("swift"),
  paraBirimi: text("para_birimi").notNull().default("TRY"),
  subeAdi: text("sube_adi"),
  aciklama: text("aciklama"),
  aktif: boolean("aktif").notNull().default(true),
  faturadaGoster: boolean("faturada_goster").notNull().default(true),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

// ── KDV Oranları ──────────────────────────────────────────────────────────
export const kdvOranlari = pgTable("kdv_oranlari", {
  id: serial("id").primaryKey(),
  catiFirmaId: integer("cati_firma_id").notNull().references(() => firmalar.id),
  ad: text("ad").notNull(),
  oran: numeric("oran", { precision: 5, scale: 2 }).notNull(),
  varsayilan: boolean("varsayilan").notNull().default(false),
});

// ── Fatura Serileri ───────────────────────────────────────────────────────
export const faturaSerileri = pgTable("fatura_serileri", {
  id: serial("id").primaryKey(),
  catiFirmaId: integer("cati_firma_id").notNull().references(() => firmalar.id),
  ad: text("ad").notNull(),
  onek: text("onek").notNull(),
  sonrakiNo: integer("sonraki_no").notNull().default(1),
  varsayilan: boolean("varsayilan").notNull().default(false),
});

// ── Faturalar ─────────────────────────────────────────────────────────────
export const faturalar = pgTable("faturalar", {
  id: serial("id").primaryKey(),
  catiFirmaId: integer("cati_firma_id").notNull().references(() => firmalar.id),
  bagliFirmaId: integer("bagli_firma_id").notNull().references(() => firmalar.id),
  grupFirmaId: integer("grup_firma_id").references(() => firmalar.id),
  gemiId: integer("gemi_id").references(() => gemiler.id),
  faturaSerisiId: integer("fatura_serisi_id").references(() => faturaSerileri.id),
  faturaNo: text("fatura_no").notNull(),
  faturaAdi: text("fatura_adi"),
  faturaTarihi: date("fatura_tarihi").notNull(),
  vadeTarihi: date("vade_tarihi").notNull(),
  paraBirimi: text("para_birimi").notNull().default("USD"),
  durum: faturaDurumEnum("durum").notNull().default("acik"),
  toplamTutar: numeric("toplam_tutar", { precision: 15, scale: 2 }).notNull().default("0"),
  kdvTutari: numeric("kdv_tutari", { precision: 15, scale: 2 }).notNull().default("0"),
  genelToplam: numeric("genel_toplam", { precision: 15, scale: 2 }).notNull().default("0"),
  notlar: text("notlar"),
  aciklama: text("aciklama"),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

// ── Fatura Kalemleri ──────────────────────────────────────────────────────
export const faturaKalemleri = pgTable("fatura_kalemleri", {
  id: serial("id").primaryKey(),
  faturaId: integer("fatura_id").notNull().references(() => faturalar.id, { onDelete: "cascade" }),
  aciklama: text("aciklama").notNull(),
  miktar: numeric("miktar", { precision: 15, scale: 4 }).notNull(),
  birimFiyat: numeric("birim_fiyat", { precision: 15, scale: 4 }).notNull(),
  kdvOrani: numeric("kdv_orani", { precision: 5, scale: 2 }).notNull().default("0"),
  araToplam: numeric("ara_toplam", { precision: 15, scale: 2 }).notNull(),
  kdvTutari: numeric("kdv_tutari", { precision: 15, scale: 2 }).notNull().default("0"),
  genelToplam: numeric("genel_toplam", { precision: 15, scale: 2 }).notNull(),
});

// ── Ödemeler ──────────────────────────────────────────────────────────────
export const odemeler = pgTable("odemeler", {
  id: serial("id").primaryKey(),
  catiFirmaId: integer("cati_firma_id").notNull().references(() => firmalar.id),
  bagliFirmaId: integer("bagli_firma_id").references(() => firmalar.id),
  gemiId: integer("gemi_id").references(() => gemiler.id),
  bankaHesabiId: integer("banka_hesabi_id").references(() => bankaHesaplari.id),
  faturaId: integer("fatura_id").references(() => faturalar.id),
  tip: odemeTipEnum("tip").notNull(),
  tarih: date("tarih").notNull(),
  tutar: numeric("tutar", { precision: 15, scale: 2 }).notNull(),
  paraBirimi: text("para_birimi").notNull().default("USD"),
  odemeYontemi: odemeYontemiEnum("odeme_yontemi").notNull().default("banka_havalesi"),
  aciklama: text("aciklama"),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

// ── Ekipmanlar ────────────────────────────────────────────────────────────
export const ekipmanlar = pgTable("ekipmanlar", {
  id: serial("id").primaryKey(),
  catiFirmaId: integer("cati_firma_id").notNull().references(() => firmalar.id),
  gemiId: integer("gemi_id").notNull().references(() => gemiler.id),
  tip: text("tip").notNull(),
  seriNo: text("seri_no").notNull(),
  kurulumTarihi: date("kurulum_tarihi"),
  garantiBitisTarihi: date("garanti_bitis_tarihi"),
  notlar: text("notlar"),
  aktif: boolean("aktif").notNull().default(true),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

// ── Tekrarlayan Faturalar ─────────────────────────────────────────────────
export const tekrarlayanFaturalar = pgTable("tekrarlayan_faturalar", {
  id: serial("id").primaryKey(),
  catiFirmaId: integer("cati_firma_id").notNull().references(() => firmalar.id),
  bagliFirmaId: integer("bagli_firma_id").notNull().references(() => firmalar.id),
  grupFirmaId: integer("grup_firma_id").references(() => firmalar.id),
  gemiId: integer("gemi_id").references(() => gemiler.id),
  aciklama: text("aciklama").notNull(),
  birimFiyat: numeric("birim_fiyat", { precision: 15, scale: 2 }).notNull(),
  kdvOrani: numeric("kdv_orani", { precision: 5, scale: 2 }).notNull().default("0"),
  paraBirimi: text("para_birimi").notNull().default("USD"),
  sonrakiTarih: date("sonraki_tarih").notNull(),
  aktif: boolean("aktif").notNull().default(true),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

// ── Tekrarlayan Fatura Kalemleri ──────────────────────────────────────────
export const tekrarlayanFaturaKalemleri = pgTable("tekrarlayan_fatura_kalemleri", {
  id: serial("id").primaryKey(),
  tekrarlayanFaturaId: integer("tekrarlayan_fatura_id").notNull().references(() => tekrarlayanFaturalar.id, { onDelete: "cascade" }),
  aciklama: text("aciklama").notNull(),
  miktar: numeric("miktar", { precision: 15, scale: 4 }).notNull().default("1"),
  birimFiyat: numeric("birim_fiyat", { precision: 15, scale: 4 }).notNull(),
  kdvOrani: numeric("kdv_orani", { precision: 5, scale: 2 }).notNull().default("0"),
});

// ── Teklif Durumu ─────────────────────────────────────────────────────────
export const teklifDurumEnum = pgEnum("teklif_durum", [
  "taslak",
  "gonderildi",
  "onaylandi",
  "reddedildi",
]);

// ── Teklifler ─────────────────────────────────────────────────────────────
export const teklifler = pgTable("teklifler", {
  id: serial("id").primaryKey(),
  catiFirmaId: integer("cati_firma_id").notNull().references(() => firmalar.id),
  gemiId: integer("gemi_id").references(() => gemiler.id),
  teklifNo: text("teklif_no").notNull(),
  tarih: date("tarih").notNull(),
  gecerlilikTarihi: date("gecerlilik_tarihi"),
  aliciAd: text("alici_ad").notNull(),
  aliciAdres: text("alici_adres"),
  aliciTelefon: text("alici_telefon"),
  paraBirimi: text("para_birimi").notNull().default("USD"),
  kurNotu: text("kur_notu"),
  notlar: text("notlar"),
  kosullar: text("kosullar"),
  durum: teklifDurumEnum("durum").notNull().default("taslak"),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
  guncellenmeTarihi: timestamp("guncellenme_tarihi"),
});

// ── Teklif Kalemleri ──────────────────────────────────────────────────────
export const teklifKalemleri = pgTable("teklif_kalemleri", {
  id: serial("id").primaryKey(),
  teklifId: integer("teklif_id").notNull().references(() => teklifler.id, { onDelete: "cascade" }),
  sira: integer("sira").notNull().default(0),
  aciklama: text("aciklama").notNull(),
  miktar: numeric("miktar", { precision: 15, scale: 4 }).notNull(),
  birimFiyat: numeric("birim_fiyat", { precision: 15, scale: 4 }).notNull(),
  birim: text("birim").notNull().default("Adet"),
  opsiyonel: boolean("opsiyonel").notNull().default(false),
});

// ── Kullanıcılar ──────────────────────────────────────────────────────────
export const kullanicilar = pgTable("kullanicilar", {
  id: serial("id").primaryKey(),
  ad: text("ad").notNull(),
  email: text("email").notNull().unique(),
  parola: text("parola").notNull(),
  rol: kullaniciRolEnum("rol").notNull().default("muhasebeci"),
  aktif: boolean("aktif").notNull().default(true),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
  sonGirisTarihi: timestamp("son_giris_tarihi"),
});

export const kullaniciFirmalar = pgTable("kullanici_firmalar", {
  id: serial("id").primaryKey(),
  kullaniciId: integer("kullanici_id").notNull().references(() => kullanicilar.id, { onDelete: "cascade" }),
  catiFirmaId: integer("cati_firma_id").notNull().references(() => firmalar.id, { onDelete: "cascade" }),
  rol: kullaniciRolEnum("rol").notNull().default("muhasebeci"),
});

// ── Gönderim Geçmişi ──────────────────────────────────────────────────────
export const gonderiGecmisi = pgTable("gonderi_gecmisi", {
  id: serial("id").primaryKey(),
  kayitTipi: text("kayit_tipi").notNull(), // "teklif" | "fatura"
  kayitId: integer("kayit_id").notNull(),
  aliciEposta: text("alici_eposta").notNull(),
  gonderenKullaniciId: integer("gonderen_kullanici_id").references(() => kullanicilar.id, { onDelete: "set null" }),
  gonderenAd: text("gonderen_ad"),
  gonderilmeTarihi: timestamp("gonderilme_tarihi").notNull().defaultNow(),
});

// ── İlişkiler ─────────────────────────────────────────────────────────────
export const firmalarRelations = relations(firmalar, ({ one, many }) => ({
  ustFirma: one(firmalar, { fields: [firmalar.ustFirmaId], references: [firmalar.id], relationName: "ustBagli" }),
  bagliFirmalar: many(firmalar, { relationName: "ustBagli" }),
  grupFirma: one(firmalar, { fields: [firmalar.grupFirmaId], references: [firmalar.id], relationName: "grupBagli" }),
  grupBagliFirmalar: many(firmalar, { relationName: "grupBagli" }),
  grupFirmaFaturalar: many(faturalar, { relationName: "grupFirmaFaturalar" }),
  epostaAyarlari: many(firmaEpostaAyarlari),
  gemiler: many(gemiler),
  bankaHesaplari: many(bankaHesaplari),
  catiFirmaFaturalar: many(faturalar, { relationName: "catiFirmaFaturalar" }),
  bagliFirmaFaturalar: many(faturalar, { relationName: "bagliFirmaFaturalar" }),
  catiFirmaOdemeler: many(odemeler, { relationName: "catiFirmaOdemeler" }),
  ekipmanlar: many(ekipmanlar),
  kdvOranlari: many(kdvOranlari),
  faturaSerileri: many(faturaSerileri),
  kullaniciFirmalar: many(kullaniciFirmalar),
}));

export const firmaEpostaAyarlariRelations = relations(firmaEpostaAyarlari, ({ one }) => ({
  firma: one(firmalar, { fields: [firmaEpostaAyarlari.firmaId], references: [firmalar.id] }),
}));

export const gemilerRelations = relations(gemiler, ({ one, many }) => ({
  firma: one(firmalar, { fields: [gemiler.firmaId], references: [firmalar.id] }),
  faturalar: many(faturalar),
  odemeler: many(odemeler),
  ekipmanlar: many(ekipmanlar),
}));

export const bankaHesaplariRelations = relations(bankaHesaplari, ({ one, many }) => ({
  catiFirma: one(firmalar, { fields: [bankaHesaplari.catiFirmaId], references: [firmalar.id] }),
  odemeler: many(odemeler),
}));

export const faturalarRelations = relations(faturalar, ({ one, many }) => ({
  catiFirma: one(firmalar, { fields: [faturalar.catiFirmaId], references: [firmalar.id], relationName: "catiFirmaFaturalar" }),
  bagliFirma: one(firmalar, { fields: [faturalar.bagliFirmaId], references: [firmalar.id], relationName: "bagliFirmaFaturalar" }),
  grupFirma: one(firmalar, { fields: [faturalar.grupFirmaId], references: [firmalar.id], relationName: "grupFirmaFaturalar" }),
  gemi: one(gemiler, { fields: [faturalar.gemiId], references: [gemiler.id] }),
  faturaSeri: one(faturaSerileri, { fields: [faturalar.faturaSerisiId], references: [faturaSerileri.id] }),
  kalemler: many(faturaKalemleri),
  odemeler: many(odemeler),
}));

export const faturaKalemleriRelations = relations(faturaKalemleri, ({ one }) => ({
  fatura: one(faturalar, { fields: [faturaKalemleri.faturaId], references: [faturalar.id] }),
}));

export const odemelerRelations = relations(odemeler, ({ one }) => ({
  catiFirma: one(firmalar, { fields: [odemeler.catiFirmaId], references: [firmalar.id], relationName: "catiFirmaOdemeler" }),
  bagliFirma: one(firmalar, { fields: [odemeler.bagliFirmaId], references: [firmalar.id] }),
  gemi: one(gemiler, { fields: [odemeler.gemiId], references: [gemiler.id] }),
  bankaHesabi: one(bankaHesaplari, { fields: [odemeler.bankaHesabiId], references: [bankaHesaplari.id] }),
  fatura: one(faturalar, { fields: [odemeler.faturaId], references: [faturalar.id] }),
}));

export const ekipmanlarRelations = relations(ekipmanlar, ({ one }) => ({
  catiFirma: one(firmalar, { fields: [ekipmanlar.catiFirmaId], references: [firmalar.id] }),
  gemi: one(gemiler, { fields: [ekipmanlar.gemiId], references: [gemiler.id] }),
}));

export const kdvOranlariRelations = relations(kdvOranlari, ({ one }) => ({
  catiFirma: one(firmalar, { fields: [kdvOranlari.catiFirmaId], references: [firmalar.id] }),
}));

export const faturaSerileriRelations = relations(faturaSerileri, ({ one, many }) => ({
  catiFirma: one(firmalar, { fields: [faturaSerileri.catiFirmaId], references: [firmalar.id] }),
  faturalar: many(faturalar),
}));

export const tekrarlayanFaturalarRelations = relations(tekrarlayanFaturalar, ({ one, many }) => ({
  catiFirma: one(firmalar, { fields: [tekrarlayanFaturalar.catiFirmaId], references: [firmalar.id] }),
  bagliFirma: one(firmalar, { fields: [tekrarlayanFaturalar.bagliFirmaId], references: [firmalar.id] }),
  grupFirma: one(firmalar, { fields: [tekrarlayanFaturalar.grupFirmaId], references: [firmalar.id] }),
  gemi: one(gemiler, { fields: [tekrarlayanFaturalar.gemiId], references: [gemiler.id] }),
  kalemler: many(tekrarlayanFaturaKalemleri),
}));

export const tekrarlayanFaturaKalemleriRelations = relations(tekrarlayanFaturaKalemleri, ({ one }) => ({
  tekrarlayanFatura: one(tekrarlayanFaturalar, { fields: [tekrarlayanFaturaKalemleri.tekrarlayanFaturaId], references: [tekrarlayanFaturalar.id] }),
}));

export const tekliflerRelations = relations(teklifler, ({ one, many }) => ({
  catiFirma: one(firmalar, { fields: [teklifler.catiFirmaId], references: [firmalar.id] }),
  gemi: one(gemiler, { fields: [teklifler.gemiId], references: [gemiler.id] }),
  kalemler: many(teklifKalemleri),
}));

export const teklifKalemleriRelations = relations(teklifKalemleri, ({ one }) => ({
  teklif: one(teklifler, { fields: [teklifKalemleri.teklifId], references: [teklifler.id] }),
}));

export const kullanicilarRelations = relations(kullanicilar, ({ many }) => ({
  kullaniciFirmalar: many(kullaniciFirmalar),
}));

export const kullaniciFirmalarRelations = relations(kullaniciFirmalar, ({ one }) => ({
  kullanici: one(kullanicilar, { fields: [kullaniciFirmalar.kullaniciId], references: [kullanicilar.id] }),
  catiFirma: one(firmalar, { fields: [kullaniciFirmalar.catiFirmaId], references: [firmalar.id] }),
}));
