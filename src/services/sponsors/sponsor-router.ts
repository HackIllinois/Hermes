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

sponsorRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
    const { data, error } = await supabase.from(Tables.SPONSORS).select("*");

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching sponsors", null, error));
    }

    return res.status(StatusCode.SuccessOK).json(data);
});

sponsorRouter.get("/:email", async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.params;

    if (!email || typeof email !== "string") {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Email is required"));
    }

    const { data, error } = await supabase.from(Tables.SPONSORS).select("*").eq("sponsor_email", email);

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching sponsor", null, error));
    }

    if (data.length === 0) {
        return next(new RouterError(StatusCode.ClientErrorNotFound, "Sponsor not found"));
    }

    return res.status(StatusCode.SuccessOK).json(data);
});

sponsorRouter.get("/company/:companyName", async (req: Request, res: Response, next: NextFunction) => {
    const { companyName } = req.params;
    if (!companyName || typeof companyName !== "string") {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Company name is required"));
    }

    const { data, error } = await supabase.from(Tables.SPONSORS).select("*").ilike("company_name", `%${companyName}%`);

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching sponsor", null, error));
    }

    return res.status(StatusCode.SuccessOK).json(data);
});

export default sponsorRouter;
