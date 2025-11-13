import { NextFunction, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { RouterError } from "./error-handler";
import StatusCode from "status-code-enum";
import { Roles, Tables } from "../lib/db/strings";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config";

/**
 * Creates a user object from the auth token and attaches it to the request object
 */
export async function createUser(req: Request, res: Response, next: NextFunction) {
    const token = req.cookies["sb-access-token"];

    if (!token) {
        return next(new RouterError(StatusCode.ClientErrorUnauthorized, "Missing auth token"));
    }

    const {
        data: { user },
        error,
    } = await supabase.auth.getUser(token);

    if (error || !user) return next(new RouterError(StatusCode.ClientErrorUnauthorized, "Invalid or expired token", null, error));

    const { data: profile, error: profErr } = await supabase
        .from(Tables.PROFILES)
        .select("role, team_id")
        .eq("id", user.id)
        .single();
    if (profErr || !profile) {
        return next(new RouterError(StatusCode.ClientErrorForbidden, "Profile not found", null, profErr));
    }

    // attach user to request
    (req as any).user = { ...user, role: profile.role, team_id: profile.team_id };

    const supabaseRequestScoped = createClient(config.SUPABASE_URL, config.SUPABASE_KEY, {
        global: {
            headers: { Authorization: `Bearer ${token}` },
        },
    });

    (req as any).supabase = supabaseRequestScoped;

    next();
}

/**
 * Checks if the user is a lead. If not, returns a 403 error.
 */
export async function requireLeadRole(req: Request, res: Response, next: NextFunction) {
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
export async function requireMemberRole(req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user;

    if (!user || !user.role) {
        return next(new RouterError(StatusCode.ClientErrorForbidden, "Restricted access"));
    }

    if (user.role !== Roles.MEMBER && user.role !== Roles.LEAD) {
        return next(new RouterError(StatusCode.ClientErrorForbidden, "Restricted access"));
    }
    next();
}
