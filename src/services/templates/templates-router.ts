import { Router, Request, Response, NextFunction } from "express";
import { createUser, requireMemberRole } from "../../middleware/auth";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";
import { Tables } from "../../lib/db/strings";
import {
    isValidTemplateIdFormat,
    isValidTemplateInsertFormat,
    isValidTemplateUpdateFormat,
    TemplateInsert,
    TemplateUpdate,
} from "./templates-formats";

const templatesRouter: Router = Router();

// GET /templates
// Lists all templates for the authenticated user
templatesRouter.get("/", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const supabase = (req as any).supabase;

    try {
        const { data, error } = await supabase
            .from(Tables.TEMPLATES)
            .select("*")
            .eq("user_id", user.id)
            .order("template_name", { ascending: true });

        if (error) {
            return next(new RouterError(StatusCode.ServerErrorInternal, "Failed to fetch templates.", null, error));
        }

        return res.status(StatusCode.SuccessOK).json(data);
    } catch (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "An unexpected error occurred.", null, error));
    }
});

// POST /templates
// Creates a new template for the authenticated user
templatesRouter.post("/", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const supabase = (req as any).supabase;

    let templateInsert: TemplateInsert = req.body as TemplateInsert;

    if (!isValidTemplateInsertFormat(templateInsert)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Template name is required."));
    }

    templateInsert.user_id = user.id;

    try {
        const { data, error } = await supabase.from(Tables.TEMPLATES).insert(templateInsert).select().single();

        if (error) {
            return next(new RouterError(StatusCode.ServerErrorInternal, "Failed to create template.", null, error));
        }

        return res.status(StatusCode.SuccessCreated).json(data);
    } catch (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "An unexpected error occurred.", null, error));
    }
});

// PUT /templates/:id
// Updates a specific template
templatesRouter.put("/:id", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const supabase = (req as any).supabase;
    const { idStr } = req.params;
    let templateUpdate: TemplateUpdate = req.body as TemplateUpdate;

    if (!isValidTemplateUpdateFormat(templateUpdate)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Template name is required."));
    }

    templateUpdate.updated_at = new Date().toISOString();

    if (!isValidTemplateIdFormat(idStr)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid template ID format."));
    }

    templateUpdate.user_id = user.id;

    const id = parseInt(idStr);

    try {
        // RLS will handle security, ensuring user_id matches
        const { data, error } = await supabase
            .from(Tables.TEMPLATES)
            .update(templateUpdate)
            .eq("id", id)
            .eq("user_id", user.id)
            .select()
            .single();

        if (error) {
            return next(new RouterError(StatusCode.ServerErrorInternal, "Failed to update template.", null, error));
        }

        return res.status(StatusCode.SuccessOK).json(data);
    } catch (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "An unexpected error occurred.", null, error));
    }
});

// DELETE /templates/:id
// Deletes a specific template
templatesRouter.delete("/:id", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const supabase = (req as any).supabase;
    const { idStr } = req.params;

    if (!isValidTemplateIdFormat(idStr)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid template ID."));
    }

    const id = parseInt(idStr);

    try {
        // RLS handles security
        const { error } = await supabase.from(Tables.TEMPLATES).delete().eq("id", id).eq("user_id", user.id); // Explicit check

        if (error) {
            return next(new RouterError(StatusCode.ServerErrorInternal, "Failed to delete template.", null, error));
        }

        return res.status(StatusCode.SuccessOK).json({ message: "Template deleted successfully." });
    } catch (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "An unexpected error occurred.", null, error));
    }
});

export default templatesRouter;
