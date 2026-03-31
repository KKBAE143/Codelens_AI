import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/stripe/health", (_req, res) => {
  res.json({ status: "ok", message: "Stripe webhook endpoint is handled by this server" });
});

export default router;
