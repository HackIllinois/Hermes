import { NextFunction, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { RouterError } from "./error-handler";
import StatusCode from "status-code-enum";
import { Roles, Tables } from "../lib/db/strings";

/**
 * Creates a user object from the auth token and attaches it to the request object
 */
export async function createUser(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers.authorization;
    if (!auth) {
        return next(new RouterError(StatusCode.ClientErrorUnauthorized, "Missing auth token"));
    }

    const {
        data: { user },
        error,
    } = await supabase.auth.getUser(auth); // validates the JWT :contentReference[oaicite:0]{index=0}

    if (error || !user) return next(new RouterError(StatusCode.ClientErrorUnauthorized, "Invalid or expired token", null, error));

    const { data: profile, error: profErr } = await supabase.from(Tables.PROFILES).select("role").eq("id", user.id).single();
    if (profErr || !profile) {
        return next(new RouterError(StatusCode.ClientErrorForbidden, "Profile not found", null, profErr));
    }

    // attach user to request
    (req as any).user = { ...user, role: profile.role };

    next();
}

/**
 * Checks if the user is a lead. If not, returns a 403 error.
 */
export async function requireLead(req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user;

    if (!user || !user.role) {
        return next(new RouterError(StatusCode.ClientErrorForbidden, "Restricted access"));
    }

    if (user.role !== Roles.LEAD) {
        return next(new RouterError(StatusCode.ClientErrorForbidden, "Restricted access"));
    }
    next();
}

/**
 * Checks if the user is a member. If not, returns a 403 error.
 */
export async function requireMember(req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user;

    if (!user || !user.role) {
        return next(new RouterError(StatusCode.ClientErrorForbidden, "Restricted access"));
    }

    if (user.role !== Roles.MEMBER && user.role !== Roles.LEAD) {
        return next(new RouterError(StatusCode.ClientErrorForbidden, "Restricted access"));
    }
    next();
}
