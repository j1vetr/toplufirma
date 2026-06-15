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
import { relations } from "drizzle-orm";

// ── Enums ──────────────────────────────────────────────────────────────────
export const cariTipEnum = pgEnum("cari_tip", [
  "musteri",
  "tedarikci",
  "ana_firma",
  "bagli_firma",
  "gemi_sahibi",
  "diger",
]);

export const faturaDurumEnum = pgEnum("fatura_durum", [
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

// ── Şirketler ─────────────────────────────────────────────────────────────
export const sirketler = pgTable("sirketler", {
  id: serial("id").primaryKey(),
  ad: text("ad").notNull(),
  vergiNo: text("vergi_no"),
  vergiDairesi: text("vergi_dairesi"),
  adres: text("adres"),
  telefon: text("telefon"),
  eposta: text("eposta"),
  seriOneki: text("seri_oneki").notNull().default("FAT"),
  logo: text("logo"),
  aktif: boolean("aktif").notNull().default(true),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

// ── Cariler ───────────────────────────────────────────────────────────────
export const cariler = pgTable("cariler", {
  id: serial("id").primaryKey(),
  sirketId: integer("sirket_id")
    .notNull()
    .references(() => sirketler.id),
  ad: text("ad").notNull(),
  tip: cariTipEnum("tip").notNull().default("musteri"),
  vergiNo: text("vergi_no"),
  vergiDairesi: text("vergi_dairesi"),
  telefon: text("telefon"),
  eposta: text("eposta"),
  adres: text("adres"),
  yetkiliKisi: text("yetkili_kisi"),
  paraBirimi: text("para_birimi").notNull().default("USD"),
  notlar: text("notlar"),
  aktif: boolean("aktif").notNull().default(true),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

// ── Gemiler ───────────────────────────────────────────────────────────────
export const gemiler = pgTable("gemiler", {
  id: serial("id").primaryKey(),
  cariId: integer("cari_id")
    .notNull()
    .references(() => cariler.id),
  ad: text("ad").notNull(),
  imoNumarasi: text("imo_numarasi"),
  bayrakDevleti: text("bayrak_devleti"),
  notlar: text("notlar"),
  aktif: boolean("aktif").notNull().default(true),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

// ── Banka Hesapları ───────────────────────────────────────────────────────
export const bankaHesaplari = pgTable("banka_hesaplari", {
  id: serial("id").primaryKey(),
  sirketId: integer("sirket_id")
    .notNull()
    .references(() => sirketler.id),
  bankaAdi: text("banka_adi").notNull(),
  hesapAdi: text("hesap_adi").notNull(),
  iban: text("iban"),
  paraBirimi: text("para_birimi").notNull().default("TRY"),
  subeAdi: text("sube_adi"),
  aciklama: text("aciklama"),
  aktif: boolean("aktif").notNull().default(true),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

// ── KDV Oranları ──────────────────────────────────────────────────────────
export const kdvOranlari = pgTable("kdv_oranlari", {
  id: serial("id").primaryKey(),
  sirketId: integer("sirket_id")
    .notNull()
    .references(() => sirketler.id),
  ad: text("ad").notNull(),
  oran: numeric("oran", { precision: 5, scale: 2 }).notNull(),
  varsayilan: boolean("varsayilan").notNull().default(false),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

// ── Fatura Serileri ───────────────────────────────────────────────────────
export const faturaSerileri = pgTable("fatura_serileri", {
  id: serial("id").primaryKey(),
  sirketId: integer("sirket_id")
    .notNull()
    .references(() => sirketler.id),
  ad: text("ad").notNull(),
  onek: text("onek").notNull(),
  sonrakiNo: integer("sonraki_no").notNull().default(1),
  varsayilan: boolean("varsayilan").notNull().default(false),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

// ── Faturalar ─────────────────────────────────────────────────────────────
export const faturalar = pgTable("faturalar", {
  id: serial("id").primaryKey(),
  sirketId: integer("sirket_id")
    .notNull()
    .references(() => sirketler.id),
  cariId: integer("cari_id")
    .notNull()
    .references(() => cariler.id),
  gemiId: integer("gemi_id").references(() => gemiler.id),
  faturaSerisiId: integer("fatura_serisi_id").references(() => faturaSerileri.id),
  faturaNo: text("fatura_no").notNull(),
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
  faturaId: integer("fatura_id")
    .notNull()
    .references(() => faturalar.id, { onDelete: "cascade" }),
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
  sirketId: integer("sirket_id")
    .notNull()
    .references(() => sirketler.id),
  cariId: integer("cari_id")
    .notNull()
    .references(() => cariler.id),
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

// ── Starlink Planları ─────────────────────────────────────────────────────
export const starlinkPlanlari = pgTable("starlink_planlari", {
  id: serial("id").primaryKey(),
  sirketId: integer("sirket_id")
    .notNull()
    .references(() => sirketler.id),
  cariId: integer("cari_id")
    .notNull()
    .references(() => cariler.id),
  gemiId: integer("gemi_id")
    .notNull()
    .references(() => gemiler.id),
  planAdi: text("plan_adi").notNull(),
  hizMbps: integer("hiz_mbps"),
  baslangicTarihi: date("baslangic_tarihi").notNull(),
  bitisTarihi: date("bitis_tarihi").notNull(),
  aylikUcret: numeric("aylik_ucret", { precision: 15, scale: 2 }).notNull(),
  paraBirimi: text("para_birimi").notNull().default("USD"),
  otomatikYenileme: boolean("otomatik_yenileme").notNull().default(true),
  aktif: boolean("aktif").notNull().default(true),
  notlar: text("notlar"),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

// ── Ekipmanlar ────────────────────────────────────────────────────────────
export const ekipmanlar = pgTable("ekipmanlar", {
  id: serial("id").primaryKey(),
  sirketId: integer("sirket_id")
    .notNull()
    .references(() => sirketler.id),
  gemiId: integer("gemi_id")
    .notNull()
    .references(() => gemiler.id),
  tip: text("tip").notNull(),
  seriNo: text("seri_no").notNull(),
  kurulumTarihi: date("kurulum_tarihi"),
  garantiBitisTarihi: date("garanti_bitis_tarihi"),
  notlar: text("notlar"),
  aktif: boolean("aktif").notNull().default(true),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

// ── Kullanıcılar ──────────────────────────────────────────────────────────
export const kullaniciRolEnum = pgEnum("kullanici_rol", ["yonetici", "muhasebeci", "salt_okunur"]);

export const kullanicilar = pgTable("kullanicilar", {
  id: serial("id").primaryKey(),
  ad: text("ad").notNull(),
  email: text("email").notNull().unique(),
  parola: text("parola").notNull(),
  rol: kullaniciRolEnum("rol").notNull().default("muhasebeci"),
  aktif: boolean("aktif").notNull().default(true),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
});

export const kullaniciSirketler = pgTable("kullanici_sirketler", {
  id: serial("id").primaryKey(),
  kullaniciId: integer("kullanici_id").notNull().references(() => kullanicilar.id, { onDelete: "cascade" }),
  sirketId: integer("sirket_id").notNull().references(() => sirketler.id, { onDelete: "cascade" }),
  rol: kullaniciRolEnum("rol").notNull().default("muhasebeci"),
});

// ── İlişkiler ─────────────────────────────────────────────────────────────
export const sirketlerRelations = relations(sirketler, ({ many }) => ({
  cariler: many(cariler),
  bankaHesaplari: many(bankaHesaplari),
  faturalar: many(faturalar),
  odemeler: many(odemeler),
  starlinkPlanlari: many(starlinkPlanlari),
  ekipmanlar: many(ekipmanlar),
  kdvOranlari: many(kdvOranlari),
  faturaSerileri: many(faturaSerileri),
}));

export const carilerRelations = relations(cariler, ({ one, many }) => ({
  sirket: one(sirketler, { fields: [cariler.sirketId], references: [sirketler.id] }),
  gemiler: many(gemiler),
  faturalar: many(faturalar),
  odemeler: many(odemeler),
  starlinkPlanlari: many(starlinkPlanlari),
}));

export const gemilerRelations = relations(gemiler, ({ one, many }) => ({
  cari: one(cariler, { fields: [gemiler.cariId], references: [cariler.id] }),
  faturalar: many(faturalar),
  odemeler: many(odemeler),
  starlinkPlanlari: many(starlinkPlanlari),
  ekipmanlar: many(ekipmanlar),
}));

export const bankaHesaplariRelations = relations(bankaHesaplari, ({ one, many }) => ({
  sirket: one(sirketler, { fields: [bankaHesaplari.sirketId], references: [sirketler.id] }),
  odemeler: many(odemeler),
}));

export const faturalarRelations = relations(faturalar, ({ one, many }) => ({
  sirket: one(sirketler, { fields: [faturalar.sirketId], references: [sirketler.id] }),
  cari: one(cariler, { fields: [faturalar.cariId], references: [cariler.id] }),
  gemi: one(gemiler, { fields: [faturalar.gemiId], references: [gemiler.id] }),
  faturaSeri: one(faturaSerileri, { fields: [faturalar.faturaSerisiId], references: [faturaSerileri.id] }),
  kalemler: many(faturaKalemleri),
  odemeler: many(odemeler),
}));

export const faturaKalemleriRelations = relations(faturaKalemleri, ({ one }) => ({
  fatura: one(faturalar, { fields: [faturaKalemleri.faturaId], references: [faturalar.id] }),
}));

export const odemelerRelations = relations(odemeler, ({ one }) => ({
  sirket: one(sirketler, { fields: [odemeler.sirketId], references: [sirketler.id] }),
  cari: one(cariler, { fields: [odemeler.cariId], references: [cariler.id] }),
  gemi: one(gemiler, { fields: [odemeler.gemiId], references: [gemiler.id] }),
  bankaHesabi: one(bankaHesaplari, { fields: [odemeler.bankaHesabiId], references: [bankaHesaplari.id] }),
  fatura: one(faturalar, { fields: [odemeler.faturaId], references: [faturalar.id] }),
}));

export const starlinkPlanlariRelations = relations(starlinkPlanlari, ({ one }) => ({
  sirket: one(sirketler, { fields: [starlinkPlanlari.sirketId], references: [sirketler.id] }),
  cari: one(cariler, { fields: [starlinkPlanlari.cariId], references: [cariler.id] }),
  gemi: one(gemiler, { fields: [starlinkPlanlari.gemiId], references: [gemiler.id] }),
}));

export const ekipmanlarRelations = relations(ekipmanlar, ({ one }) => ({
  sirket: one(sirketler, { fields: [ekipmanlar.sirketId], references: [sirketler.id] }),
  gemi: one(gemiler, { fields: [ekipmanlar.gemiId], references: [gemiler.id] }),
}));

export const kdvOranlariRelations = relations(kdvOranlari, ({ one }) => ({
  sirket: one(sirketler, { fields: [kdvOranlari.sirketId], references: [sirketler.id] }),
}));

export const faturaSerileriRelations = relations(faturaSerileri, ({ one, many }) => ({
  sirket: one(sirketler, { fields: [faturaSerileri.sirketId], references: [sirketler.id] }),
  faturalar: many(faturalar),
}));
