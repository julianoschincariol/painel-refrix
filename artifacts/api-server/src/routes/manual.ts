import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { MANUAL_IDS, type ManualId, addManualValue, getManualStates } from "../lib/store";
import { clearHistoryCache } from "./history";

// Valores manuais compartilhados (Diesel, PET, ICC). Qualquer um vê; para
// alterar é preciso a senha definida no Secret EDIT_PASSWORD do Replit.

function passwordMatches(given: unknown): boolean {
  const expected = process.env["EDIT_PASSWORD"];
  if (!expected || typeof given !== "string") return false;
  // Compara hashes para não vazar o tamanho da senha pelo tempo de resposta
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const router: IRouter = Router();

router.get("/manual", async (_req, res) => {
  try {
    const values = await getManualStates();
    res.json({
      storage: values ? "server" : "none",
      passwordConfigured: Boolean(process.env["EDIT_PASSWORD"]),
      values,
    });
  } catch (err) {
    logger.error({ err }, "Falha ao ler valores manuais");
    res.status(500).json({ error: "Falha ao ler valores manuais" });
  }
});

router.post("/manual", async (req, res) => {
  const { id, value, password } = (req.body ?? {}) as { id?: unknown; value?: unknown; password?: unknown };

  if (typeof id !== "string" || !MANUAL_IDS.includes(id as ManualId)) {
    res.status(400).json({ error: "Indicador inválido" });
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000_000) {
    res.status(400).json({ error: "Valor inválido" });
    return;
  }
  if (!process.env["EDIT_PASSWORD"]) {
    res.status(503).json({ error: "Senha de edição não configurada no servidor" });
    return;
  }
  if (!passwordMatches(password)) {
    res.status(401).json({ error: "Senha incorreta" });
    return;
  }

  try {
    await addManualValue(id as ManualId, value);
    clearHistoryCache();
    res.json({ ok: true, values: await getManualStates() });
  } catch (err) {
    logger.error({ err }, "Falha ao salvar valor manual");
    res.status(500).json({ error: "Falha ao salvar o valor" });
  }
});

export default router;
