import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { getIcc } from "../lib/fgv-icc";

// Matéria mais recente do ICC (FGV IBRE), mostrada junto com o gráfico.

const router: IRouter = Router();

router.get("/icc/article", async (_req, res) => {
  try {
    const { article, value, refDate } = await getIcc();
    res.json({ ...article, value, refDate, source: "FGV IBRE" });
  } catch (err) {
    logger.warn({ err }, "Falha ao ler a matéria do ICC");
    res.status(502).json({ error: "Não foi possível ler a matéria da FGV agora" });
  }
});

export default router;
