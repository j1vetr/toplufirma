import { Router } from "express";
import { spawn } from "child_process";
import { requireYonetici } from "../middleware/auth";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/admin/yedek", requireYonetici, (_req, res) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { res.status(500).json({ error: "DATABASE_URL bulunamadı" }); return; }

  const now = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="yedek-${now}.sql"`);

  const pg = spawn("pg_dump", ["--no-password", "--format=plain", dbUrl], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  pg.stdout.pipe(res);
  pg.stderr.on("data", (d) => console.error("[pg_dump stderr]", d.toString()));
  pg.on("error", (err) => {
    console.error("[pg_dump] spawn error:", err);
    if (!res.headersSent) res.status(500).json({ error: "pg_dump çalıştırılamadı: " + err.message });
  });
  pg.on("close", (code) => {
    if (code !== 0 && !res.writableEnded) res.end();
  });
});

router.post(
  "/admin/yedek-yukle",
  requireYonetici,
  (req, res, next) => {
    let rawBody = Buffer.alloc(0);
    req.on("data", (chunk: Buffer) => { rawBody = Buffer.concat([rawBody, chunk]); });
    req.on("end", () => { (req as unknown as { rawBody: Buffer }).rawBody = rawBody; next(); });
    req.on("error", next);
  },
  (req, res) => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) { res.status(500).json({ error: "DATABASE_URL bulunamadı" }); return; }

    const body = (req as unknown as { rawBody: Buffer }).rawBody;
    if (!body?.length) { res.status(400).json({ error: "Dosya içeriği boş" }); return; }

    const psql = spawn("psql", ["--no-password", dbUrl], { stdio: ["pipe", "pipe", "pipe"] });
    psql.stdin.write(body);
    psql.stdin.end();

    let stderr = "";
    psql.stderr.on("data", (d) => { stderr += d.toString(); });
    psql.on("error", (err) => {
      if (!res.headersSent) res.status(500).json({ error: "psql çalıştırılamadı: " + err.message });
    });
    psql.on("close", (code) => {
      if (res.headersSent) return;
      if (code === 0) {
        res.json({ ok: true, mesaj: "Yedek başarıyla içe aktarıldı" });
      } else {
        res.status(500).json({ error: `psql hata kodu: ${code}`, detay: stderr.slice(-800) });
      }
    });
  }
);

router.post("/admin/tum-verileri-sil", requireYonetici, async (req, res) => {
  try {
    const { onay } = req.body as { onay?: string };
    if (onay !== "EVET_SIL") {
      res.status(400).json({ error: 'Onay kodu yanlış. "EVET_SIL" yazmanız gerekiyor.' });
      return;
    }

    await db.execute(sql`
      TRUNCATE TABLE
        fatura_kalemleri,
        odemeler,
        tekrarlayan_fatura_kalemleri,
        tekrarlayan_faturalar,
        faturalar,
        ekipmanlar,
        banka_hesaplari,
        firma_eposta_ayarlari,
        kdv_oranlari,
        fatura_serileri,
        gemiler,
        firmalar
      RESTART IDENTITY CASCADE
    `);

    res.json({ ok: true, mesaj: "Tüm iş verileri başarıyla silindi. Kullanıcılar korundu." });
  } catch (err) {
    console.error("[admin] tum-verileri-sil error:", err);
    res.status(500).json({ error: "Veriler silinirken hata oluştu" });
  }
});

export default router;
