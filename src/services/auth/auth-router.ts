import { Router, Request, Response, NextFunction } from "express";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";
import { BASE_BACKEND_URL, BASE_FRONTEND_URL, isProductionEnvironment } from "../../config";
import { supabase } from "../../lib/supabase";
import { Database } from "../../lib/db/schemas";
import { Tables } from "../../lib/db/strings";
import { createUser } from "../../middleware/auth";
import type { Session } from "@supabase/supabase-js";
import { createOrRenewGmailWatch } from "../pubsub/pubsub-service";

const authRouter: Router = Router();

async function upsertProfileFromSession(session: Session) {
    const user = session.user;
    const { data: existing, error: existingErr } = await supabase
        .from(Tables.PROFILES)
        .select("role, team_id")
        .eq("id", user.id)
        .maybeSingle();

    if (existingErr) {
        throw new RouterError(StatusCode.ServerErrorInternal, "Error fetching existing profile", null, existingErr);
    }

    const profileRow: Database["public"]["Tables"]["profiles"]["Insert"] = {
        id: user.id,
        name: user.user_metadata.full_name ?? user.email!,
        email: user.email!,
        role: existing?.role ?? "MEMBER",
        team_id: existing?.team_id ?? null,
        gmail_token: session.provider_token as string,
        gmail_refresh: session.provider_refresh_token as string,
    };

    const { error: dbErr } = await supabase.from(Tables.PROFILES).upsert(profileRow);

    if (dbErr) {
        throw new RouterError(StatusCode.ServerErrorInternal, "Error creating profile", null, dbErr);
    }

    return { teamId: existing?.team_id ?? null };
}

/**
 * GET /auth/login
 *
 * Initiates Google OAuth login flow.
 *
 * @description This endpoint initiates the Google OAuth authentication process.
 *              It redirects the user to Google's OAuth consent screen with Gmail scope
 *              for email access. The user will be redirected to the callback URL
 *              after successful authentication.
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
 *
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
    try {
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

        const { teamId } = await upsertProfileFromSession(session);

        try {
            const { historyId, expiration } = await createOrRenewGmailWatch(session.user.id);
            console.log(
                `Initialized Gmail watch for ${session.user.email} with historyId=${historyId} expiration=${expiration ?? "unknown"}`,
            );
        } catch (watchError) {
            console.error(`Failed to initialize Gmail watch for ${session.user.email}:`, watchError);
        }

        // Set the auth cookie before sending the user back to the site.
        res.cookie("sb-access-token", session.access_token, {
            httpOnly: true,
            secure: isProductionEnvironment,
            maxAge: session.expires_in * 1000,
            path: "/",
        });

        const postLoginPath = teamId ? "/app" : "/onboarding/team";
        return res.redirect(`${BASE_FRONTEND_URL}${postLoginPath}`);
    } catch (error) {
        return next(error);
    }
});

/**
 * GET /auth/me
 *
 * Returns the user's profile information.
 *
 * @description This endpoint returns the user's profile information. Used by the frontend for authentication verification.
 *
 * @returns {Object} JSON response containing:
 * TODO
 */
authRouter.get("/me", createUser, (req: Request, res: Response) => {
    return res.status(StatusCode.SuccessOK).json((req as any).user);
});

/**
 * POST /auth/logout
 *
 * Logs the user out by clearing the authentication cookie.
 *
 * @description This endpoint clears the sb-access-token cookie,
 *              effectively ending the user's session.
 *
 * @returns {Object} JSON response:
 *   - Success (200): { message: "Logged out successfully" }
 */
authRouter.post("/logout", (_req: Request, res: Response) => {
    res.clearCookie("sb-access-token", {
        path: "/",
        httpOnly: true,
        secure: isProductionEnvironment,
    });
    return res.status(StatusCode.SuccessOK).json({ message: "Logged out successfully" });
});

/**
 * THIS ENDPOINT IS USED FOR POSTMAN TESTING
 *
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
authRouter.get("/callback/postman", async (req: Request, res: Response, next: NextFunction) => {
    try {
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

        const { teamId } = await upsertProfileFromSession(session);

        try {
            const { historyId, expiration } = await createOrRenewGmailWatch(session.user.id);
            console.log(
                `Initialized Gmail watch for ${session.user.email} with historyId=${historyId} expiration=${expiration ?? "unknown"}`,
            );
        } catch (watchError) {
            console.error(`Failed to initialize Gmail watch for ${session.user.email}:`, watchError);
        }

        return res.status(StatusCode.SuccessOK).json({
            message: "Authentication successful",
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_in: session.expires_in,
            team_id: teamId,
        });
    } catch (error) {
        return next(error);
    }
});

export default authRouter;
