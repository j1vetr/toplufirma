import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sirketlerRouter from "./sirketler";
import carilerRouter from "./cariler";
import gemilerRouter from "./gemiler";
import bankaHesaplariRouter from "./bankaHesaplari";
import faturalarRouter from "./faturalar";
import odemelerRouter from "./odemeler";
import starlinkPlanlariRouter from "./starlinkPlanlari";
import ekipmanlarRouter from "./ekipmanlar";
import kdvOranlariRouter from "./kdvOranlari";
import faturaSerileriRouter from "./faturaSerileri";
import dashboardRouter from "./dashboard";
import raporlarRouter from "./raporlar";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sirketlerRouter);
router.use(carilerRouter);
router.use(gemilerRouter);
router.use(bankaHesaplariRouter);
router.use(faturalarRouter);
router.use(odemelerRouter);
router.use(starlinkPlanlariRouter);
router.use(ekipmanlarRouter);
router.use(kdvOranlariRouter);
router.use(faturaSerileriRouter);
router.use(dashboardRouter);
router.use(raporlarRouter);

export default router;
