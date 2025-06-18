import express, { Application } from "express";
import { Request, Response } from "express";

import cors from "cors";
import { ErrorHandler } from "./middleware/error-handler";

const app: Application = express();

app.use(express.json());
app.use(cors());

// app.use("/account/", accountRouter);
// app.use("/events/", eventRouter);
// app.use("/bids/", bidRouter);
// app.use("/asks/", askRouter);
// app.use("/transfer/", transferRouter);

app.get("/", (_: Request, res: Response) => {
    res.end("API is working!!!");
});


app.use(ErrorHandler);

export default app;