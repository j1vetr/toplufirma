export interface EmailFirmaData {
  ad: string;
  logo?: string | null;
  adres?: string | null;
  telefon?: string | null;
  eposta?: string | null;
  vergiNo?: string | null;
  vergiDairesi?: string | null;
}

export interface EmailBelgeData {
  tip: "fatura" | "teklif";
  no: string;
  tarih: string;
  vadeTarihi?: string | null;
  gecerlilikTarihi?: string | null;
  toplamTutar: string | number;
  kdvTutari?: string | number | null;
  paraBirimi: string;
  gemiAd?: string | null;
  durum?: string | null;
}

export interface EmailAliciData {
  ad?: string | null;
  eposta: string;
}

function formatTarih(t: string | null | undefined): string {
  if (!t) return "";
  try {
    return new Date(t).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return t;
  }
}

function formatTutar(tutar: string | number, para: string): string {
  const n = Number(tutar);
  return `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${para}`;
}

const PRIVATE_IP_RE = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1$|fc00:|fd|fe80:)/i;
const ALLOWED_IMAGE_CT = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]);
const MAX_LOGO_BYTES = 512 * 1024;

function isLogoUrlAllowed(raw: string): boolean {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return false; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (PRIVATE_IP_RE.test(host)) return false;
  return true;
}

async function logoBase64(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (!isLogoUrlAllowed(url)) return null;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!resp.ok) return null;
    const ct = (resp.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!ALLOWED_IMAGE_CT.has(ct)) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.byteLength > MAX_LOGO_BYTES) return null;
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function emailSablonuOlustur(
  firma: EmailFirmaData,
  belge: EmailBelgeData,
  alici: EmailAliciData,
  ozelMesaj?: string | null,
): Promise<{ subject: string; html: string; text: string }> {
  const isPDF = belge.tip === "fatura";
  const belgeTipiTR = isPDF ? "Fatura" : "Teklif";
  const belgeTipiEN = isPDF ? "Invoice" : "PROFORMA QUOTATION";

  const durumEtiketMap: Record<string, { tr: string; bg: string; color: string }> = {
    acik:         { tr: "Açık",          bg: "#e3f2fd", color: "#1565c0" },
    odendi:       { tr: "Ödendi",        bg: "#e8f5e9", color: "#2e7d32" },
    kismi_odendi: { tr: "Kısmi Ödendi",  bg: "#fff8e1", color: "#e65100" },
    iptal:        { tr: "İptal",         bg: "#fce4ec", color: "#b71c1c" },
    taslak:       { tr: "Taslak",        bg: "#f5f5f5", color: "#616161" },
    gonderildi:   { tr: "Gönderildi",    bg: "#e3f2fd", color: "#1565c0" },
    onaylandi:    { tr: "Onaylandı",     bg: "#e8f5e9", color: "#2e7d32" },
    reddedildi:   { tr: "Reddedildi",   bg: "#fce4ec", color: "#b71c1c" },
  };
  const durumBilgi = belge.durum ? durumEtiketMap[belge.durum] : null;
  const dosyaAdi = `${belgeTipiTR.toLowerCase()}-${belge.no}.pdf`;

  const subject = `${belgeTipiTR} ${belge.no} — ${firma.ad}`;

  const logDataUrl = await logoBase64(firma.logo);

  const selamlama = alici.ad ? `Sayın ${alici.ad},` : "Merhaba,";
  const mesaj = ozelMesaj
    ? ozelMesaj.replace(/\n/g, "<br>")
    : `Ekte <strong>${belge.no}</strong> numaralı ${belgeTipiTR.toLowerCase()}yi bulabilirsiniz.`;

  const sonTarihLabel = isPDF ? "Vade Tarihi" : "Geçerlilik Tarihi";
  const sonTarih = isPDF ? belge.vadeTarihi : belge.gecerlilikTarihi;

  const footerSatirlar = [
    firma.ad,
    firma.adres,
    [firma.telefon, firma.eposta].filter(Boolean).join("  ·  "),
    firma.vergiNo ? `Vergi No: ${firma.vergiNo}${firma.vergiDairesi ? ` — ${firma.vergiDairesi}` : ""}` : null,
  ].filter(Boolean) as string[];

  const html = `<!DOCTYPE html>
<html lang="tr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<title>${subject}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
  body { margin: 0 !important; padding: 0 !important; background-color: #f0f0f0; }
  @media only screen and (max-width: 600px) {
    .wrapper { width: 100% !important; }
    .card { padding: 24px 16px !important; }
    .belge-tablo td { display: block; width: 100% !important; padding-bottom: 8px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f0f0f0;">

<!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f0f0f0;"><tr><td><![endif]-->

<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f0f0f0;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600"><tr><td><![endif]-->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="wrapper" style="max-width:600px;width:100%;">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background-color:#000000;padding:28px 32px 0 32px;border-radius:0;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center" style="padding-bottom:24px;">
                  ${logDataUrl
                    ? `<img src="${logDataUrl}" alt="${firma.ad}" style="max-height:56px;max-width:220px;height:auto;display:block;margin:0 auto;" />`
                    : `<p style="margin:0;font-family:Arial,sans-serif;font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;">${firma.ad}</p>`
                  }
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── SARI AKSAN ŞERİDİ ── -->
        <tr>
          <td style="background-color:#ffed00;height:4px;font-size:4px;line-height:4px;">&nbsp;</td>
        </tr>

        <!-- ── KART ── -->
        <tr>
          <td class="card" style="background-color:#ffffff;padding:36px 32px;">

            <!-- Selamlama -->
            <p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;">${selamlama}</p>
            <p style="margin:0 0 28px 0;font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;">${mesaj}</p>

            <!-- Belge kartı -->
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="belge-tablo"
              style="background-color:#f8f8f8;border-left:4px solid #ffed00;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 20px 8px 20px;">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td>
                        <p style="margin:0 0 4px 0;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;color:#888888;text-transform:uppercase;letter-spacing:0.8px;">${belgeTipiEN}</p>
                        <p style="margin:0;font-family:Arial,sans-serif;font-size:22px;font-weight:bold;color:#1a1a1a;">${belge.no}</p>
                      </td>
                      ${durumBilgi ? `<td align="right" valign="middle">
                        <span style="display:inline-block;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;background-color:${durumBilgi.bg};color:${durumBilgi.color};padding:4px 10px;border-radius:3px;white-space:nowrap;">${durumBilgi.tr}</span>
                      </td>` : ""}
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 20px 20px 20px;">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="padding-right:24px;padding-bottom:8px;font-family:Arial,sans-serif;font-size:12px;color:#555555;white-space:nowrap;">
                        <span style="display:block;font-weight:bold;color:#1a1a1a;margin-bottom:2px;">Tarih</span>
                        ${formatTarih(belge.tarih)}
                      </td>
                      ${sonTarih ? `<td style="padding-right:24px;padding-bottom:8px;font-family:Arial,sans-serif;font-size:12px;color:#555555;white-space:nowrap;">
                        <span style="display:block;font-weight:bold;color:#1a1a1a;margin-bottom:2px;">${sonTarihLabel}</span>
                        ${formatTarih(sonTarih)}
                      </td>` : ""}
                      <td style="padding-bottom:8px;font-family:Arial,sans-serif;font-size:12px;color:#555555;white-space:nowrap;">
                        <span style="display:block;font-weight:bold;color:#1a1a1a;margin-bottom:2px;">Toplam</span>
                        <span style="font-size:14px;font-weight:bold;color:#1a1a1a;">${formatTutar(belge.toplamTutar, belge.paraBirimi)}</span>
                      </td>
                    </tr>
                    ${belge.gemiAd ? `<tr><td colspan="3" style="padding-top:4px;font-family:Arial,sans-serif;font-size:12px;color:#555555;">
                      <span style="font-weight:bold;color:#1a1a1a;">Gemi:</span> ${belge.gemiAd}
                    </td></tr>` : ""}
                  </table>
                </td>
              </tr>
            </table>

            <!-- PDF notu -->
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
              <tr>
                <td style="background-color:#fffde7;border:1px solid #ffed00;padding:14px 18px;font-family:Arial,sans-serif;font-size:13px;color:#5a4d00;">
                  📎 Bu e-postaya <strong>${dosyaAdi}</strong> adlı PDF belgesi ek olarak eklenmiştir.
                </td>
              </tr>
            </table>

            <!-- Kapanış -->
            <p style="margin:0 0 6px 0;font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">Saygılarımızla,</p>
            <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#1a1a1a;">${firma.ad}</p>

          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background-color:#1a1a1a;padding:20px 32px;">
            ${footerSatirlar.map((s, i) =>
              `<p style="margin:0${i > 0 ? " 0 0 0;margin-top:4px" : ""};font-family:Arial,sans-serif;font-size:${i === 0 ? "12px;font-weight:bold;color:#ffffff" : "11px;color:#999999"};">${s}</p>`
            ).join("\n            ")}
          </td>
        </tr>

      </table>
      <!--[if mso | IE]></td></tr></table><![endif]-->

    </td>
  </tr>
</table>

<!--[if mso | IE]></td></tr></table><![endif]-->

</body>
</html>`;

  const text = [
    selamlama,
    "",
    ozelMesaj ?? `Ekte ${belge.no} numaralı ${belgeTipiTR.toLowerCase()}yi bulabilirsiniz.`,
    "",
    `${belgeTipiEN}: ${belge.no}`,
    `Tarih: ${formatTarih(belge.tarih)}`,
    sonTarih ? `${sonTarihLabel}: ${formatTarih(sonTarih)}` : null,
    `Toplam: ${formatTutar(belge.toplamTutar, belge.paraBirimi)}`,
    belge.gemiAd ? `Gemi: ${belge.gemiAd}` : null,
    "",
    "Saygılarımızla,",
    firma.ad,
    firma.adres ?? null,
    [firma.telefon, firma.eposta].filter(Boolean).join("  |  ") || null,
  ].filter(s => s !== null).join("\n");

  return { subject, html, text };
}
