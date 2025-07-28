import { Router, Request, Response, NextFunction } from "express";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";
import { BASE_BACKEND_URL } from "../../config";
import { supabase } from "../../lib/supabase";
import { Database } from "../../lib/db/schemas";
import { Tables } from "../../lib/db/strings";

const authRouter: Router = Router();

/**
 * GET /auth/login
 *
 * Initiates Google OAuth login flow.
 *
 * @description This endpoint initiates the Google OAuth authentication process.
 *              It redirects the user to Google's OAuth consent screen with Gmail scope
 *              for email access. The user will be redirected to the callback URL
 *              after successful authentication.
 *              Only users with an @hackillinois.org email will be able to login.
 *
 * @returns {Object} Redirect response:
 *   - Success: Redirects to Google OAuth consent screen
 *   - Error (500): Error message if OAuth initialization fails
 *
 * @throws {RouterError} 500 - Internal server error during OAuth initialization
 *
 * @note This endpoint performs a redirect to Google's OAuth service and does not return JSON.
 *       The actual authentication result is handled by the /callback endpoint.
 */
authRouter.get("/login", async (req: Request, res: Response, next: NextFunction) => {
    const redirectUrl = BASE_BACKEND_URL + "/auth/callback";
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo: redirectUrl,
            scopes: "https://mail.google.com/",
            queryParams: {
                access_type: "offline",
                prompt: "consent",
            },
        },
    });

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error signing in with Google", null, error));
    }

    res.redirect(data.url);
});

/**
 * GET /auth/callback
 *
 * Handles Google OAuth callback and exchanges authorization code for session.
 *
 * @description This endpoint is called by Google after successful OAuth authentication.
 *              It exchanges the authorization code for a session, creates or updates
 *              the user profile, and returns authentication tokens. The user's role
 *              is preserved if they already exist, otherwise defaults to "MEMBER".
 *
 * @query {string} code - The authorization code returned by Google OAuth
 *
 * @returns {Object} JSON response containing:
 *   - Success (200):
 *     {
 *       message: "Authentication successful",
 *       access_token: string,
 *       refresh_token: string,
 *       expires_in: number
 *     }
 *   - Error (400): Missing authorization code
 *   - Error (500): OAuth exchange failed or profile creation error
 *
 * @throws {RouterError} 400 - Missing authorization code in query parameters
 * @throws {RouterError} 500 - OAuth exchange failed or database error during profile creation
 *
 * @note This endpoint is called automatically by Google OAuth after successful authentication.
 *       The authorization code is single-use and expires quickly.
 *
 * @see Database["public"]["Tables"]["profiles"]["Row"] - Profile table structure
 * @see Database["public"]["Enums"]["user_role"] - Available user roles
 */
authRouter.get("/callback", async (req: Request, res: Response, next: NextFunction) => {
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

    // kinda a hacky way to get the role of the user, but it works. load isn't really a concern anyways
    const { data: existing } = await supabase.from(Tables.PROFILES).select("role").eq("id", user.id).maybeSingle();

    const roleToUse = existing?.role ?? "MEMBER";

    const profileRow = {
        id: user.id,
        name: user.user_metadata.full_name ?? user.email!,
        role: roleToUse,
        gmail_token: session.provider_token as string,
        gmail_refresh: session.provider_refresh_token as string,
    };

    const { error: dbErr } = await supabase.from(Tables.PROFILES).upsert(profileRow);

    if (dbErr) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error creating profile", null, dbErr));
    }

    return res.status(StatusCode.SuccessOK).json({
        message: "Authentication successful",
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
    });
});

export default authRouter;
