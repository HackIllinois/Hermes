import { Database } from "../../lib/db/schemas";

export type TemplateInsert = Database["public"]["Tables"]["templates"]["Insert"];
export type TemplateUpdate = Database["public"]["Tables"]["templates"]["Update"];

export function isValidTemplateInsertFormat(template: TemplateInsert): boolean {
    if (!template) {
        return false;
    }

    if (!template.template_name) {
        return false;
    }

    return true;
}

export function isValidTemplateIdFormat(id: string): boolean {
    if (!id) {
        return false;
    }

    if (Number.isNaN(id)) {
        return false;
    }

    return true;
}

export function isValidTemplateUpdateFormat(template: TemplateUpdate): boolean {
    if (!template) {
        return false;
    }

    if (!template.template_name) {
        return false;
    }

    return true;
}
