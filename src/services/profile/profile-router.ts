import { Router, Request, Response, NextFunction } from "express";
import { createUser, requireMemberRole } from "../../middleware/auth";
import { Tables } from "../../lib/db/strings";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";
import { supabase } from "../../lib/supabase";

const profileRouter: Router = Router();

profileRouter.get("/teams", createUser, async (req: Request, res: Response, next: NextFunction) => {
    const { data, error } = await supabase.from(Tables.TEAMS).select("id, name").order("name", { ascending: true });

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching teams", null, error));
    }

    return res.status(StatusCode.SuccessOK).json(data);
});

profileRouter.patch("/me/team", createUser, async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const teamId = req.body.team_id;

    if (!Number.isInteger(teamId)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "A valid team_id is required"));
    }

    const { data: team, error: teamErr } = await supabase.from(Tables.TEAMS).select("id, name").eq("id", teamId).maybeSingle();

    if (teamErr) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error validating team", null, teamErr));
    }

    if (!team) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Selected team does not exist"));
    }

    const { error: updateErr } = await supabase.from(Tables.PROFILES).update({ team_id: team.id }).eq("id", user.id);

    if (updateErr) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error updating team", null, updateErr));
    }

    return res.status(StatusCode.SuccessOK).json({
        message: "Team updated successfully",
        team,
    });
});

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
