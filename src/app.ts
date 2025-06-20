import express, { Application } from "express";
import { Request, Response } from "express";

import cors from "cors";
import { ErrorHandler } from "./middleware/error-handler";
import { validateEnv } from "./config";
import authRouter from "./services/auth/auth-router";

validateEnv();

const app: Application = express();

app.use(express.json());
app.use(cors());

app.use("/auth", authRouter);

app.get("/", (_: Request, res: Response) => {
    res.end("API is working!!!");
});

app.use(ErrorHandler);

export default app;
