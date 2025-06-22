import express, { Application } from "express";
import { Request, Response } from "express";

import cors from "cors";
import { ErrorHandler } from "./middleware/error-handler";
import { validateEnv } from "./config";
import authRouter from "./services/auth/auth-router";
import sponsorRouter from "./services/sponsors/sponsor-router";

validateEnv();

const app: Application = express();

app.use(express.json());
app.use(cors());

// Create API router for all API routes
const apiRouter = express.Router();
apiRouter.use("/auth", authRouter);
apiRouter.use("/sponsor", sponsorRouter);

// Mount API router under /api
app.use("/api", apiRouter);

app.get("/", (_: Request, res: Response) => {
    res.end("API is working!!!");
});

app.use(ErrorHandler);

export default app;
