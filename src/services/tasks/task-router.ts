import { NextFunction, Router, Request, Response } from "express";
import { Tables } from "../../lib/db/strings";
import { supabase } from "../../lib/supabase";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";
import { isValidIdFormat, isValidTaskInsertFormat, TaskInsert } from "./task-formats";
import { createUser, requireLeadRole, requireMemberRole } from "../../middleware/auth";

const taskRouter: Router = Router();

/**
 * GET /tasks
 *
 * Retrieves all contact tasks from the database.
 *
 * @description This endpoint fetches all tasks stored in the contact_tasks table.
 *              Requires authentication and member role access.
 *
 * @headers {string} Authorization - Bearer token for user authentication
 *
 * @returns {Object} JSON response containing:
 *   - Success (200): Array of task objects with the following structure:
 *     {
 *       id: number,
 *       sponsor_email: string,
 *       owner_id: string,
 *       due_date: string,
 *       notes: string,
 *       status: "PENDING" | "SENT" | "FOLLOWED_UP" | "COMPLETED" | "REPLIED",
 *       created_at: string,
 *       updated_at: string
 *     }
 *   - Error (500): Error message if database query fails
 *
 * @throws {RouterError} 401 - Missing or invalid authentication token
 * @throws {RouterError} 403 - User does not have member role access
 * @throws {RouterError} 500 - Internal server error during database operation
 */
taskRouter.get("/", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const { data, error } = await supabase.from(Tables.CONTACT_TASKS).select("*");

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching tasks", null, error));
    }

    return res.status(StatusCode.SuccessOK).json(data);
});

/**
 * GET /tasks/:id
 *
 * Retrieves a specific contact task by its ID.
 *
 * @description This endpoint fetches a single task from the contact_tasks table
 *              based on the provided task ID. Requires authentication and member role access.
 *
 * @param {string} id - The unique identifier of the task to retrieve
 *
 * @headers {string} Authorization - Bearer token for user authentication
 *
 * @returns {Object} JSON response containing:
 *   - Success (200): Task object with the following structure:
 *     {
 *       id: number,
 *       sponsor_email: string,
 *       owner_id: string,
 *       due_date: string,
 *       notes: string,
 *       status: "PENDING" | "SENT" | "FOLLOWED_UP" | "COMPLETED" | "REPLIED",
 *       created_at: string,
 *       updated_at: string
 *     }
 *   - Error (400): Invalid task ID format
 *   - Error (500): Error message if database query fails
 *
 * @throws {RouterError} 400 - Invalid task ID format
 * @throws {RouterError} 401 - Missing or invalid authentication token
 * @throws {RouterError} 403 - User does not have member role access
 * @throws {RouterError} 500 - Internal server error during database operation
 */
taskRouter.get("/:id", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    if (!isValidIdFormat(id)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid task ID"));
    }

    const { data, error } = await supabase.from(Tables.CONTACT_TASKS).select("*").eq("id", parseInt(id));

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching task", null, error));
    }

    return res.status(StatusCode.SuccessOK).json(data);
});

/**
 * POST /tasks
 *
 * Creates a new contact task in the database.
 *
 * @description This endpoint creates a new task in the contact_tasks table.
 *              Requires authentication and member role access. The due_date should be
 *              provided as a Unix timestamp string which will be converted to ISO format.
 *
 * @body {Object} task - The task object to create with the following required fields:
 *   - sponsor_email: string - Email address of the sponsor
 *   - owner_id: string - ID of the user who owns the task
 *   - due_date: string - Unix timestamp as string for the task due date
 *   - notes: string (optional) - Additional notes for the task (defaults to empty string)
 *   - status: "PENDING" | "SENT" | "FOLLOWED_UP" | "COMPLETED" | "REPLIED" (optional, defaults to "PENDING")
 *
 * @headers {string} Authorization - Bearer token for user authentication
 *
 * @returns {Object} JSON response containing:
 *   - Success (200):
 *     {
 *       message: "Task created successfully",
 *       task_id: number
 *     }
 *   - Error (400): Invalid task format
 *   - Error (500): Error message if database insertion fails
 *
 * @throws {RouterError} 400 - Invalid task format (missing required fields or invalid data types)
 * @throws {RouterError} 401 - Missing or invalid authentication token
 * @throws {RouterError} 403 - User does not have member role access
 * @throws {RouterError} 500 - Internal server error during database operation
 */
taskRouter.post("/", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const task: TaskInsert = req.body as TaskInsert;

    if (!isValidTaskInsertFormat(task)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid task format"));
    }

    const { data: insertedTask, error: dbErr } = await supabase.from(Tables.CONTACT_TASKS).insert(task).select().single();

    if (dbErr) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error creating task", null, dbErr));
    }

    return res.status(StatusCode.SuccessOK).json({ message: "Task created successfully", task_id: insertedTask.id });
});

/**
 * GET /tasks/owner/:owner_id
 *
 * Retrieves all contact tasks owned by a specific user.
 *
 * @description This endpoint fetches all tasks from the contact_tasks table that are
 *              assigned to the specified owner_id. Requires authentication and lead role access.
 *
 * @param {string} owner_id - The unique identifier of the user whose tasks to retrieve
 *
 * @headers {string} Authorization - Bearer token for user authentication
 *
 * @returns {Object} JSON response containing:
 *   - Success (200): Array of task objects with the following structure:
 *     {
 *       id: number,
 *       sponsor_email: string,
 *       owner_id: string,
 *       due_date: string,
 *       notes: string,
 *       status: "PENDING" | "SENT" | "FOLLOWED_UP" | "COMPLETED" | "REPLIED",
 *       created_at: string,
 *       updated_at: string
 *     }
 *   - Error (400): Invalid user ID format
 *   - Error (500): Error message if database query fails
 *
 * @throws {RouterError} 400 - Invalid user ID format
 * @throws {RouterError} 401 - Missing or invalid authentication token
 * @throws {RouterError} 403 - User does not have lead role access
 * @throws {RouterError} 500 - Internal server error during database operation
 */
taskRouter.get("/owner/:owner_id", createUser, requireLeadRole, async (req: Request, res: Response, next: NextFunction) => {
    const { owner_id } = req.params;

    if (!isValidIdFormat(owner_id)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid user ID"));
    }

    const { data, error } = await supabase.from(Tables.CONTACT_TASKS).select("*").eq("owner_id", owner_id);

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching tasks", null, error));
    }

    return res.status(StatusCode.SuccessOK).json(data);
});
export default taskRouter;
