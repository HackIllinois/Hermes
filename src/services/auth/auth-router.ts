import { Router, Request, Response, NextFunction } from "express";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";
import { BASE_BACKEND_URL } from "../../config";
import { supabase } from "../../lib/supabase";
import { Database } from "../../lib/db/schemas";
import { Tables } from "../../lib/db/strings";

const authRouter: Router = Router();

authRouter.get("/profile", async (req: Request, res: Response, next: NextFunction) => {
    const redirectUrl = BASE_BACKEND_URL + "/auth/callback";
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo: redirectUrl,
        },
    });

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error signing in with Google", null, error));
    }

    console.log("redirecting to ", data.url);

    res.redirect(data.url);
});

authRouter.get("/callback", async (req: Request, res: Response, next: NextFunction) => {
    console.log("creating callback");
    const code: string = req.query.code as string;
    if (!code) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Missing code"));
    }

    const {
        data: { session },
        error: oauthErr,
    } = await supabase.auth.exchangeCodeForSession(code);

    if (oauthErr || !session) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "OAuth exchange failed", null, oauthErr));
    }

    const user = session.user;

    const profileRow = {
        id: user.id,
        name: user.user_metadata.full_name ?? user.email!,
        role: "MEMBER" as Database["public"]["Enums"]["user_role"],
    };

    const { error: dbErr } = await supabase.from(Tables.PROFILES).upsert(profileRow);

    if (dbErr) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error creating profile", null, dbErr));
    }

    return res.status(StatusCode.SuccessOK).json({ message: "Authentication successful" });
});

export default authRouter;
