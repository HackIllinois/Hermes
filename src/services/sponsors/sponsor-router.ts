import { Router, Request, Response, NextFunction } from "express";
import { isValidSponsorInsertFormat, isValidSponsorUpdateFormat, SponsorInsert, SponsorUpdate } from "./sponsor-formats";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";
import { EmailStatus, Roles, Tables } from "../../lib/db/strings";
import { createUser, requireMemberRole } from "../../middleware/auth";

const sponsorRouter: Router = Router();

/**
 * Helper function to filterout inactive tasks from the sponsors array
 * @param sponsors Array of sponsors with contact_tasks
 * @returns Array of sponsors with only active tasks
 */
const filterForActive = (sponsors: any[]) => {
    return sponsors.map((sponsor) => {
        const { contact_tasks, ...rest } = sponsor;
        const active_task =
            (contact_tasks || []).find(
                (task: any) =>
                    task.status !== EmailStatus.REJECTED &&
                    task.status !== EmailStatus.GHOSTED &&
                    task.status !== EmailStatus.INVALID_CONTACT &&
                    task.status !== EmailStatus.DEFERRED,
            ) || null;
        return {
            ...rest,
            active_task,
        };
    });
};

/**
 * POST /sponsors/create
 *
 * Creates a new sponsor in the database.
 *
 * @description This endpoint creates a new sponsor in the sponsors table.
 *              Requires authentication, member role access, and additional permission check.
 *
 * @body {SponsorInsert} sponsor - The sponsor object to create with the following required fields:
 *   - sponsor_email: string - Email address of the sponsor
 *   - sponsor_name: string - Name of the sponsor contact
 *   - company_name: string - Name of the sponsor's company
 *   - notes: string (optional) - Additional notes about the sponsor
 *   - status: "NOT_CONTACTED" | "CONTACTED" | "REJECTED" | "NEED_PAYMENT" | "CONFIRMED" | "INVALID_CONTACT" | "DEFERRED" (optional, defaults to "NOT_CONTACTED")
 *
 *
 * @returns {Object} JSON response containing:
 *   - Success (200):
 *     {
 *       message: "Sponsor created successfully"
 *     }
 *   - Error (400): Invalid sponsor format
 *   - Error (403): User does not have required permissions
 *   - Error (500): Error message if database insertion fails
 *
 * @throws {RouterError} 400 - Invalid sponsor format (missing required fields or invalid data types)
 * @throws {RouterError} 401 - Missing or invalid authentication token
 * @throws {RouterError} 403 - User does not have member role access or required permissions
 * @throws {RouterError} 500 - Internal server error during database operation
 *
 * @see SponsorInsert - Type definition for sponsor creation
 */
sponsorRouter.post("/create", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const sponsor: SponsorInsert = req.body as SponsorInsert;
    const supabase = (req as any).supabase;
    const user = (req as any).user;
    sponsor.team_id = user.team_id;
    if (!isValidSponsorInsertFormat(sponsor)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid sponsor format"));
    }

    const { error: dbErr } = await supabase.from(Tables.SPONSORS).insert(sponsor);

    if (dbErr) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error creating sponsor", null, dbErr));
    }

    return res.status(StatusCode.SuccessOK).json({ message: "Sponsor created successfully" });
});

/**
 * GET /sponsors
 *
 * Retrieves all sponsors from the database.
 *
 * @description This endpoint fetches all sponsors stored in the sponsors table.
 *              Requires authentication and member role access.
 *
 *
 * @returns {Object} JSON response containing:
 *   - Success (200): Array of sponsor objects with the following structure:
 *     {
 *       sponsor_email: string,
 *       sponsor_name: string,
 *       company_name: string,
 *       notes: string,
 *       status: "NOT_CONTACTED" | "CONTACTED" | "REJECTED" | "NEED_PAYMENT" | "CONFIRMED" | "INVALID_CONTACT" | "DEFERRED",
 *       created_at: string,
 *       updated_at: string
 *     }
 *   - Error (500): Error message if database query fails
 *
 * @throws {RouterError} 401 - Missing or invalid authentication token
 * @throws {RouterError} 403 - User does not have member role access
 * @throws {RouterError} 500 - Internal server error during database operation
 *
 * @see SponsorSelect - Type definition for sponsor data
 */
sponsorRouter.get("/", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const supabase = (req as any).supabase;
    const { data, error } = await supabase.from(Tables.SPONSORS).select(`
            *,
            contact_tasks (
                id,
                status,
                notes,
                due_date,
                owner_id,
                profiles (
                    id,
                    name
                )
            )
            `);

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching sponsors", null, error));
    }

    return res.status(StatusCode.SuccessOK).json(filterForActive(data));
});

/**
 * GET /sponsors/:email
 *
 * Retrieves a specific sponsor by their email address.
 *
 * @description This endpoint fetches a single sponsor from the sponsors table
 *              based on the provided email address. Requires authentication and member role access.
 *
 * @param {string} email - The email address of the sponsor to retrieve
 *
 *
 * @returns {Object} JSON response containing:
 *   - Success (200): Sponsor object with the following structure:
 *     {
 *       sponsor_email: string,
 *       sponsor_name: string,
 *       company_name: string,
 *       notes: string,
 *       status: "NOT_CONTACTED" | "CONTACTED" | "REJECTED" | "NEED_PAYMENT" | "CONFIRMED" | "INVALID_CONTACT" | "DEFERRED",
 *       created_at: string,
 *       updated_at: string
 *     }
 *   - Error (400): Email parameter is missing or invalid
 *   - Error (404): Sponsor not found with the provided email
 *   - Error (500): Error message if database query fails
 *
 * @throws {RouterError} 400 - Email parameter is missing or invalid
 * @throws {RouterError} 401 - Missing or invalid authentication token
 * @throws {RouterError} 403 - User does not have member role access
 * @throws {RouterError} 404 - Sponsor not found with the provided email
 * @throws {RouterError} 500 - Internal server error during database operation
 *
 * @see SponsorSelect - Type definition for sponsor data
 */
sponsorRouter.get("/:email", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.params;
    const supabase = (req as any).supabase;
    if (!email || typeof email !== "string") {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Email is required"));
    }

    const { data, error } = await supabase.from(Tables.SPONSORS).select(`
            *,
            contact_tasks (
                id,
                status,
                notes,
                due_date,
                owner_id,
                profiles (
                    id,
                    name
                )
            )
            `).eq("sponsor_email", email);

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching sponsor", null, error));
    }

    if (data.length === 0) {
        return next(new RouterError(StatusCode.ClientErrorNotFound, "Sponsor not found"));
    }

    return res.status(StatusCode.SuccessOK).json(filterForActive(data));
});

/**
 * GET /sponsors/company/:companyName
 *
 * Retrieves all sponsors from a specific company by company name.
 *
 * @description This endpoint fetches all sponsors from the sponsors table that belong
 *              to the specified company. Uses case-insensitive partial matching.
 *              Requires authentication and member role access.
 *
 * @param {string} companyName - The name of the company to search for (supports partial matching)
 *
 *
 * @returns {Object} JSON response containing:
 *   - Success (200): Array of sponsor objects with the following structure:
 *     {
 *       sponsor_email: string,
 *       sponsor_name: string,
 *       company_name: string,
 *       notes: string,
 *       status: "NOT_CONTACTED" | "CONTACTED" | "REJECTED" | "NEED_PAYMENT" | "CONFIRMED" | "INVALID_CONTACT" | "DEFERRED",
 *       created_at: string,
 *       updated_at: string
 *     }
 *   - Error (400): Company name parameter is missing or invalid
 *   - Error (500): Error message if database query fails
 *
 * @throws {RouterError} 400 - Company name parameter is missing or invalid
 * @throws {RouterError} 401 - Missing or invalid authentication token
 * @throws {RouterError} 403 - User does not have member role access
 * @throws {RouterError} 500 - Internal server error during database operation
 *
 * @see SponsorSelect - Type definition for sponsor data
 */
sponsorRouter.get(
    "/company/:companyName",
    createUser,
    requireMemberRole,
    async (req: Request, res: Response, next: NextFunction) => {
        const { companyName } = req.params;
        if (!companyName || typeof companyName !== "string") {
            return next(new RouterError(StatusCode.ClientErrorBadRequest, "Company name is required"));
        }
        const supabase = (req as any).supabase;
        const { data, error } = await supabase.from(Tables.SPONSORS).select(`
            *,
            contact_tasks (
                id,
                status,
                notes,
                due_date,
                owner_id,
                profiles (
                    id,
                    name
                )
            )
            `).ilike("company_name", `%${companyName}%`);

        if (error) {
            return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching sponsor", null, error));
        }

        return res.status(StatusCode.SuccessOK).json(filterForActive(data));
    },
);

sponsorRouter.patch("/:email", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.params;
    const supabase = (req as any).supabase;
    const updatePayload: SponsorUpdate = req.body as SponsorUpdate;

    if (!isValidSponsorUpdateFormat(updatePayload)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid sponsor format"));
    }

    if (!email || typeof email !== "string") {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Email is required"));
    }

    try {
        updatePayload.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from(Tables.SPONSORS)
            .update(updatePayload)
            .eq("sponsor_email", email)
            .select(`
                *,
                contact_tasks (
                    id,
                    status,
                    notes,
                    due_date,
                    owner_id,
                    profiles (
                        id,
                        name
                    )
                )
            `)
            .single();

        if (error) {
            if (error.code === "PGRST116") {
                // PostgREST error code for "No rows found"
                return next(new RouterError(StatusCode.ClientErrorNotFound, "Sponsor not found"));
            }
            return next(new RouterError(StatusCode.ServerErrorInternal, "Error updating sponsor", null, error));
        }

        return res.status(StatusCode.SuccessOK).json(filterForActive([data])[0]);
    } catch (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error updating sponsor", null, error));
    }
});

/**
 * DELETE /sponsors/:email
 *
 * Deletes a sponsor by email address.
 *
 * @description Deletes a sponsor from the database. If the sponsor has an active task
 *              (not REJECTED, GHOSTED, INVALID_CONTACT, or DEFERRED), the delete is blocked
 *              and a 409 Conflict is returned.
 *
 * @param {string} email - The email address of the sponsor to delete
 *
 * @returns {Object} JSON response:
 *   - Success (200): { message: "Sponsor deleted successfully" }
 *   - Error (400): Missing email
 *   - Error (404): Sponsor not found
 *   - Error (409): Sponsor has an active task
 *   - Error (500): Database error
 */
sponsorRouter.delete("/:email", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.params;
    const supabase = (req as any).supabase;

    if (!email || typeof email !== "string") {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Email is required"));
    }

    // First, check if the sponsor exists and has any active tasks
    const { data: sponsor, error: fetchErr } = await supabase
        .from(Tables.SPONSORS)
        .select(`
            sponsor_email,
            contact_tasks (
                id,
                status
            )
        `)
        .eq("sponsor_email", email)
        .maybeSingle();

    if (fetchErr) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching sponsor", null, fetchErr));
    }

    if (!sponsor) {
        return next(new RouterError(StatusCode.ClientErrorNotFound, "Sponsor not found"));
    }

    // Check for active tasks
    const hasActiveTask = (sponsor.contact_tasks || []).some(
        (task: any) =>
            task.status !== EmailStatus.REJECTED &&
            task.status !== EmailStatus.GHOSTED &&
            task.status !== EmailStatus.INVALID_CONTACT &&
            task.status !== EmailStatus.DEFERRED,
    );

    if (hasActiveTask) {
        return next(new RouterError(StatusCode.ClientErrorConflict, "Cannot delete sponsor with an active task. Close or reassign the task first."));
    }

    // Delete only the sponsor row
    const { error: deleteErr } = await supabase
        .from(Tables.SPONSORS)
        .delete()
        .eq("sponsor_email", email);

    if (deleteErr) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error deleting sponsor", null, deleteErr));
    }

    return res.status(StatusCode.SuccessOK).json({ message: "Sponsor deleted successfully" });
});

export default sponsorRouter;