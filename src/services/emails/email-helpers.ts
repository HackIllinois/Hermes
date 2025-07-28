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
 * @param messageIdList Optional list of message IDs to include in the References header.
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
    messageIdList?: string[],
    threadId?: string,
) {
    if (!fromName) {
        fromName = "HackIllinois";
    }
    // Format the "From" header to include both the name and the email address.
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

    if (threadId && messageIdList && messageIdList.length > 0) {
        // The last ID in the references list is what we are replying to.
        const referencesIds = messageIdList[0].split(" ");
        const inReplyToId = referencesIds[referencesIds.length - 1];

        lines.unshift(`In-Reply-To: ${inReplyToId}`, `References: ${messageIdList[0]}`);
    }

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

    // Safely find and parse headers
    const fromHeader = headers?.find((h) => h.name === "From")?.value || "";
    const subjectHeader = headers?.find((h) => h.name === "Subject")?.value || "";
    const dateHeader = headers?.find((h) => h.name === "Date")?.value || null;

    // Extract just the email address from a header like "Name <email@example.com>"
    const fromEmail = fromHeader.includes("<") ? fromHeader.split("<")[1].split(">")[0] : fromHeader;

    /**
     * Recursively finds the plain text part of an email body.
     * @param part The message part to search within.
     * @returns The Base64 encoded data of the plain text body, or null.
     */
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
            // Decode the Base64 encoded body
            body = Buffer.from(plainTextPart.body.data, "base64").toString("utf8");
        }
    }

    return {
        messageId: message.id!,
        from: fromEmail,
        subject: subjectHeader,
        body: body,
        date: dateHeader,
    };
}
