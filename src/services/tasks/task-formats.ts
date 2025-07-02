import { Database } from "../../lib/db/schemas";

export type TaskInsert = Database["public"]["Tables"]["contact_tasks"]["Insert"];
export type TaskSelect = Database["public"]["Tables"]["contact_tasks"]["Row"];

export function isValidTaskInsertFormat(task: TaskInsert): boolean {
    if (!task) {
        return false;
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

    task.created_at = null;
    task.updated_at = null;

    return true;
}

export function isValidIdFormat(id: string): boolean {
    if (!id || typeof id !== "string") {
        return false;
    }

    return true;
}
