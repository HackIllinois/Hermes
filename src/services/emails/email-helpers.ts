import { google } from "googleapis";
import { EmailDirections, Tables } from "../../lib/db/strings";
import { supabase } from "../../lib/supabase";
import { BASE_BACKEND_URL, config } from "../../config";
import { Database } from "../../lib/db/schemas";
import { gmail_v1 } from "googleapis";
import { ParsedEmail } from "./email-formats";

/**
 * Creates a raw, base64-encoded email message.
 * @param to The recipient's email address.
 * @param fromEmail The sender's email address.
 * @param fromName The sender's display name.
 * @param subject The email subject.
 * @param message The plain text body of the email.
 * @param cc Optional list of CC recipients.
 * @param bcc Optional list of BCC recipients.
 * @param inReplyTo Optional ID of the message this is a reply to.
 * @param references Optional space-separated string of message IDs for the References header.
 * @param threadId Optional Google thread ID to make this email a reply.
 * @returns A base64url-encoded string representing the raw email.
 */
export function makeRawMessage(
    to: string,
    fromEmail: string,
    fromName: string,
    subject: string,
    message: string,
    cc?: string[],
    bcc?: string[],
    inReplyTo?: string,
    references?: string,
    threadId?: string,
) {
    if (!fromName) {
        fromName = "HackIllinois";
    }
    const fromHeader = `"${fromName}" <${fromEmail}>`;

    const lines = [
        `From: ${fromHeader}`,
        `To: ${to}`,
        ...(cc?.length ? [`Cc: ${cc.join(", ")}`] : []),
        ...(bcc?.length ? [`Bcc: ${bcc.join(", ")}`] : []),
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset="UTF-8"`,
        "",
        message,
    ];

    if (inReplyTo && references) {
        // According to RFC 2822, msg-id should be enclosed in < >
        const formattedInReplyTo = `<${inReplyTo}>`;

        // The references header should be a space-separated list of msg-ids, each in < >
        const formattedReferences = references
            .split(" ")
            .filter((id) => id) // Remove any empty strings that might result from splitting
            .map((id) => `<${id}>`)
            .join(" ");

        lines.unshift(`In-Reply-To: ${formattedInReplyTo}`);
        lines.unshift(`References: ${formattedReferences}`);
    } else if (inReplyTo) {
        // Handle case where it's a reply but references are missing (less ideal, but safe)
        lines.unshift(`In-Reply-To: <${inReplyTo}>`);
    }

    console.log(lines.join("\r\n"));

    return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export async function getGmailClient(userId: string) {
    // Fetch the user's profile to get their stored Google tokens.
    const { data: profile } = await supabase.from(Tables.PROFILES).select("gmail_token, gmail_refresh").eq("id", userId).single();

    if (!profile?.gmail_refresh) {
        throw new Error("User has not authenticated with Google or no refresh token is available.");
    }

    const oauth2Client = new google.auth.OAuth2(
        config.GOOGLE_CLIENT_ID,
        config.GOOGLE_CLIENT_SECRET,
        BASE_BACKEND_URL + "/auth/callback",
    );

    // Set the credentials from the user's profile.
    oauth2Client.setCredentials({
        access_token: profile.gmail_token,
        refresh_token: profile.gmail_refresh,
    });

    // ✨ **Add a listener for token refresh events.**
    // This will fire when the Google client library uses the refresh token to get a new access token.
    oauth2Client.on("tokens", async (tokens) => {
        if (tokens.access_token) {
            // Update the user's profile in the database with the new access token.
            await supabase
                .from(Tables.PROFILES)
                .update({
                    gmail_token: tokens.access_token,
                    // A new refresh token is sometimes provided, so update it if it exists.
                    gmail_refresh: tokens.refresh_token ?? profile.gmail_refresh,
                })
                .eq("id", userId);
        }
    });

    return google.gmail({ version: "v1", auth: oauth2Client });
}

export type EmailInsert = Database["public"]["Tables"]["emails"]["Insert"];

// Type alias for selecting a row from the 'emails' table
export type EmailSelect = Database["public"]["Tables"]["emails"]["Row"];

// Type alias for inserting a new row into the 'email_threads' table
export type EmailThreadInsert = Database["public"]["Tables"]["email_threads"]["Insert"];

// Type alias for selecting a row from the 'email_threads' table
export type EmailThreadSelect = Database["public"]["Tables"]["email_threads"]["Row"];

/**
 * Parses a complex Gmail message object into a simple, usable format.
 * @param message The full message object from the Gmail API.
 * @returns A ParsedEmail object.
 */
export function parseGmailMessage(message: gmail_v1.Schema$Message): ParsedEmail {
    const headers = message.payload?.headers;

    const fromHeader = headers?.find((h) => h.name === "From")?.value || "";
    const toHeader = headers?.find((h) => h.name === "To")?.value || "";
    const ccHeader = headers?.find((h) => h.name === "Cc")?.value || "";
    const bccHeader = headers?.find((h) => h.name === "Bcc")?.value || "";
    const subjectHeader = headers?.find((h) => h.name === "Subject")?.value || "";
    const dateHeader = headers?.find((h) => h.name === "Date")?.value || null;
    const messageIdHeader = headers?.find((h) => h.name === "Message-ID")?.value || null;
    const inReplyToHeader = headers?.find((h) => h.name === "In-Reply-To")?.value || null;
    const referencesHeader = headers?.find((h) => h.name === "References")?.value || null;

    // Helper to strip surrounding angle brackets from a single ID
    const stripBrackets = (id: string | null): string | null => (id ? id.replace(/^<|>$/g, "") : null);

    // For the References header, split the string, strip brackets from each ID, then rejoin.
    const parsedReferences = referencesHeader
        ? referencesHeader
              .trim()
              .split(/\s+/)
              .map(stripBrackets)
              .filter((id) => id)
              .join(" ")
        : null;

    const fromEmail = fromHeader.includes("<") ? fromHeader.split("<")[1].split(">")[0] : fromHeader;
    const toEmails = toHeader.split(",").map((email) => email.trim());
    const ccEmails = ccHeader.split(",").map((email) => email.trim());
    const bccEmails = bccHeader.split(",").map((email) => email.trim());

    const findPlainTextPart = (part: gmail_v1.Schema$MessagePart): gmail_v1.Schema$MessagePart | null => {
        if (part.mimeType === "text/plain" && part.body?.data) {
            return part;
        }

        if (part.parts) {
            for (const subPart of part.parts) {
                const found = findPlainTextPart(subPart);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    };

    let body = "";
    if (message.payload) {
        const plainTextPart = findPlainTextPart(message.payload);
        if (plainTextPart && plainTextPart.body?.data) {
            body = Buffer.from(plainTextPart.body.data, "base64").toString("utf8");
        }
    }

    return {
        messageId: stripBrackets(messageIdHeader) || message.id!,
        inReplyTo: stripBrackets(inReplyToHeader),
        from: fromEmail,
        to: toEmails,
        cc: ccEmails,
        bcc: bccEmails,
        subject: subjectHeader,
        body: body,
        date: dateHeader,
        references: parsedReferences,
    };
}

export function stripBrackets(v: string | null) {
    return v ? v.replace(/^<|>$/g, "") : null;
}

export function getHeaderVal(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string) {
    return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}
