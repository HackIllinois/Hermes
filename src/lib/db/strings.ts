export const Tables = {
    CONTACT_TASKS: "contact_tasks",
    EMAILS: "emails",
    EMAIL_THREADS: "email_threads",
    PROFILES: "profiles",
    SPONSORS: "sponsors",
    SCHEDULED_SENDS: "scheduled_sends",
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
    PENDING_EMAIL: "PENDING_EMAIL",
    SENT: "SENT",
    NEEDS_REPLY: "NEEDS_REPLY",
    BUMP_1: "BUMP_1",
    BUMP_2: "BUMP_2",
    BUMP_3: "BUMP_3",
    REJECTED: "REJECTED",
    GHOSTED: "GHOSTED",
    INVALID_CONTACT: "INVALID_CONTACT",
    DEFERRED: "DEFERRED",
} as const;

export const EmailReplyTypes = {
    REPLY: "REPLY",
    REPLY_ALL: "REPLY_ALL",
} as const;

export const SponsorStatus = {
    NOT_CONTACTED: "NOT_CONTACTED",
    CONTACTED: "CONTACTED",
    REJECTED: "REJECTED",
    NEED_PAYMENT: "NEED_PAYMENT",
    CONFIRMED: "CONFIRMED",
    INVALID_CONTACT: "INVALID_CONTACT",
    DEFERRED: "DEFERRED",
} as const;

export const ScheduleStatus = {
    PENDING: "PENDING",
    SENT: "SENT",
    ERROR: "ERROR",
} as const;
