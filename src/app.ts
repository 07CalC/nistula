import "dotenv/config"
import express from "express"
import cors from "cors"
import webhookRouter from "./routes/webhook"
import { errorHandler } from "./middleware/error";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
})

app.use("/webhook", webhookRouter)

app.use(errorHandler)

export default app;
