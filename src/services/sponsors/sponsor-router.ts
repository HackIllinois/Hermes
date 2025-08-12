import { Router, Request, Response, NextFunction } from "express";
import { isValidSponsorInsertFormat, SponsorInsert } from "./sponsor-formats";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";
import { Roles, Tables } from "../../lib/db/strings";
import { supabase } from "../../lib/supabase";
import { createUser, requireMemberRole } from "../../middleware/auth";
import { hasPermission } from "../../lib/db/helpers";

const sponsorRouter: Router = Router();

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
 *   - status: "PENDING_EMAIL" | "CONTACTED" | "REJECTED" | "NEED_PAYMENT" | "CONFIRMED" (optional, defaults to "PENDING_EMAIL")
 *
 * @headers {string} Authorization - Bearer token for user authentication
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

    if (!isValidSponsorInsertFormat(sponsor)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid sponsor format"));
    }

    const user = (req as any).user;

    if (!hasPermission(user)) {
        return next(new RouterError(StatusCode.ClientErrorForbidden, "Restricted access"));
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
 * @headers {string} Authorization - Bearer token for user authentication
 *
 * @returns {Object} JSON response containing:
 *   - Success (200): Array of sponsor objects with the following structure:
 *     {
 *       sponsor_email: string,
 *       sponsor_name: string,
 *       company_name: string,
 *       notes: string,
 *       status: "PENDING_EMAIL" | "CONTACTED" | "REJECTED" | "NEED_PAYMENT" | "CONFIRMED",
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
    const { data, error } = await supabase.from(Tables.SPONSORS).select("*");

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching sponsors", null, error));
    }

    return res.status(StatusCode.SuccessOK).json(data);
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
 * @headers {string} Authorization - Bearer token for user authentication
 *
 * @returns {Object} JSON response containing:
 *   - Success (200): Sponsor object with the following structure:
 *     {
 *       sponsor_email: string,
 *       sponsor_name: string,
 *       company_name: string,
 *       notes: string,TED" | "REJECTED" | "NEED_PAYMENT" | "CONFIRMED",
 *       created_at: string,
 *       status: "PENDING_EMAIL" | "CONTAC
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
 * @headers {string} Authorization - Bearer token for user authentication
 *
 * @returns {Object} JSON response containing:
 *   - Success (200): Array of sponsor objects with the following structure:
 *     {
 *       sponsor_email: string,
 *       sponsor_name: string,
 *       company_name: string,
 *       notes: string,
 *       status: "PENDING_EMAIL" | "CONTACTED" | "REJECTED" | "NEED_PAYMENT" | "CONFIRMED",
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

        const { data, error } = await supabase.from(Tables.SPONSORS).select("*").ilike("company_name", `%${companyName}%`);

        if (error) {
            return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching sponsor", null, error));
        }

        return res.status(StatusCode.SuccessOK).json(data);
    },
);

export default sponsorRouter;
