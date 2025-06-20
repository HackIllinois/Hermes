import { Router, Request, Response, NextFunction } from "express";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";
import { BASE_FRONTEND_URL } from "../../config";
import { supabase } from "../../lib/supabase";

const authRouter: Router = Router();

authRouter.get("/profile", async (req: Request, res: Response, next: NextFunction) => {
    const redirectUrl = BASE_FRONTEND_URL + "/auth/callback";
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo: redirectUrl,
        },
    });

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error signing in with Google"));
    }

    res.redirect(data.url);
});

export default authRouter;
