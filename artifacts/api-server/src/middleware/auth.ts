import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET ortam değişkeni üretim ortamında zorunludur");
  }
  console.warn("[auth] JWT_SECRET ayarlanmamış — yalnızca geliştirme ortamında güvenli değil");
}

export const JWT_SECRET = process.env.JWT_SECRET ?? "panel-dev-secret-change-in-production";

export interface TokenPayload {
  id: number;
  email: string;
  ad: string;
  rol: string;
  sirketler: Array<{ sirketId: number; rol: string }>;
}

declare global {
  namespace Express {
    interface Request {
      kullanici?: TokenPayload;
      izinliSirketler?: number[];
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  const tokenFromHeader = authHeader?.replace("Bearer ", "").trim();
  const tokenFromQuery = typeof req.query?.t === "string" ? req.query.t : undefined;
  const token = tokenFromHeader || tokenFromQuery;

  if (!token) {
    res.status(401).json({ error: "Kimlik doğrulama gerekli" });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.kullanici = payload;
    req.izinliSirketler = payload.sirketler.map((s) => s.sirketId);
    next();
  } catch {
    res.status(401).json({ error: "Geçersiz veya süresi dolmuş token" });
  }
}

export function requireYonetici(req: Request, res: Response, next: NextFunction): void {
  if (!req.kullanici) {
    res.status(401).json({ error: "Kimlik doğrulama gerekli" });
    return;
  }
  if (req.kullanici.rol !== "yonetici") {
    res.status(403).json({ error: "Bu işlem için yönetici yetkisi gerekli" });
    return;
  }
  next();
}

export function requireYazma(req: Request, res: Response, next: NextFunction): void {
  if (!req.kullanici) {
    res.status(401).json({ error: "Kimlik doğrulama gerekli" });
    return;
  }
  if (req.kullanici.rol === "yonetici") { next(); return; }
  if (req.kullanici.rol === "salt_okunur") {
    res.status(403).json({ error: "Salt okunur kullanıcılar yazma işlemi yapamaz" });
    return;
  }
  const catiFirmaId = Number(req.body?.catiFirmaId ?? req.query?.catiFirmaId) || null;
  if (catiFirmaId && req.kullanici.sirketler?.length) {
    const firmaRol = req.kullanici.sirketler.find((s) => s.sirketId === catiFirmaId)?.rol;
    if (firmaRol === "salt_okunur") {
      res.status(403).json({ error: "Bu firmada salt okunur erişiminiz var" });
      return;
    }
  }
  next();
}

export function firmaYazmaDenetimi(catiFirmaId: number, req: Request): boolean {
  const k = req.kullanici;
  if (!k) return false;
  if (k.rol === "yonetici") return true;
  if (k.rol === "salt_okunur") return false;
  const firmaRol = k.sirketler?.find((s) => s.sirketId === catiFirmaId)?.rol;
  return firmaRol !== "salt_okunur";
}

export function sirketErisimKontrol(catiFirmaId: number, req: Request): boolean {
  if (!req.kullanici) return false;
  if (req.kullanici.rol === "yonetici") return true;
  return (req.izinliSirketler ?? []).includes(catiFirmaId);
}

export function sirketlerFiltrele<T extends { catiFirmaId: number }>(
  rows: T[],
  req: Request,
  catiFirmaIdParam?: string | number
): { rows: T[]; yetkisiz: boolean } {
  if (catiFirmaIdParam) {
    const id = Number(catiFirmaIdParam);
    if (!sirketErisimKontrol(id, req)) return { rows: [], yetkisiz: true };
    return { rows: rows.filter(r => r.catiFirmaId === id), yetkisiz: false };
  }
  if (req.kullanici?.rol === "yonetici") return { rows, yetkisiz: false };
  const izinli = req.izinliSirketler ?? [];
  return { rows: rows.filter(r => izinli.includes(r.catiFirmaId)), yetkisiz: false };
}
