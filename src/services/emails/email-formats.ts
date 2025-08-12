import { EmailReplyTypes } from "../../lib/db/strings";

export type EmailSendRequest = {
    contact_task_id: number;
    subject: string;
    body: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
};

export type ParsedEmail = {
    messageId: string;
    inReplyTo: string | null;
    from: string;
    subject: string;
    to: string[];
    cc: string[];
    bcc: string[];
    body: string;
    date: string | null;
    references: string | null;
};

export interface EmailReplyRequest {
    db_thread_id: number;
    message_id_to_reply_to: string;
    body: string;
    reply_type: "REPLY" | "REPLY_ALL";
    cc?: string[];
    bcc?: string[];
}

export function isValidEmailSendRequest(req: EmailSendRequest): boolean {
    if (!req) {
        return false;
    }
    if (typeof req.contact_task_id !== "number" || typeof req.subject !== "string" || typeof req.body !== "string") {
        return false;
    }
    return true;
}

export function isValidEmailReplyRequest(req: EmailReplyRequest): boolean {
    if (!req || !req.db_thread_id || !req.message_id_to_reply_to || !req.body || !req.reply_type) {
        return false;
    }
    if (
        typeof req.db_thread_id !== "number" ||
        typeof req.message_id_to_reply_to !== "string" ||
        typeof req.body !== "string" ||
        !Object.values(EmailReplyTypes).includes(req.reply_type)
    ) {
        return false;
    }

    if (req.cc && req.cc.some((email) => typeof email !== "string")) {
        return false;
    }

    if (req.bcc && req.bcc.some((email) => typeof email !== "string")) {
        return false;
    }
    return true;
}
