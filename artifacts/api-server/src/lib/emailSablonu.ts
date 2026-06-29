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
    return new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return t;
  }
}

function formatTutar(tutar: string | number, para: string): string {
  const n = Number(tutar);
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${para}`;
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
  if (/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/i.test(url)) return url;
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
  const isInvoice = belge.tip === "fatura";
  const belgeTipiLabel = isInvoice ? "INVOICE" : "PROFORMA QUOTATION";
  const belgeTipiSubject = isInvoice ? "Invoice" : "Quotation";
  const dosyaAdi = `${isInvoice ? "invoice" : "quotation"}-${belge.no}.pdf`;

  const durumEtiketMap: Record<string, { en: string; bg: string; color: string }> = {
    acik:         { en: "Open",           bg: "#e3f2fd", color: "#1565c0" },
    odendi:       { en: "Paid",           bg: "#e8f5e9", color: "#2e7d32" },
    kismi_odendi: { en: "Partly Paid",    bg: "#fff8e1", color: "#e65100" },
    iptal:        { en: "Cancelled",      bg: "#fce4ec", color: "#b71c1c" },
    taslak:       { en: "Draft",          bg: "#f5f5f5", color: "#616161" },
    gonderildi:   { en: "Sent",           bg: "#e3f2fd", color: "#1565c0" },
    onaylandi:    { en: "Approved",       bg: "#e8f5e9", color: "#2e7d32" },
    reddedildi:   { en: "Rejected",       bg: "#fce4ec", color: "#b71c1c" },
  };
  const durumBilgi = belge.durum ? durumEtiketMap[belge.durum] : null;

  const subject = `${belgeTipiSubject} ${belge.no} — ${firma.ad}`;

  const logDataUrl = await logoBase64(firma.logo);

  const selamlama = alici.ad ? `Dear ${alici.ad},` : "Dear Sir/Madam,";

  let mesajMetin: string;
  if (ozelMesaj) {
    mesajMetin = ozelMesaj.replace(/\n/g, "<br>");
  } else if (isInvoice) {
    const vesselPart = belge.gemiAd ? ` for vessel <strong>${belge.gemiAd}</strong>` : "";
    const duePart = belge.vadeTarihi ? ` payable by <strong>${formatTarih(belge.vadeTarihi)}</strong>` : "";
    mesajMetin = `Please find attached invoice <strong>${belge.no}</strong>${vesselPart}. The total amount due is <strong>${formatTutar(belge.toplamTutar, belge.paraBirimi)}</strong>${duePart}.`;
  } else {
    const vesselPart = belge.gemiAd ? ` regarding vessel <strong>${belge.gemiAd}</strong>` : "";
    mesajMetin = `Please find attached quotation <strong>${belge.no}</strong>${vesselPart}. The total amount is <strong>${formatTutar(belge.toplamTutar, belge.paraBirimi)}</strong>.`;
  }

  const sonTarihLabel = isInvoice ? "Due Date" : "Valid Until";
  const sonTarih = isInvoice ? belge.vadeTarihi : belge.gecerlilikTarihi;

  const footerSatirlar = [
    firma.ad,
    firma.adres,
    [firma.telefon, firma.eposta].filter(Boolean).join("  ·  "),
    firma.vergiNo ? `Tax No: ${firma.vergiNo}${firma.vergiDairesi ? ` — ${firma.vergiDairesi}` : ""}` : null,
  ].filter(Boolean) as string[];

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
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
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border:3px solid #ffed00;background-color:#f8f8f5;">
                    <tr>
                      <td style="padding:12px 24px;">
                        ${logDataUrl
                          ? `<img src="${logDataUrl}" alt="${firma.ad}" style="max-height:56px;max-width:200px;height:auto;display:block;margin:0 auto;" />`
                          : `<p style="margin:0;font-family:Arial,sans-serif;font-size:20px;font-weight:bold;color:#111111;letter-spacing:0.5px;">${firma.ad}</p>`
                        }
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── YELLOW ACCENT STRIPE ── -->
        <tr>
          <td style="background-color:#ffed00;height:4px;font-size:4px;line-height:4px;">&nbsp;</td>
        </tr>

        <!-- ── CARD ── -->
        <tr>
          <td class="card" style="background-color:#ffffff;padding:36px 32px;">

            <!-- Greeting -->
            <p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;">${selamlama}</p>
            <p style="margin:0 0 28px 0;font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;">${mesajMetin}</p>

            <!-- Document card -->
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="belge-tablo"
              style="background-color:#f8f8f8;border-left:4px solid #ffed00;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 20px 8px 20px;">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td>
                        <p style="margin:0 0 4px 0;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;color:#888888;text-transform:uppercase;letter-spacing:0.8px;">${belgeTipiLabel}</p>
                        <p style="margin:0;font-family:Arial,sans-serif;font-size:22px;font-weight:bold;color:#1a1a1a;">${belge.no}</p>
                      </td>
                      ${durumBilgi ? `<td align="right" valign="middle">
                        <span style="display:inline-block;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;background-color:${durumBilgi.bg};color:${durumBilgi.color};padding:4px 10px;border-radius:3px;white-space:nowrap;">${durumBilgi.en}</span>
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
                        <span style="display:block;font-weight:bold;color:#1a1a1a;margin-bottom:2px;">Date</span>
                        ${formatTarih(belge.tarih)}
                      </td>
                      ${sonTarih ? `<td style="padding-right:24px;padding-bottom:8px;font-family:Arial,sans-serif;font-size:12px;color:#555555;white-space:nowrap;">
                        <span style="display:block;font-weight:bold;color:#1a1a1a;margin-bottom:2px;">${sonTarihLabel}</span>
                        ${formatTarih(sonTarih)}
                      </td>` : ""}
                      <td style="padding-bottom:8px;font-family:Arial,sans-serif;font-size:12px;color:#555555;white-space:nowrap;">
                        <span style="display:block;font-weight:bold;color:#1a1a1a;margin-bottom:2px;">Total</span>
                        <span style="font-size:14px;font-weight:bold;color:#1a1a1a;">${formatTutar(belge.toplamTutar, belge.paraBirimi)}</span>
                      </td>
                    </tr>
                    ${belge.gemiAd ? `<tr><td colspan="3" style="padding-top:4px;font-family:Arial,sans-serif;font-size:12px;color:#555555;">
                      <span style="font-weight:bold;color:#1a1a1a;">Vessel:</span> ${belge.gemiAd}
                    </td></tr>` : ""}
                  </table>
                </td>
              </tr>
            </table>

            <!-- Attachment note -->
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
              <tr>
                <td style="background-color:#fffde7;border:1px solid #ffed00;padding:14px 18px;font-family:Arial,sans-serif;font-size:13px;color:#5a4d00;">
                  The document <strong>${dosyaAdi}</strong> is attached to this email as a PDF file.
                </td>
              </tr>
            </table>

            <!-- Closing -->
            <p style="margin:0 0 6px 0;font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">Kind regards,</p>
            <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#1a1a1a;">${firma.ad}</p>

          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background-color:#1a1a1a;padding:20px 32px;">
            ${footerSatirlar.map((s, i) =>
              `<p style="margin:${i > 0 ? "4px 0 0 0" : "0"};font-family:Arial,sans-serif;font-size:${i === 0 ? "12px;font-weight:bold;color:#ffffff" : "11px;color:#999999"};">${s}</p>`
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

  const textSonTarih = sonTarih ? `${sonTarihLabel}: ${formatTarih(sonTarih)}` : null;

  let textMesaj: string;
  if (ozelMesaj) {
    textMesaj = ozelMesaj;
  } else if (isInvoice) {
    const vesselPart = belge.gemiAd ? ` for vessel ${belge.gemiAd}` : "";
    const duePart = belge.vadeTarihi ? ` payable by ${formatTarih(belge.vadeTarihi)}` : "";
    textMesaj = `Please find attached invoice ${belge.no}${vesselPart}. The total amount due is ${formatTutar(belge.toplamTutar, belge.paraBirimi)}${duePart}.`;
  } else {
    const vesselPart = belge.gemiAd ? ` regarding vessel ${belge.gemiAd}` : "";
    textMesaj = `Please find attached quotation ${belge.no}${vesselPart}. The total amount is ${formatTutar(belge.toplamTutar, belge.paraBirimi)}.`;
  }

  const text = [
    selamlama,
    "",
    textMesaj,
    "",
    `${belgeTipiSubject}: ${belge.no}`,
    `Date: ${formatTarih(belge.tarih)}`,
    textSonTarih,
    `Total: ${formatTutar(belge.toplamTutar, belge.paraBirimi)}`,
    belge.gemiAd ? `Vessel: ${belge.gemiAd}` : null,
    "",
    "Kind regards,",
    firma.ad,
    firma.adres ?? null,
    [firma.telefon, firma.eposta].filter(Boolean).join("  |  ") || null,
  ].filter(s => s !== null).join("\n");

  return { subject, html, text };
}
