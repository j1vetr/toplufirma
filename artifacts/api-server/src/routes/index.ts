import { Router, type IRouter } from "express";
import firmaRouter from "./firmalar";
import gemilerRouter from "./gemiler";
import bankaHesaplariRouter from "./bankaHesaplari";
import faturalarRouter from "./faturalar";
import odemelerRouter from "./odemeler";
import ekipmanlarRouter from "./ekipmanlar";
import kdvOranlariRouter from "./kdvOranlari";
import faturaSerileriRouter from "./faturaSerileri";
import dashboardRouter from "./dashboard";
import raporlarRouter from "./raporlar";
import kullanicilarRouter from "./kullanicilar";
import tekrarlayanFaturalarRouter from "./tekrarlayanFaturalar";
import aramaRouter from "./arama";
import adminRouter from "./admin";
import tekliflerRouter from "./teklifler";

const router: IRouter = Router();

router.use(adminRouter);
router.use(firmaRouter);
router.use(gemilerRouter);
router.use(bankaHesaplariRouter);
router.use(faturalarRouter);
router.use(odemelerRouter);
router.use(ekipmanlarRouter);
router.use(kdvOranlariRouter);
router.use(faturaSerileriRouter);
router.use(dashboardRouter);
router.use(raporlarRouter);
router.use(kullanicilarRouter);
router.use(tekrarlayanFaturalarRouter);
router.use(aramaRouter);
router.use(tekliflerRouter);

export default router;
