import { Router, type IRouter } from "express";
import healthRouter from "./health";
import housingLogsRouter from "./housingLogs";
import adminHousingLogsRouter from "./adminHousingLogs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(housingLogsRouter);
router.use(adminHousingLogsRouter);

export default router;
