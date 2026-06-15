import { type Request, type Response, type NextFunction } from "express";

const API_KEY = process.env.PANEL_API_KEY;

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!API_KEY) {
    return next();
  }

  const authHeader = req.headers["x-api-key"] ?? req.headers["authorization"]?.replace("Bearer ", "");
  if (authHeader !== API_KEY) {
    return res.status(401).json({ error: "Yetkisiz erişim" });
  }
  next();
}
