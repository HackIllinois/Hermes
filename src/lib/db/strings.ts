export const Tables = {
    CONTACT_TASKS: "contact_tasks",
    EMAILS: "emails",
    EMAIL_THREADS: "email_threads",
    PROFILES: "profiles",
    SPONSORS: "sponsors",
} as const;

export const Roles = {
    LEAD: "LEAD",
    MEMBER: "MEMBER",
} as const;

export const EmailDirections = {
    INBOUND: "INBOUND",
    OUTBOUND: "OUTBOUND",
} as const;

export const EmailStatus = {
    PENDING: "PENDING",
    SENT: "SENT",
    REPLIED: "REPLIED",
    FOLLOWED_UP: "FOLLOWED_UP",
    COMPLETED: "COMPLETED",
} as const;

export const EmailReplyTypes = {
    REPLY: "REPLY",
    REPLY_ALL: "REPLY_ALL",
} as const;
