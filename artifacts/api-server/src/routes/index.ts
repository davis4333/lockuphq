import { Router, type IRouter } from "express";
import healthRouter from "./health";
import drWriterRouter from "./drWriter";
import housingLogsRouter from "./housingLogs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(drWriterRouter);
router.use(housingLogsRouter);

export default router;
