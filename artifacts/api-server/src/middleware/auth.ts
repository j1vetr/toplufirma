import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

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

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.replace("Bearer ", "").trim();

  if (!token) {
    return res.status(401).json({ error: "Kimlik doğrulama gerekli" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.kullanici = payload;
    req.izinliSirketler = payload.sirketler.map((s) => s.sirketId);
    next();
  } catch {
    return res.status(401).json({ error: "Geçersiz veya süresi dolmuş token" });
  }
}

export function requireYonetici(req: Request, res: Response, next: NextFunction) {
  if (!req.kullanici) return res.status(401).json({ error: "Kimlik doğrulama gerekli" });
  if (req.kullanici.rol !== "yonetici") {
    return res.status(403).json({ error: "Bu işlem için yönetici yetkisi gerekli" });
  }
  next();
}

export function requireYazma(req: Request, res: Response, next: NextFunction) {
  if (!req.kullanici) return res.status(401).json({ error: "Kimlik doğrulama gerekli" });
  if (req.kullanici.rol === "salt_okunur") {
    return res.status(403).json({ error: "Salt okunur kullanıcılar yazma işlemi yapamaz" });
  }
  next();
}

export function sirketErisimKontrol(sirketId: number, req: Request): boolean {
  if (!req.kullanici) return false;
  if (req.kullanici.rol === "yonetici") return true;
  return (req.izinliSirketler ?? []).includes(sirketId);
}
