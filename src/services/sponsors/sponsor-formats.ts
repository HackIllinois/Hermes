import { Constants, Database } from "../../lib/db/schemas";

export type SponsorInsert = Database["public"]["Tables"]["sponsors"]["Insert"];
export type SponsorSelect = Database["public"]["Tables"]["sponsors"]["Row"];
export type SponsorUpdate = Database["public"]["Tables"]["sponsors"]["Update"];

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
