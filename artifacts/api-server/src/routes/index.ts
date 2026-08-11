import { Router, type IRouter } from "express";
import healthRouter from "./health";
import housingLogsRouter from "./housingLogs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(housingLogsRouter);

export default router;
