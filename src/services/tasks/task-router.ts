import { NextFunction, Router, Request, Response } from "express";
import { EmailStatus, Roles, SponsorStatus, Tables } from "../../lib/db/strings";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";
import { isValidIdFormat, isValidTaskInsertFormat, isValidTaskUpdateFormat, TaskInsert, TaskUpdate } from "./task-formats";
import { createUser, requireLeadRole, requireMemberRole } from "../../middleware/auth";
import { Database } from "../../lib/db/schemas";

const taskRouter: Router = Router();

/**
 * GET /tasks
 *
 * Retrieves all contact tasks from the database.
 *
 * @description This endpoint fetches all tasks stored in the contact_tasks table.
 *              Requires authentication and member role access.
 *
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
    const { owner_id } = req.query;
    const user = (req as any).user;

    const supabase = (req as any).supabase;

    let query = supabase.from(Tables.CONTACT_TASKS).select("*, sponsors(*)");

    if (owner_id && owner_id === "all") {
        // user requested tasks for everyone
    } else if (owner_id) {
        // User requested tasks for a specific owner
        query = query.eq("owner_id", owner_id as string);
    } else {
        // DEFAULT: No param provided, so return tasks for the logged-in user
        query = query.eq("owner_id", user.id);
    }

    const { data, error } = await query;

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
    const supabase = (req as any).supabase;
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
 * POST /tasks/create
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
taskRouter.post("/create", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const supabase = (req as any).supabase;
    const task: TaskInsert = req.body as TaskInsert;

    const user = (req as any).user;
    task.team_id = user.team_id;

    if (!isValidTaskInsertFormat(task, user)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid task format"));
    }

    const { data: existingTasks, error: checkError } = await supabase
        .from(Tables.CONTACT_TASKS)
        .select("id, status")
        .eq("sponsor_email", task.sponsor_email);

    if (checkError) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error checking existing tasks", null, checkError));
    }

    const hasActiveTask = existingTasks?.some(
        (t: any) =>
            t.status !== EmailStatus.REJECTED &&
            t.status !== EmailStatus.GHOSTED &&
            t.status !== EmailStatus.INVALID_CONTACT &&
            t.status !== EmailStatus.DEFERRED
    );
    if (hasActiveTask) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Sponsor already has an active task"));
    }

    const { data: insertedTask, error: dbErr } = await supabase.from(Tables.CONTACT_TASKS).insert(task).select().single();

    if (dbErr) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error creating task", null, dbErr));
    }

    // Reset sponsor status to NOT_CONTACTED so it reflects the fresh active task
    // THIS MEANS THAT CREATING A NEW TASK OVERWRITES ANY PREVIOUS STATUS!!!
    const { error: sponsorResetError } = await supabase
        .from(Tables.SPONSORS)
        .update({ status: SponsorStatus.NOT_CONTACTED, updated_at: new Date().toISOString() })
        .eq("sponsor_email", task.sponsor_email);

    if (sponsorResetError) {
        console.error(`Task ${insertedTask.id} created, but failed to reset sponsor ${task.sponsor_email} status:`, sponsorResetError);
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
    const supabase = (req as any).supabase;
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

/**
 * PATCH /tasks/:id
 *
 * Updates a specific contact task, primarily its status.
 *
 * @description This endpoint updates a task in the contact_tasks table.
 * It requires authentication and that the user is either the
 * task owner or a LEAD.
 *
 * **Crucially**, if the task status is updated to one of
 * REJECTED, GHOSTED, INVALID_CONTACT, or DEFERRED,
 * this endpoint will *also* update the status of the
 * corresponding sponsor in the `sponsors` table.
 *
 * @param {string} id - The unique identifier of the task to update
 *
 * @body {TaskUpdate} update - The update object, e.g., { status: "REJECTED" }
 *
 * @returns {Object} JSON response containing:
 * - Success (200): The updated task object
 * - Error (400): Invalid task ID or update format
 * - Error (403): User does not own the task and is not a LEAD
 * - Error (404): Task not found
 * - Error (500): Error message if database update fails
 *
 * @throws {RouterError} 400 - Invalid task ID or body format
 * @throws {RouterError} 401 - Missing or invalid authentication token
 * @throws {RouterError} 403 - User does not have permission
 * @throws {RouterError} 404 - Task not found
 * @throws {RouterError} 500 - Internal server error during database operation
 */
taskRouter.patch("/:id", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const supabase = (req as any).supabase;
    const { id } = req.params;
    const taskUpdate: TaskUpdate = req.body as TaskUpdate;
    const user = (req as any).user;

    // 1. Validate ID and Body
    if (!isValidIdFormat(id)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid task ID"));
    }

    if (!isValidTaskUpdateFormat(taskUpdate)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid update format. 'status' is required."));
    }

    const newStatus = taskUpdate.status;
    const taskId = parseInt(id);

    try {
        const { data: task, error: fetchError } = await supabase
            .from(Tables.CONTACT_TASKS)
            .select("owner_id, sponsor_email")
            .eq("id", taskId)
            .single();

        if (fetchError || !task) {
            return next(new RouterError(StatusCode.ClientErrorNotFound, "Task not found", null, fetchError));
        }

        // 3. Authorization Check: Must be owner or LEAD
        if (task.owner_id !== user.id && user.role !== Roles.LEAD) {
            return next(new RouterError(StatusCode.ClientErrorForbidden, "You do not have permission to update this task."));
        }

        // 4. Update the Task Status
        const { data: updatedTask, error: updateError } = await supabase
            .from(Tables.CONTACT_TASKS)
            .update({
                status: newStatus,
                updated_at: new Date().toISOString(),
            })
            .eq("id", taskId)
            .select()
            .single();

        if (updateError) {
            return next(new RouterError(StatusCode.ServerErrorInternal, "Error updating task", null, updateError));
        }

        const taskToSponsorStatusMap: Partial<
            Record<Database["public"]["Enums"]["task_status"], Database["public"]["Enums"]["sponsor_status"]>
        > = {
            [EmailStatus.REJECTED]: SponsorStatus.REJECTED,
            [EmailStatus.GHOSTED]: SponsorStatus.REJECTED,
            [EmailStatus.INVALID_CONTACT]: SponsorStatus.INVALID_CONTACT,
            [EmailStatus.DEFERRED]: SponsorStatus.DEFERRED,
        };

        const newSponsorStatus = taskToSponsorStatusMap[newStatus];

        if (newSponsorStatus) {
            const { error: sponsorUpdateError } = await supabase
                .from(Tables.SPONSORS)
                .update({
                    status: newSponsorStatus,
                    updated_at: new Date().toISOString(),
                })
                .eq("sponsor_email", task.sponsor_email);

            if (sponsorUpdateError) {
                // Non-fatal error: Log it but still return the successful task update
                console.error(`Task ${taskId} updated, but failed to update sponsor ${task.sponsor_email}:`, sponsorUpdateError);
            }
        }

        // 6. Return the updated task
        return res.status(StatusCode.SuccessOK).json(updatedTask);
    } catch (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error updating task", null, error));
    }
});
export default taskRouter;