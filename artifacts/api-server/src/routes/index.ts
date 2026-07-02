import { Router, type IRouter } from "express";
import healthRouter from "./health";
import drWriterRouter from "./drWriter";

const router: IRouter = Router();

router.use(healthRouter);
router.use(drWriterRouter);

export default router;
