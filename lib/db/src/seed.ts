import { db } from "./index";
import {
  firmalar, firmaEpostaAyarlari, gemiler, bankaHesaplari, kdvOranlari,
  faturaSerileri, faturalar, faturaKalemleri, odemeler,
  ekipmanlar, kullanicilar, kullaniciFirmalar,
} from "./schema";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seed basliyor...");

  await db.delete(odemeler);
  await db.delete(faturaKalemleri);
  await db.delete(faturalar);
  await db.delete(ekipmanlar);
  await db.delete(faturaSerileri);
  await db.delete(kdvOranlari);
  await db.delete(bankaHesaplari);
  await db.delete(gemiler);
  await db.delete(kullaniciFirmalar);
  await db.delete(kullanicilar);
  await db.delete(firmaEpostaAyarlari);
  await db.delete(firmalar);

  // ── Çatı Firmalar ────────────────────────────────────────────────────────
  const [lacFirma] = await db.insert(firmalar).values({
    tip: "cati", ad: "Lacivert Teknoloji A.Ş.", vergiNo: "1234567890",
    vergiDairesi: "Galata VD", adres: "Karaköy Cad. No:5, İstanbul",
    telefon: "+90 212 555 0101", eposta: "info@laciverts.com",
    seriOneki: "LAC", aktif: true,
  }).returning();

  const [agsFirma] = await db.insert(firmalar).values({
    tip: "cati", ad: "Ade Globa Space Ltd. Şti.", vergiNo: "9876543210",
    vergiDairesi: "İzmir VD", adres: "Konak Mah. Atatürk Blv. No:12, İzmir",
    telefon: "+90 232 555 0202", eposta: "info@adeglobaspace.com",
    seriOneki: "AGS", aktif: true,
  }).returning();

  // ── Bağlı Firmalar (LAC) ─────────────────────────────────────────────────
  const [meridian] = await db.insert(firmalar).values({
    tip: "bagli", ustFirmaId: lacFirma.id, ad: "Meridian Shipping Co.",
    vergiNo: "US-789012345", telefon: "+1 212 555 0301",
    eposta: "ops@meridianshipping.com", paraBirimi: "USD",
    yetkiliKisi: "James Wilson", aktif: true,
  }).returning();

  const [pacificStar] = await db.insert(firmalar).values({
    tip: "bagli", ustFirmaId: lacFirma.id, ad: "Pacific Star Lines",
    vergiNo: "HK-456789012", telefon: "+852 2555 0401",
    eposta: "billing@pacificstarlines.com", paraBirimi: "USD",
    yetkiliKisi: "Chen Wei", aktif: true,
  }).returning();

  const [atlantisFleet] = await db.insert(firmalar).values({
    tip: "bagli", ustFirmaId: lacFirma.id, ad: "Atlantis Fleet Management",
    vergiNo: "GR-123456789", telefon: "+30 210 555 0501",
    eposta: "info@atlantisfleet.gr", paraBirimi: "EUR",
    yetkiliKisi: "Nikolaos Papadopoulos", aktif: true,
  }).returning();

  const [spaceX] = await db.insert(firmalar).values({
    tip: "bagli", ustFirmaId: lacFirma.id, ad: "Starlink / SpaceX",
    vergiNo: "US-000000001", telefon: "+1 310 555 0001",
    eposta: "maritime@starlink.com", paraBirimi: "USD",
    notlar: "Starlink terminal tedarikçisi", aktif: true,
  }).returning();

  // ── Bağlı Firmalar (AGS) ─────────────────────────────────────────────────
  const [euromedTankers] = await db.insert(firmalar).values({
    tip: "bagli", ustFirmaId: agsFirma.id, ad: "Euromed Tankers S.A.",
    vergiNo: "IT-987654321", telefon: "+39 06 555 0601",
    eposta: "fleet@euromedtankers.it", paraBirimi: "EUR",
    yetkiliKisi: "Marco Rossi", aktif: true,
  }).returning();

  // ── KDV Oranları ─────────────────────────────────────────────────────────
  await db.insert(kdvOranlari).values([
    { catiFirmaId: lacFirma.id, ad: "KDV %0", oran: "0", varsayilan: false },
    { catiFirmaId: lacFirma.id, ad: "KDV %10", oran: "10", varsayilan: false },
    { catiFirmaId: lacFirma.id, ad: "KDV %20", oran: "20", varsayilan: true },
    { catiFirmaId: agsFirma.id, ad: "KDV %0", oran: "0", varsayilan: false },
    { catiFirmaId: agsFirma.id, ad: "KDV %20", oran: "20", varsayilan: true },
  ]);

  // ── Fatura Serileri ───────────────────────────────────────────────────────
  const [lacSeri] = await db.insert(faturaSerileri).values({
    catiFirmaId: lacFirma.id, ad: "LAC Ana Seri", onek: "LAC",
    sonrakiNo: 8, varsayilan: true,
  }).returning();

  const [agsSeri] = await db.insert(faturaSerileri).values({
    catiFirmaId: agsFirma.id, ad: "AGS Ana Seri", onek: "AGS",
    sonrakiNo: 5, varsayilan: true,
  }).returning();

  // ── Banka Hesapları ───────────────────────────────────────────────────────
  const [lacBankaTry] = await db.insert(bankaHesaplari).values({
    catiFirmaId: lacFirma.id, bankaAdi: "İş Bankası", hesapAdi: "LAC TRY Hesabı",
    iban: "TR34 0006 4000 0011 1234 5600 01", paraBirimi: "TRY",
    subeAdi: "Galata Şubesi", aktif: true,
  }).returning();

  const [lacBankaUsd] = await db.insert(bankaHesaplari).values({
    catiFirmaId: lacFirma.id, bankaAdi: "Garanti BBVA", hesapAdi: "LAC USD Hesabı",
    iban: "TR12 0006 2000 1234 0006 2000 00", paraBirimi: "USD",
    subeAdi: "Karaköy Şubesi", aktif: true,
  }).returning();

  const [lacBankaEur] = await db.insert(bankaHesaplari).values({
    catiFirmaId: lacFirma.id, bankaAdi: "Garanti BBVA", hesapAdi: "LAC EUR Hesabı",
    iban: "TR56 0006 2000 1234 0006 2001 00", paraBirimi: "EUR",
    subeAdi: "Karaköy Şubesi", aktif: true,
  }).returning();

  const [agsBanka] = await db.insert(bankaHesaplari).values({
    catiFirmaId: agsFirma.id, bankaAdi: "Yapı Kredi", hesapAdi: "AGS EUR Hesabı",
    iban: "TR56 0006 7010 0000 1234 5678 90", paraBirimi: "EUR",
    subeAdi: "Konak Şubesi", aktif: true,
  }).returning();

  // ── Gemiler ───────────────────────────────────────────────────────────────
  const [gemiBlueStar] = await db.insert(gemiler).values({
    firmaId: meridian.id, ad: "MV Blue Star",
    imoNumarasi: "IMO9123456", bayrakDevleti: "Malta", aktif: true,
  }).returning();

  const [gemiSunrise] = await db.insert(gemiler).values({
    firmaId: pacificStar.id, ad: "MV Pacific Sunrise",
    imoNumarasi: "IMO9234567", bayrakDevleti: "Panama", aktif: true,
  }).returning();

  const [gemiAtlantis] = await db.insert(gemiler).values({
    firmaId: atlantisFleet.id, ad: "MV Atlantis One",
    imoNumarasi: "IMO9345678", bayrakDevleti: "Greece", aktif: true,
  }).returning();

  const [gemiEuromed] = await db.insert(gemiler).values({
    firmaId: euromedTankers.id, ad: "MT Euromed Spirit",
    imoNumarasi: "IMO9456789", bayrakDevleti: "Italy", aktif: true,
  }).returning();

  // ── Ekipmanlar ────────────────────────────────────────────────────────────
  await db.insert(ekipmanlar).values([
    { catiFirmaId: lacFirma.id, gemiId: gemiBlueStar.id, tip: "Starlink Terminal", seriNo: "SL-2024-001234", kurulumTarihi: "2024-03-15", garantiBitisTarihi: "2027-03-15", aktif: true },
    { catiFirmaId: lacFirma.id, gemiId: gemiBlueStar.id, tip: "Router", seriNo: "RT-2024-005678", kurulumTarihi: "2024-03-15", garantiBitisTarihi: "2026-03-15", aktif: true },
    { catiFirmaId: lacFirma.id, gemiId: gemiSunrise.id, tip: "Starlink Terminal", seriNo: "SL-2024-002345", kurulumTarihi: "2024-06-20", garantiBitisTarihi: "2027-06-20", aktif: true },
    { catiFirmaId: lacFirma.id, gemiId: gemiAtlantis.id, tip: "Starlink Terminal", seriNo: "SL-2023-009876", kurulumTarihi: "2023-10-01", garantiBitisTarihi: "2026-10-01", aktif: true },
    { catiFirmaId: agsFirma.id, gemiId: gemiEuromed.id, tip: "Starlink Terminal", seriNo: "SL-2024-003456", kurulumTarihi: "2024-09-01", garantiBitisTarihi: "2027-09-01", aktif: true },
  ]);

  // ── Faturalar ─────────────────────────────────────────────────────────────
  type FaturaDurum = "acik" | "kismi_odendi" | "odendi" | "iptal";
  const fv = (catiFirmaId: number, bagliFirmaId: number, gemiId: number, seriId: number, no: string, tarih: string, vade: string, pb: string, durum: FaturaDurum, tutar: string, kdv: string, aciklama: string) =>
    ({ catiFirmaId, bagliFirmaId, gemiId, faturaSerisiId: seriId, faturaNo: no, faturaTarihi: tarih, vadeTarihi: vade, paraBirimi: pb, durum, toplamTutar: tutar, kdvTutari: kdv, genelToplam: tutar, aciklama });

  const [fat1] = await db.insert(faturalar).values(fv(lacFirma.id, meridian.id, gemiBlueStar.id, lacSeri.id, "LAC000001", "2026-01-15", "2026-02-15", "USD", "odendi", "1200.00", "0.00", "Ocak 2026 Starlink Hizmet Bedeli - MV Blue Star")).returning();
  const [fat2] = await db.insert(faturalar).values(fv(lacFirma.id, meridian.id, gemiBlueStar.id, lacSeri.id, "LAC000002", "2026-02-15", "2026-03-15", "USD", "odendi", "1200.00", "0.00", "Şubat 2026 Starlink Hizmet Bedeli - MV Blue Star")).returning();
  const [fat3] = await db.insert(faturalar).values(fv(lacFirma.id, meridian.id, gemiBlueStar.id, lacSeri.id, "LAC000003", "2026-03-15", "2026-04-15", "USD", "odendi", "1200.00", "0.00", "Mart 2026 Starlink Hizmet Bedeli - MV Blue Star")).returning();
  const [fat4] = await db.insert(faturalar).values(fv(lacFirma.id, pacificStar.id, gemiSunrise.id, lacSeri.id, "LAC000004", "2026-03-01", "2026-04-01", "USD", "odendi", "750.00", "0.00", "Mart 2026 Starlink Hizmet Bedeli - MV Pacific Sunrise")).returning();
  const [fat5] = await db.insert(faturalar).values(fv(lacFirma.id, pacificStar.id, gemiSunrise.id, lacSeri.id, "LAC000005", "2026-04-01", "2026-05-01", "USD", "kismi_odendi", "750.00", "0.00", "Nisan 2026 Starlink Hizmet Bedeli - MV Pacific Sunrise")).returning();
  const [fat6] = await db.insert(faturalar).values(fv(lacFirma.id, atlantisFleet.id, gemiAtlantis.id, lacSeri.id, "LAC000006", "2026-05-01", "2026-06-01", "EUR", "acik", "2100.00", "0.00", "Mayıs 2026 Starlink Hizmet Bedeli - MV Atlantis One")).returning();
  const [fat7] = await db.insert(faturalar).values(fv(lacFirma.id, atlantisFleet.id, gemiAtlantis.id, lacSeri.id, "LAC000007", "2026-06-01", "2026-07-01", "EUR", "acik", "2100.00", "0.00", "Haziran 2026 Starlink Hizmet Bedeli - MV Atlantis One")).returning();
  const [fat8] = await db.insert(faturalar).values(fv(agsFirma.id, euromedTankers.id, gemiEuromed.id, agsSeri.id, "AGS000001", "2026-03-15", "2026-04-15", "EUR", "odendi", "950.00", "0.00", "Mart 2026 Maritime Pro Hizmet Bedeli - MT Euromed Spirit")).returning();
  const [fat9] = await db.insert(faturalar).values(fv(agsFirma.id, euromedTankers.id, gemiEuromed.id, agsSeri.id, "AGS000002", "2026-04-15", "2026-05-15", "EUR", "acik", "950.00", "0.00", "Nisan 2026 Maritime Pro Hizmet Bedeli - MT Euromed Spirit")).returning();

  // ── Fatura Kalemleri ──────────────────────────────────────────────────────
  for (const [fat, ucret] of [
    [fat1, "1200.00"], [fat2, "1200.00"], [fat3, "1200.00"],
    [fat4, "750.00"], [fat5, "750.00"],
    [fat6, "2100.00"], [fat7, "2100.00"],
    [fat8, "950.00"], [fat9, "950.00"],
  ] as const) {
    await db.insert(faturaKalemleri).values({
      faturaId: fat.id, aciklama: "Starlink Maritime Hizmet Bedeli (1 Ay)",
      miktar: "1", birimFiyat: ucret, kdvOrani: "0",
      araToplam: ucret, kdvTutari: "0.00", genelToplam: ucret,
    });
  }

  // ── Ödemeler ──────────────────────────────────────────────────────────────
  await db.insert(odemeler).values([
    { catiFirmaId: lacFirma.id, bagliFirmaId: meridian.id, gemiId: gemiBlueStar.id, faturaId: fat1.id, bankaHesabiId: lacBankaUsd.id, tip: "tahsilat", tarih: "2026-02-10", tutar: "1200.00", paraBirimi: "USD", odemeYontemi: "banka_havalesi", aciklama: "LAC000001 ödemesi" },
    { catiFirmaId: lacFirma.id, bagliFirmaId: meridian.id, gemiId: gemiBlueStar.id, faturaId: fat2.id, bankaHesabiId: lacBankaUsd.id, tip: "tahsilat", tarih: "2026-03-08", tutar: "1200.00", paraBirimi: "USD", odemeYontemi: "wise", aciklama: "LAC000002 ödemesi" },
    { catiFirmaId: lacFirma.id, bagliFirmaId: meridian.id, gemiId: gemiBlueStar.id, faturaId: fat3.id, bankaHesabiId: lacBankaUsd.id, tip: "tahsilat", tarih: "2026-04-12", tutar: "1200.00", paraBirimi: "USD", odemeYontemi: "banka_havalesi", aciklama: "LAC000003 ödemesi" },
    { catiFirmaId: lacFirma.id, bagliFirmaId: pacificStar.id, gemiId: gemiSunrise.id, faturaId: fat4.id, bankaHesabiId: lacBankaUsd.id, tip: "tahsilat", tarih: "2026-03-28", tutar: "750.00", paraBirimi: "USD", odemeYontemi: "eft", aciklama: "LAC000004 ödemesi" },
    { catiFirmaId: lacFirma.id, bagliFirmaId: pacificStar.id, gemiId: gemiSunrise.id, faturaId: fat5.id, bankaHesabiId: lacBankaUsd.id, tip: "tahsilat", tarih: "2026-05-05", tutar: "400.00", paraBirimi: "USD", odemeYontemi: "banka_havalesi", aciklama: "LAC000005 kısmi ödeme" },
    { catiFirmaId: agsFirma.id, bagliFirmaId: euromedTankers.id, gemiId: gemiEuromed.id, faturaId: fat8.id, bankaHesabiId: agsBanka.id, tip: "tahsilat", tarih: "2026-04-10", tutar: "950.00", paraBirimi: "EUR", odemeYontemi: "banka_havalesi", aciklama: "AGS000001 ödemesi" },
    { catiFirmaId: lacFirma.id, bagliFirmaId: spaceX.id, tip: "odeme", tarih: "2026-06-01", tutar: "3800.00", paraBirimi: "USD", bankaHesabiId: lacBankaUsd.id, odemeYontemi: "kredi_karti", aciklama: "Haziran Starlink hizmet bedeli - 4 terminal" },
  ]);

  // ── Kullanıcılar ──────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash("Admin123!", 12);
  const muhHash = await bcrypt.hash("Muhasebe1!", 12);
  const okHash = await bcrypt.hash("Okuyucu1!", 12);

  const [admin] = await db.insert(kullanicilar).values({
    ad: "Panel Yöneticisi", email: "admin@panel.local",
    parola: adminHash, rol: "yonetici", aktif: true,
  }).returning();

  const [muhasebeciLac] = await db.insert(kullanicilar).values({
    ad: "Lacivert Muhasebeci", email: "muhasebe@laciverts.com",
    parola: muhHash, rol: "muhasebeci", aktif: true,
  }).returning();

  const [okuyucu] = await db.insert(kullanicilar).values({
    ad: "Salt Okunur", email: "okuyucu@panel.local",
    parola: okHash, rol: "salt_okunur", aktif: true,
  }).returning();

  await db.insert(kullaniciFirmalar).values([
    { kullaniciId: admin.id, catiFirmaId: lacFirma.id, rol: "yonetici" },
    { kullaniciId: admin.id, catiFirmaId: agsFirma.id, rol: "yonetici" },
    { kullaniciId: muhasebeciLac.id, catiFirmaId: lacFirma.id, rol: "muhasebeci" },
    { kullaniciId: okuyucu.id, catiFirmaId: lacFirma.id, rol: "salt_okunur" },
    { kullaniciId: okuyucu.id, catiFirmaId: agsFirma.id, rol: "salt_okunur" },
  ]);

  console.log("\n✅ Seed tamamlandi!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Giriş Bilgileri:");
  console.log("  Yönetici  : admin@panel.local     / Admin123!");
  console.log("  Muhasebeci: muhasebe@laciverts.com / Muhasebe1!");
  console.log("  Salt Oku  : okuyucu@panel.local    / Okuyucu1!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
