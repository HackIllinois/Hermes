import { Constants, Database } from "../../lib/db/schemas";
import { TaskSelect } from "../tasks/task-formats";

export type SponsorInsert = Database["public"]["Tables"]["sponsors"]["Insert"];
export type SponsorSelect = Database["public"]["Tables"]["sponsors"]["Row"];
export type SponsorUpdate = Database["public"]["Tables"]["sponsors"]["Update"];
export type SponsorTaskProfile = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "name">;
export type SponsorContactTask = Pick<TaskSelect, "id" | "status" | "notes" | "due_date" | "owner_id"> & {
    profiles: SponsorTaskProfile | null;
};
export type SponsorWithContactTasks = SponsorSelect & {
    contact_tasks: SponsorContactTask[];
};
export type SponsorWithActiveTask = Omit<SponsorWithContactTasks, "contact_tasks"> & {
    active_task: SponsorContactTask | null;
};

export function isValidSponsorUpdateFormat(sponsor: SponsorUpdate): boolean {
    if (!sponsor) {
        return false;
    }

    if (typeof sponsor !== "object" || Array.isArray(sponsor) || Object.keys(sponsor).length === 0) {
        return false;
    }

    if (typeof sponsor.status !== "string") {
        return false;
    }

    if (!Constants.public.Enums.sponsor_status.includes(sponsor.status as any)) {
        return false;
    }

    return true;
}

export function isValidSponsorInsertFormat(sponsor: SponsorInsert): boolean {
    if (!sponsor) {
        return false;
    }

    if (!sponsor.sponsor_email || !sponsor.sponsor_name || !sponsor.company_name) {
        return false;
    }

    if (
        typeof sponsor.sponsor_email !== "string" ||
        typeof sponsor.sponsor_name !== "string" ||
        typeof sponsor.company_name !== "string"
    ) {
        return false;
    }

    return true;
}
