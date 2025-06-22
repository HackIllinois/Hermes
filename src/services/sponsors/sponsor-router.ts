import { Router, Request, Response, NextFunction } from "express";
import { isValidSponsorInsertFormat, SponsorInsert } from "./sponsor-formats";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";
import { Tables } from "../../lib/db/strings";
import { supabase } from "../../lib/supabase";

const sponsorRouter: Router = Router();

sponsorRouter.post("/create", async (req: Request, res: Response, next: NextFunction) => {
    const sponsor: SponsorInsert = req.body as SponsorInsert;

    if (!isValidSponsorInsertFormat(sponsor)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid sponsor format"));
    }

    const { error: dbErr } = await supabase.from(Tables.SPONSORS).insert(sponsor);

    if (dbErr) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error creating sponsor", null, dbErr));
    }

    return res.status(StatusCode.SuccessOK).json({ message: "Sponsor created successfully" });
});

export default sponsorRouter;
