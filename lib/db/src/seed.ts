import { db } from "./index";
import {
  sirketler, cariler, gemiler, bankaHesaplari, kdvOranlari,
  faturaSerileri, faturalar, faturaKalemleri, odemeler, starlinkPlanlari, ekipmanlar,
} from "./schema";

async function seed() {
  console.log("Seed basliyor...");

  await db.delete(odemeler);
  await db.delete(faturaKalemleri);
  await db.delete(faturalar);
  await db.delete(starlinkPlanlari);
  await db.delete(ekipmanlar);
  await db.delete(faturaSerileri);
  await db.delete(kdvOranlari);
  await db.delete(bankaHesaplari);
  await db.delete(gemiler);
  await db.delete(cariler);
  await db.delete(sirketler);

  // Sirketler
  const [lacSirket] = await db.insert(sirketler).values({
    ad: "LAC Maritime Starlink Ltd.", vergiNo: "1234567890",
    vergiDairesi: "Galata VD", adres: "Karakoy Cad. No:5, Istanbul",
    telefon: "+90 212 555 0101", eposta: "info@lacmaritime.com",
    seriOneki: "LAC", aktif: true,
  }).returning();

  const [asSirket] = await db.insert(sirketler).values({
    ad: "AkdenizSat Telekomunikasyon A.S.", vergiNo: "9876543210",
    vergiDairesi: "Izmir VD", adres: "Konak Mah. Ataturk Blv. No:12, Izmir",
    telefon: "+90 232 555 0202", eposta: "info@akdenizsat.com",
    seriOneki: "AKS", aktif: true,
  }).returning();

  // KDV Oranlari
  await db.insert(kdvOranlari).values([
    { sirketId: lacSirket.id, ad: "KDV %0", oran: "0", varsayilan: false },
    { sirketId: lacSirket.id, ad: "KDV %10", oran: "10", varsayilan: false },
    { sirketId: lacSirket.id, ad: "KDV %20", oran: "20", varsayilan: true },
    { sirketId: asSirket.id, ad: "KDV %0", oran: "0", varsayilan: false },
    { sirketId: asSirket.id, ad: "KDV %20", oran: "20", varsayilan: true },
  ]);

  // Fatura Serileri
  const [lacSeri] = await db.insert(faturaSerileri).values({
    sirketId: lacSirket.id, ad: "LAC Ana Seri", onek: "LAC",
    sonrakiNo: 8, varsayilan: true,
  }).returning();

  const [aksSeri] = await db.insert(faturaSerileri).values({
    sirketId: asSirket.id, ad: "AKS Ana Seri", onek: "AKS",
    sonrakiNo: 5, varsayilan: true,
  }).returning();

  // Banka Hesaplari
  const [lacBanka1] = await db.insert(bankaHesaplari).values({
    sirketId: lacSirket.id, bankaAdi: "Garanti BBVA", hesapAdi: "LAC USD Hesabi",
    iban: "TR12 0006 2000 1234 0006 2000 00", paraBirimi: "USD",
    subeAdi: "Karakoy Subesi", aktif: true,
  }).returning();

  const [lacBanka2] = await db.insert(bankaHesaplari).values({
    sirketId: lacSirket.id, bankaAdi: "Is Bankasi", hesapAdi: "LAC TRY Hesabi",
    iban: "TR34 0006 4000 0011 1234 5600 01", paraBirimi: "TRY",
    subeAdi: "Galata Subesi", aktif: true,
  }).returning();

  const [aksBanka] = await db.insert(bankaHesaplari).values({
    sirketId: asSirket.id, bankaAdi: "Yapi Kredi", hesapAdi: "AKS EUR Hesabi",
    iban: "TR56 0006 7010 0000 1234 5678 90", paraBirimi: "EUR",
    subeAdi: "Konak Subesi", aktif: true,
  }).returning();

  // Cariler
  const [meridian] = await db.insert(cariler).values({
    sirketId: lacSirket.id, ad: "Meridian Shipping Co.", tip: "gemi_sahibi",
    vergiNo: "US-789012345", telefon: "+1 212 555 0301",
    eposta: "ops@meridianshipping.com", paraBirimi: "USD",
    yetkiliKisi: "James Wilson", aktif: true,
  }).returning();

  const [pacificStar] = await db.insert(cariler).values({
    sirketId: lacSirket.id, ad: "Pacific Star Lines", tip: "musteri",
    vergiNo: "HK-456789012", telefon: "+852 2555 0401",
    eposta: "billing@pacificstarlines.com", paraBirimi: "USD",
    yetkiliKisi: "Chen Wei", aktif: true,
  }).returning();

  const [atlantisFleet] = await db.insert(cariler).values({
    sirketId: lacSirket.id, ad: "Atlantis Fleet Management", tip: "musteri",
    vergiNo: "GR-123456789", telefon: "+30 210 555 0501",
    eposta: "info@atlantisfleet.gr", paraBirimi: "EUR",
    yetkiliKisi: "Nikolaos Papadopoulos", aktif: true,
  }).returning();

  const [spaceX] = await db.insert(cariler).values({
    sirketId: lacSirket.id, ad: "Starlink / SpaceX", tip: "tedarikci",
    vergiNo: "US-000000001", telefon: "+1 310 555 0001",
    eposta: "maritime@starlink.com", paraBirimi: "USD",
    aktif: true,
  }).returning();

  const [aksMusteri1] = await db.insert(cariler).values({
    sirketId: asSirket.id, ad: "Euromed Tankers S.A.", tip: "musteri",
    vergiNo: "IT-987654321", telefon: "+39 06 555 0601",
    eposta: "fleet@euromedtankers.it", paraBirimi: "EUR",
    yetkiliKisi: "Marco Rossi", aktif: true,
  }).returning();

  // Gemiler
  const [gemiBlueStar] = await db.insert(gemiler).values({
    cariId: meridian.id, ad: "MV Blue Star",
    imoNumarasi: "IMO9123456", bayrakDevleti: "Malta", aktif: true,
  }).returning();

  const [gemiSunrise] = await db.insert(gemiler).values({
    cariId: pacificStar.id, ad: "MV Pacific Sunrise",
    imoNumarasi: "IMO9234567", bayrakDevleti: "Panama", aktif: true,
  }).returning();

  const [gemiAtlantis] = await db.insert(gemiler).values({
    cariId: atlantisFleet.id, ad: "MV Atlantis One",
    imoNumarasi: "IMO9345678", bayrakDevleti: "Greece", aktif: true,
  }).returning();

  const [gemiEuromed] = await db.insert(gemiler).values({
    cariId: aksMusteri1.id, ad: "MT Euromed Spirit",
    imoNumarasi: "IMO9456789", bayrakDevleti: "Italy", aktif: true,
  }).returning();

  // Starlink Planlari
  await db.insert(starlinkPlanlari).values([
    {
      sirketId: lacSirket.id, cariId: meridian.id, gemiId: gemiBlueStar.id,
      planAdi: "Maritime Priority", hizMbps: 220,
      baslangicTarihi: "2026-01-01", bitisTarihi: "2026-07-10",
      aylikUcret: "1200.00", paraBirimi: "USD", otomatikYenileme: true, aktif: true,
    },
    {
      sirketId: lacSirket.id, cariId: pacificStar.id, gemiId: gemiSunrise.id,
      planAdi: "Maritime Standard", hizMbps: 100,
      baslangicTarihi: "2026-02-01", bitisTarihi: "2026-08-01",
      aylikUcret: "750.00", paraBirimi: "USD", otomatikYenileme: true, aktif: true,
    },
    {
      sirketId: lacSirket.id, cariId: atlantisFleet.id, gemiId: gemiAtlantis.id,
      planAdi: "Maritime Elite", hizMbps: 350,
      baslangicTarihi: "2025-10-01", bitisTarihi: "2026-09-30",
      aylikUcret: "2100.00", paraBirimi: "EUR", otomatikYenileme: false, aktif: true,
    },
    {
      sirketId: asSirket.id, cariId: aksMusteri1.id, gemiId: gemiEuromed.id,
      planAdi: "Maritime Pro", hizMbps: 150,
      baslangicTarihi: "2026-03-01", bitisTarihi: "2026-06-28",
      aylikUcret: "950.00", paraBirimi: "EUR", otomatikYenileme: true, aktif: true,
    },
  ]);

  // Ekipmanlar
  await db.insert(ekipmanlar).values([
    {
      sirketId: lacSirket.id, gemiId: gemiBlueStar.id, tip: "Starlink Terminal",
      seriNo: "SL-2024-001234", kurulumTarihi: "2024-03-15",
      garantiBitisTarihi: "2027-03-15", aktif: true,
    },
    {
      sirketId: lacSirket.id, gemiId: gemiBlueStar.id, tip: "Router",
      seriNo: "RT-2024-005678", kurulumTarihi: "2024-03-15",
      garantiBitisTarihi: "2026-03-15", aktif: true,
    },
    {
      sirketId: lacSirket.id, gemiId: gemiSunrise.id, tip: "Starlink Terminal",
      seriNo: "SL-2024-002345", kurulumTarihi: "2024-06-20",
      garantiBitisTarihi: "2027-06-20", aktif: true,
    },
    {
      sirketId: lacSirket.id, gemiId: gemiAtlantis.id, tip: "Starlink Terminal",
      seriNo: "SL-2023-009876", kurulumTarihi: "2023-10-01",
      garantiBitisTarihi: "2026-10-01", aktif: true,
    },
    {
      sirketId: asSirket.id, gemiId: gemiEuromed.id, tip: "Starlink Terminal",
      seriNo: "SL-2024-003456", kurulumTarihi: "2024-09-01",
      garantiBitisTarihi: "2027-09-01", aktif: true,
    },
  ]);

  // Faturalar
  const [fat1] = await db.insert(faturalar).values({
    sirketId: lacSirket.id, cariId: meridian.id, gemiId: gemiBlueStar.id,
    faturaSerisiId: lacSeri.id, faturaNo: "LAC000001",
    faturaTarihi: "2026-01-15", vadeTarihi: "2026-02-15",
    paraBirimi: "USD", durum: "odendi",
    toplamTutar: "1200.00", kdvTutari: "0.00", genelToplam: "1200.00",
    aciklama: "Ocak 2026 Starlink Hizmet Bedeli - MV Blue Star",
  }).returning();

  const [fat2] = await db.insert(faturalar).values({
    sirketId: lacSirket.id, cariId: meridian.id, gemiId: gemiBlueStar.id,
    faturaSerisiId: lacSeri.id, faturaNo: "LAC000002",
    faturaTarihi: "2026-02-15", vadeTarihi: "2026-03-15",
    paraBirimi: "USD", durum: "odendi",
    toplamTutar: "1200.00", kdvTutari: "0.00", genelToplam: "1200.00",
    aciklama: "Subat 2026 Starlink Hizmet Bedeli - MV Blue Star",
  }).returning();

  const [fat3] = await db.insert(faturalar).values({
    sirketId: lacSirket.id, cariId: meridian.id, gemiId: gemiBlueStar.id,
    faturaSerisiId: lacSeri.id, faturaNo: "LAC000003",
    faturaTarihi: "2026-03-15", vadeTarihi: "2026-04-15",
    paraBirimi: "USD", durum: "odendi",
    toplamTutar: "1200.00", kdvTutari: "0.00", genelToplam: "1200.00",
    aciklama: "Mart 2026 Starlink Hizmet Bedeli - MV Blue Star",
  }).returning();

  const [fat4] = await db.insert(faturalar).values({
    sirketId: lacSirket.id, cariId: pacificStar.id, gemiId: gemiSunrise.id,
    faturaSerisiId: lacSeri.id, faturaNo: "LAC000004",
    faturaTarihi: "2026-03-01", vadeTarihi: "2026-04-01",
    paraBirimi: "USD", durum: "odendi",
    toplamTutar: "750.00", kdvTutari: "0.00", genelToplam: "750.00",
    aciklama: "Mart 2026 Starlink Hizmet Bedeli - MV Pacific Sunrise",
  }).returning();

  const [fat5] = await db.insert(faturalar).values({
    sirketId: lacSirket.id, cariId: pacificStar.id, gemiId: gemiSunrise.id,
    faturaSerisiId: lacSeri.id, faturaNo: "LAC000005",
    faturaTarihi: "2026-04-01", vadeTarihi: "2026-05-01",
    paraBirimi: "USD", durum: "kismi_odendi",
    toplamTutar: "750.00", kdvTutari: "0.00", genelToplam: "750.00",
    aciklama: "Nisan 2026 Starlink Hizmet Bedeli - MV Pacific Sunrise",
  }).returning();

  const [fat6] = await db.insert(faturalar).values({
    sirketId: lacSirket.id, cariId: atlantisFleet.id, gemiId: gemiAtlantis.id,
    faturaSerisiId: lacSeri.id, faturaNo: "LAC000006",
    faturaTarihi: "2026-05-01", vadeTarihi: "2026-06-01",
    paraBirimi: "EUR", durum: "acik",
    toplamTutar: "2100.00", kdvTutari: "0.00", genelToplam: "2100.00",
    aciklama: "Mayis 2026 Starlink Hizmet Bedeli - MV Atlantis One",
  }).returning();

  const [fat7] = await db.insert(faturalar).values({
    sirketId: lacSirket.id, cariId: atlantisFleet.id, gemiId: gemiAtlantis.id,
    faturaSerisiId: lacSeri.id, faturaNo: "LAC000007",
    faturaTarihi: "2026-06-01", vadeTarihi: "2026-07-01",
    paraBirimi: "EUR", durum: "acik",
    toplamTutar: "2100.00", kdvTutari: "0.00", genelToplam: "2100.00",
    aciklama: "Haziran 2026 Starlink Hizmet Bedeli - MV Atlantis One",
  }).returning();

  const [fat8] = await db.insert(faturalar).values({
    sirketId: asSirket.id, cariId: aksMusteri1.id, gemiId: gemiEuromed.id,
    faturaSerisiId: aksSeri.id, faturaNo: "AKS000001",
    faturaTarihi: "2026-03-15", vadeTarihi: "2026-04-15",
    paraBirimi: "EUR", durum: "odendi",
    toplamTutar: "950.00", kdvTutari: "0.00", genelToplam: "950.00",
    aciklama: "Mart 2026 Maritime Pro Hizmet Bedeli - MT Euromed Spirit",
  }).returning();

  const [fat9] = await db.insert(faturalar).values({
    sirketId: asSirket.id, cariId: aksMusteri1.id, gemiId: gemiEuromed.id,
    faturaSerisiId: aksSeri.id, faturaNo: "AKS000002",
    faturaTarihi: "2026-04-15", vadeTarihi: "2026-05-15",
    paraBirimi: "EUR", durum: "acik",
    toplamTutar: "950.00", kdvTutari: "0.00", genelToplam: "950.00",
    aciklama: "Nisan 2026 Maritime Pro Hizmet Bedeli - MT Euromed Spirit",
  }).returning();

  // Fatura Kalemleri
  for (const [fat, ucret, pb] of [
    [fat1, "1200.00", "USD"], [fat2, "1200.00", "USD"], [fat3, "1200.00", "USD"],
    [fat4, "750.00", "USD"], [fat5, "750.00", "USD"],
    [fat6, "2100.00", "EUR"], [fat7, "2100.00", "EUR"],
    [fat8, "950.00", "EUR"], [fat9, "950.00", "EUR"],
  ] as const) {
    await db.insert(faturaKalemleri).values({
      faturaId: fat.id,
      aciklama: "Starlink Maritime Hizmet Bedeli (1 Ay)",
      miktar: "1", birimFiyat: ucret, kdvOrani: "0",
      araToplam: ucret, kdvTutari: "0.00", genelToplam: ucret,
    });
  }

  // Odemeler
  await db.insert(odemeler).values([
    {
      sirketId: lacSirket.id, cariId: meridian.id, gemiId: gemiBlueStar.id,
      faturaId: fat1.id, bankaHesabiId: lacBanka1.id,
      tip: "tahsilat", tarih: "2026-02-10", tutar: "1200.00", paraBirimi: "USD",
      odemeYontemi: "banka_havalesi", aciklama: "LAC000001 odemesi",
    },
    {
      sirketId: lacSirket.id, cariId: meridian.id, gemiId: gemiBlueStar.id,
      faturaId: fat2.id, bankaHesabiId: lacBanka1.id,
      tip: "tahsilat", tarih: "2026-03-08", tutar: "1200.00", paraBirimi: "USD",
      odemeYontemi: "wise", aciklama: "LAC000002 odemesi",
    },
    {
      sirketId: lacSirket.id, cariId: meridian.id, gemiId: gemiBlueStar.id,
      faturaId: fat3.id, bankaHesabiId: lacBanka1.id,
      tip: "tahsilat", tarih: "2026-04-12", tutar: "1200.00", paraBirimi: "USD",
      odemeYontemi: "banka_havalesi", aciklama: "LAC000003 odemesi",
    },
    {
      sirketId: lacSirket.id, cariId: pacificStar.id, gemiId: gemiSunrise.id,
      faturaId: fat4.id, bankaHesabiId: lacBanka1.id,
      tip: "tahsilat", tarih: "2026-03-28", tutar: "750.00", paraBirimi: "USD",
      odemeYontemi: "eft", aciklama: "LAC000004 odemesi",
    },
    {
      sirketId: lacSirket.id, cariId: pacificStar.id, gemiId: gemiSunrise.id,
      faturaId: fat5.id, bankaHesabiId: lacBanka1.id,
      tip: "tahsilat", tarih: "2026-05-05", tutar: "400.00", paraBirimi: "USD",
      odemeYontemi: "banka_havalesi", aciklama: "LAC000005 kismi odeme",
    },
    {
      sirketId: asSirket.id, cariId: aksMusteri1.id, gemiId: gemiEuromed.id,
      faturaId: fat8.id, bankaHesabiId: aksBanka.id,
      tip: "tahsilat", tarih: "2026-04-10", tutar: "950.00", paraBirimi: "EUR",
      odemeYontemi: "banka_havalesi", aciklama: "AKS000001 odemesi",
    },
    {
      sirketId: lacSirket.id, cariId: spaceX.id,
      tip: "odeme", tarih: "2026-06-01", tutar: "3800.00", paraBirimi: "USD",
      bankaHesabiId: lacBanka1.id,
      odemeYontemi: "kredi_karti", aciklama: "Haziran Starlink hizmet bedeli - 4 terminal",
    },
  ]);

  console.log("Seed tamamlandi!");
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
