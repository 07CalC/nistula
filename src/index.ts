import "dotenv/config"
import express from "express"
import cors from "cors"
import webhookRouter from "./routes/webhook"
import { errorHandler } from "./middleware/error";



const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
})

app.use("/webhook", webhookRouter)

app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
})

export default app;
