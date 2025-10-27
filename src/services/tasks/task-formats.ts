import { Constants, Database } from "../../lib/db/schemas";

export type TaskInsert = Database["public"]["Tables"]["contact_tasks"]["Insert"];
export type TaskSelect = Database["public"]["Tables"]["contact_tasks"]["Row"];
export type TaskUpdate = { status: Database["public"]["Enums"]["task_status"] };

export function isValidTaskInsertFormat(task: TaskInsert, user: any): boolean {
    if (!task) {
        return false;
    }

    if (!task.owner_id && user) {
        task.owner_id = user.id;
    }

    if (!task.sponsor_email || !task.owner_id || !task.due_date) {
        return false;
    }

    if (typeof task.sponsor_email !== "string" || typeof task.owner_id !== "string" || typeof task.due_date !== "string") {
        return false;
    }

    if (!task.notes) {
        task.notes = "";
    }

    // Convert Unix timestamp to Date object
    const timestamp = parseInt(task.due_date);
    if (isNaN(timestamp)) {
        return false;
    }
    task.due_date = new Date(timestamp * 1000).toISOString();

    return true;
}

export function isValidTaskUpdateFormat(body: any): body is TaskUpdate {
    if (!body || typeof body.status !== "string") {
        return false;
    }

    // Validate against the enum values from your schema constants
    const validStatuses = Constants.public.Enums.task_status;
    if (!validStatuses.includes(body.status as any)) {
        return false;
    }

    return true;
}

export function isValidIdFormat(id: string): boolean {
    if (!id || typeof id !== "string") {
        return false;
    }

    return true;
}
