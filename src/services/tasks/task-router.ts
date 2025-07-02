import { NextFunction, Router, Request, Response } from "express";
import { Tables } from "../../lib/db/strings";
import { supabase } from "../../lib/supabase";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";
import { isValidIdFormat, isValidTaskInsertFormat, TaskInsert } from "./task-formats";

const taskRouter: Router = Router();

taskRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
    const { data, error } = await supabase.from(Tables.CONTACT_TASKS).select("*");

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching tasks", null, error));
    }

    return res.status(StatusCode.SuccessOK).json(data);
});

taskRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
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

taskRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
    const task: TaskInsert = req.body as TaskInsert;

    if (!isValidTaskInsertFormat(task)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid task format"));
    }

    const { error: dbErr } = await supabase.from(Tables.CONTACT_TASKS).insert(task);

    if (dbErr) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error creating task", null, dbErr));
    }

    return res.status(StatusCode.SuccessOK).json({ message: "Task created successfully" });
});

taskRouter.get("/owner/:id", async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    if (!isValidIdFormat(id)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid user ID"));
    }

    const { data, error } = await supabase.from(Tables.CONTACT_TASKS).select("*").eq("owner_id", id);

    if (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching tasks", null, error));
    }

    return res.status(StatusCode.SuccessOK).json(data);
});
export default taskRouter;
