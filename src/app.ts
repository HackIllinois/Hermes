import express, { Application } from "express";
import { Request, Response } from "express";

import cors from "cors";
import { ErrorHandler } from "./middleware/error-handler";
import { BASE_FRONTEND_URL, validateEnv } from "./config";
import authRouter from "./services/auth/auth-router";
import sponsorRouter from "./services/sponsors/sponsor-router";
import taskRouter from "./services/tasks/task-router";
import emailRouter from "./services/emails/email-router";
import cookieParser from "cookie-parser";

validateEnv();

const app: Application = express();

app.use(
    cors({
        origin: BASE_FRONTEND_URL,
        credentials: true,
    }),
);

app.use(express.json());
app.use(cookieParser());

// Create API router for all API routes
const apiRouter = express.Router();
apiRouter.use("/auth", authRouter);
apiRouter.use("/sponsors", sponsorRouter);
apiRouter.use("/tasks", taskRouter);
apiRouter.use("/emails", emailRouter);

// Mount API router under /api
app.use("/api", apiRouter);

app.get("/", (_: Request, res: Response) => {
    res.end("API is working!!!");
});

app.use(ErrorHandler);

export default app;
