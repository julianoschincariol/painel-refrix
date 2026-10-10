import { Router, type IRouter } from "express";
import healthRouter from "./health";
import indicatorsRouter from "./indicators";
import sugarRouter from "./sugar";
import manualRouter from "./manual";
import historyRouter from "./history";
import iccRouter from "./icc";

const router: IRouter = Router();

router.use(healthRouter);
router.use(indicatorsRouter);
router.use(sugarRouter);
router.use(manualRouter);
router.use(historyRouter);
router.use(iccRouter);

export default router;
