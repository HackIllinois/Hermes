import { Router, Request, Response, NextFunction } from "express";
import { createUser, requireMemberRole } from "../../middleware/auth";
import { Tables } from "../../lib/db/strings";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";

const profileRouter: Router = Router();

/**
 * GET /profiles
 *
 * Retrieves all user profiles (id and name only).
 */
profileRouter.get("/", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const supabase = (req as any).supabase;
    // Select only the id and name, and order by name
    const { data, error } = await supabase.from(Tables.PROFILES).select("id, name").order("name", { ascending: true });

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching profiles", null, error));
    }

    return res.status(StatusCode.SuccessOK).json(data);
});

export default profileRouter;
