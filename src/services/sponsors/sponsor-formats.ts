import { Database } from "../../lib/db/schemas";

export type SponsorInsert = Database["public"]["Tables"]["sponsors"]["Insert"];
export type SponsorSelect = Database["public"]["Tables"]["sponsors"]["Row"];

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

    sponsor.created_at = null;
    sponsor.updated_at = null;

    return true;
}
