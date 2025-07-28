import { Router, Request, Response, NextFunction } from "express";
import { createUser, requireMemberRole } from "../../middleware/auth";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";
import { EmailDirections, EmailReplyTypes, EmailStatus, Tables } from "../../lib/db/strings";
import { supabase } from "../../lib/supabase";
import { getGmailClient, makeRawMessage, parseGmailMessage } from "./email-helpers";
import { isValidEmailSendRequest, EmailSendRequest, EmailReplyRequest, isValidEmailReplyRequest } from "./email-formats";
import { EmailInsert, EmailThreadInsert } from "./email-helpers";
import { gmail_v1 } from "googleapis";

const emailRouter: Router = Router();

/**
 * POST /emails/send
 *
 * Sends an initial email to a sponsor for a specific contact task.
 *
 * @description This endpoint handles the complex process of sending the first email to a sponsor
 *              for a contact task. The process involves multiple steps:
 *
 *              1. **Validation**: Validates the request body format and ensures all required fields are present
 *              2. **Authorization**: Verifies the logged-in user owns the contact task they're trying to send for
 *              3. **Task Retrieval**: Fetches the contact task details including the sponsor email and owner information
 *              4. **Gmail Client Setup**: Gets an authenticated Gmail client for the task owner
 *              5. **Thread Check**: Verifies no email thread already exists for this task (prevents duplicate sends)
 *              6. **Email Construction**: Creates a properly formatted raw email message with headers, subject, and body
 *              7. **Gmail API Send**: Sends the email via Gmail API and gets back message and thread IDs
 *              8. **Database Updates**: Creates email thread record, records the sent email, and updates task status
 *
 *              The endpoint ensures proper email threading, maintains database consistency, and handles
 *              all the complexities of Gmail API integration including proper message formatting.
 *
 * @body {EmailSendRequest} sendRequest - The email send request with the following structure:
 *   - contact_task_id: number - ID of the contact task this email is for
 *   - subject: string - Email subject line
 *   - body: string - Email body content
 *   - cc: string[] (optional) - Array of email addresses to CC
 *   - bcc: string[] (optional) - Array of email addresses to BCC
 *
 * @headers {string} Authorization - Bearer token for user authentication
 *
 * @returns {Object} JSON response containing:
 *   - Success (200):
 *     {
 *       message: "Email sent successfully and task status updated.",
 *       data: {
 *         messageId: string,
 *         threadId: string
 *       }
 *     }
 *   - Error (400): Invalid request format, task not found, missing sponsor email, or thread already exists
 *   - Error (403): User does not own the contact task
 *   - Error (500): Gmail API failure or database error
 *
 * @throws {RouterError} 400 - Invalid request body format, contact task not found, missing sponsor email, or thread already exists
 * @throws {RouterError} 401 - Missing or invalid authentication token
 * @throws {RouterError} 403 - User does not have permission for this task
 * @throws {RouterError} 500 - Gmail API failure, database error, or unexpected error
 *
 * @see EmailSendRequest - Type definition for email send request
 * @see EmailInsert - Type definition for email database record
 * @see EmailThreadInsert - Type definition for email thread database record
 */
emailRouter.post("/send", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const sendRequest: EmailSendRequest = req.body;
    const user = (req as any).user; // User from createUser middleware

    // 1. Validate request body
    if (!isValidEmailSendRequest(sendRequest)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid request body format."));
    }

    const { contact_task_id, subject, body } = sendRequest;

    try {
        // 2. Fetch the contact task, its owner, and the associated sponsor
        const { data: task, error: taskError } = await supabase
            .from(Tables.CONTACT_TASKS)
            .select(`owner_id, sponsor_email, sponsors (sponsor_email)`)
            .eq("id", contact_task_id)
            .single();

        if (taskError || !task || !task.owner_id) {
            return next(new RouterError(StatusCode.ClientErrorNotFound, "Contact task not found.", null, taskError));
        }

        // 3. Authorization: Ensure the logged-in user owns the task
        if (task.owner_id !== user.id) {
            return next(new RouterError(StatusCode.ClientErrorForbidden, "You do not have permission for this task."));
        }

        // 4. Get the authenticated Gmail client for the task owner
        const gmail = await getGmailClient(task.owner_id);
        const senderEmail = user.email; // The sender is the authenticated user
        const sponsorEmail = task.sponsors?.sponsor_email;

        if (!sponsorEmail) {
            return next(new RouterError(StatusCode.ClientErrorBadRequest, "Task is missing sponsor email."));
        }

        // 5. Check if an email thread already exists for this task
        const { data: threadData } = await supabase
            .from(Tables.EMAIL_THREADS)
            .select("id, thread_id")
            .eq("task_id", contact_task_id)
            .maybeSingle();

        const existingGoogleThreadId = threadData?.thread_id;
        let messageList: string[] = [];

        if (existingGoogleThreadId) {
            return next(new RouterError(StatusCode.ClientErrorBadRequest, "Thread already exists."));
        }

        // 6. Construct and send the email via Gmail API
        const rawMessage = makeRawMessage(
            sponsorEmail,
            senderEmail,
            user.user_metadata?.name,
            subject,
            body,
            sendRequest.cc,
            sendRequest.bcc,
            [],
            undefined,
        );

        const requestBody: { raw: string; threadId?: string } = { raw: rawMessage };
        if (existingGoogleThreadId) {
            requestBody.threadId = existingGoogleThreadId;
        }

        const { data: sentMessage } = await gmail.users.messages.send({
            userId: "me",
            requestBody,
        });

        if (!sentMessage?.id || !sentMessage.threadId) {
            return next(new RouterError(StatusCode.ServerErrorInternal, "Failed to send email via Gmail API."));
        }

        // 7. Update database records post-send
        let dbThreadId = threadData?.id;

        // If no thread existed in our DB, create one now.
        if (!dbThreadId) {
            return next(new RouterError(StatusCode.ClientErrorBadRequest, "Failed to create thread in DB."));
        }

        const newThread: EmailThreadInsert = {
            task_id: contact_task_id,
            thread_id: sentMessage.threadId,
        };

        const { data: newDbThread, error: newDbThreadError } = await supabase
            .from(Tables.EMAIL_THREADS)
            .insert(newThread)
            .select("id")
            .single();

        if (newDbThreadError || !newDbThread) {
            console.error("CRITICAL: Email sent but failed to create DB thread record.", newDbThreadError);
            return next(
                new RouterError(
                    StatusCode.ServerErrorInternal,
                    "Email sent, but a server error occurred while tracking it. Please notify an admin.",
                    null,
                    newDbThreadError,
                ),
            );
        }
        dbThreadId = newDbThread.id;

        // Record the sent email in the `emails` table using the EmailInsert type.
        const newEmail: EmailInsert = {
            thread_id: dbThreadId,
            message_id: sentMessage.id,
            sender_email: senderEmail,
            subject: subject,
            body: body,
            direction: EmailDirections.OUTBOUND,
            sent_at: new Date().toISOString(),
        };
        await supabase.from(Tables.EMAILS).insert(newEmail);

        // Update the task status to 'SENT'.
        await supabase.from(Tables.CONTACT_TASKS).update({ status: EmailStatus.SENT }).eq("id", contact_task_id);

        // 8. Return success response
        return res.status(StatusCode.SuccessOK).json({
            message: "Email sent successfully and task status updated.",
            data: {
                messageId: sentMessage.id,
                threadId: sentMessage.threadId,
            },
        });
    } catch (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "An unexpected error occurred.", null, error));
    }
});

/**
 * POST /emails/reply
 *
 * Sends a reply to an existing email thread.
 *
 * @description This endpoint handles the complex process of replying to an existing email thread.
 *              The process involves multiple sophisticated steps:
 *
 *              1. **Validation**: Validates the reply request format and ensures all required fields are present
 *              2. **Gmail Client Setup**: Gets an authenticated Gmail client for the user
 *              3. **Original Message Retrieval**: Fetches the original message metadata from Gmail API to extract headers
 *              4. **Header Parsing**: Extracts critical headers (From, To, Cc, Subject, Message-ID, References) from the original message
 *              5. **Recipient Management**: Intelligently handles recipient lists based on reply type:
 *                 - REPLY: Sends only to the original sender
 *                 - REPLY_ALL: Includes all original recipients (excluding the user's own email)
 *              6. **Email Construction**: Creates a properly formatted reply with:
 *                 - Correct subject line (adds "Re:" prefix if not present)
 *                 - Proper threading headers (In-Reply-To, References)
 *                 - Appropriate recipient lists
 *              7. **Gmail API Send**: Sends the reply via Gmail API using the existing thread ID
 *              8. **Database Recording**: Records the sent reply in the database and optionally updates task status
 *
 *              The endpoint ensures proper email threading, maintains conversation context,
 *              and handles the complexities of Gmail's threading system.
 *
 * @body {EmailReplyRequest} replyRequest - The email reply request with the following structure:
 *   - thread_id: string - Gmail thread ID for the conversation
 *   - message_id_to_reply_to: string - Gmail message ID of the message being replied to
 *   - body: string - Reply email body content
 *   - reply_type: "REPLY" | "REPLY_ALL" - Type of reply (single recipient vs all recipients)
 *   - cc: string[] (optional) - Additional email addresses to CC
 *   - bcc: string[] (optional) - Additional email addresses to BCC
 *
 * @headers {string} Authorization - Bearer token for user authentication
 *
 * @returns {Object} JSON response containing:
 *   - Success (200):
 *     {
 *       message: "Reply sent successfully.",
 *       data: gmail_v1.Schema$Message
 *     }
 *   - Error (400): Invalid request format or missing original message headers
 *   - Error (500): Gmail API failure or database error
 *
 * @throws {RouterError} 400 - Invalid request body format or missing original message headers
 * @throws {RouterError} 401 - Missing or invalid authentication token
 * @throws {RouterError} 403 - User does not have member role access
 * @throws {RouterError} 500 - Gmail API failure, database error, or unexpected error
 *
 * @see EmailReplyRequest - Type definition for email reply request
 * @see EmailInsert - Type definition for email database record
 * @see EmailReplyTypes - Available reply types (REPLY, REPLY_ALL)
 */
emailRouter.post("/reply", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const replyRequest: EmailReplyRequest = req.body;

    if (!isValidEmailReplyRequest(replyRequest)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid request body format."));
    }

    const user = (req as any).user;
    const gmail = await getGmailClient(user.id);

    try {
        const originalMessage = await gmail.users.messages.get({
            userId: "me",
            id: req.body.message_id_to_reply_to,
            format: "metadata",
            metadataHeaders: ["From", "To", "Cc", "Subject", "Message-ID", "References"],
        });

        const headers = originalMessage.data.payload?.headers;
        if (!headers) {
            return next(new RouterError(StatusCode.ClientErrorBadRequest, "Original message headers not found."));
        }

        const originalFrom = headers.find((h) => h.name === "From")?.value || "";
        const originalTo = headers.find((h) => h.name === "To")?.value || "";
        const originalCc = headers.find((h) => h.name === "Cc")?.value || "";
        const originalSubject = headers.find((h) => h.name === "Subject")?.value || "";
        const originalMessageId = headers.find((h) => h.name === "Message-ID")?.value;
        const originalReferences = headers.find((h) => h.name === "References")?.value;

        if (!originalMessageId || !originalFrom) {
            return next(
                new RouterError(StatusCode.ClientErrorBadRequest, "Cannot reply: original message is missing key headers."),
            );
        }

        let to: string[] = [];
        let cc: string[] = [...(replyRequest.cc || [])];

        const fromEmail = originalFrom.includes("<") ? originalFrom.split("<")[1].split(">")[0] : originalFrom;
        to.push(fromEmail);

        if (replyRequest.reply_type === EmailReplyTypes.REPLY_ALL) {
            const allRecipients = (originalTo + "," + originalCc).split(",").filter((e) => e.trim() !== "");
            for (const recipient of allRecipients) {
                const email = recipient.includes("<") ? recipient.split("<")[1].split(">")[0] : recipient.trim();
                // Add to CC if it's not the user's own email and not already in the 'To' list
                if (email !== user.email && !to.includes(email)) {
                    cc.push(email);
                }
            }
        }

        cc = [...new Set(cc)];

        const newReferences = originalReferences ? `${originalReferences} ${originalMessageId}` : originalMessageId;
        const newSubject = originalSubject.toLowerCase().startsWith("re:") ? originalSubject : `Re: ${originalSubject}`;

        const rawMessage = makeRawMessage(
            to.join(", "),
            user.email,
            user.user_metadata?.name,
            newSubject,
            replyRequest.body,
            cc,
            replyRequest.bcc,
            [newReferences], // Pass as messageIdList
            originalMessage.data.threadId!, // Use the existing threadId
        );

        const { data: sentMessage } = await gmail.users.messages.send({
            userId: "me",
            requestBody: {
                raw: rawMessage,
                threadId: originalMessage.data.threadId,
            },
        });

        if (!sentMessage.id) {
            return next(new RouterError(StatusCode.ServerErrorInternal, "Failed to send reply via Gmail API."));
        }

        // 5. Record the sent reply in your database
        const { data: dbThread } = await supabase
            .from(Tables.EMAIL_THREADS)
            .select("id, task_id")
            .eq("thread_id", originalMessage.data.threadId!)
            .single();
        if (dbThread) {
            const newEmail: EmailInsert = {
                thread_id: dbThread.id,
                message_id: sentMessage.id,
                sender_email: user.email,
                subject: newSubject,
                body: replyRequest.body,
                direction: EmailDirections.OUTBOUND,
                sent_at: new Date().toISOString(),
            };
            await supabase.from(Tables.EMAILS).insert(newEmail);
            // Optionally update the task status to FOLLOWED_UP
            // await supabase.from(Tables.CONTACT_TASKS).update({ status: EmailStatus.FOLLOWED_UP }).eq("id", dbThread.task_id);
        }

        return res.status(StatusCode.SuccessOK).json({ message: "Reply sent successfully.", data: sentMessage });
    } catch (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "An unexpected error occurred.", null, error));
    }
});

/**
 * GET /emails/profile
 *
 * Retrieves the Gmail profile information for the authenticated user.
 *
 * @description This endpoint fetches the Gmail profile information for the currently authenticated user.
 *              It uses the user's stored Gmail tokens to authenticate with the Gmail API and retrieve
 *              their profile details including email address, display name, and other Gmail account information.
 *
 * @headers {string} Authorization - Bearer token for user authentication
 *
 * @returns {Object} JSON response containing:
 *   - Success (200):
 *     {
 *       message: "Profile fetched successfully.",
 *       data: gmail_v1.Schema$Profile
 *     }
 *   - Error (500): Gmail API failure or authentication error
 *
 * @throws {RouterError} 401 - Missing or invalid authentication token
 * @throws {RouterError} 403 - User does not have member role access
 * @throws {RouterError} 500 - Gmail API failure or authentication error
 *
 * @see gmail_v1.Schema$Profile - Gmail profile data structure
 */
emailRouter.get("/profile", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const gmail = await getGmailClient(user.id);

    const profile = await gmail.users.getProfile({ userId: "me" });

    return res.status(StatusCode.SuccessOK).json({
        message: "Profile fetched successfully.",
        data: profile,
    });
});

/**
 * GET /emails/sync
 *
 * Synchronizes new incoming emails from Gmail with the local database.
 *
 * @description This endpoint performs a complex synchronization process to fetch and process new emails
 *              from Gmail that have arrived since the last sync. This is a temporary solution while
 *              waiting to implement a proper pub/sub client for real-time email notifications.
 *
 *              The synchronization process involves multiple sophisticated steps:
 *
 *              1. **Profile Retrieval**: Fetches the user's profile to get the last processed history ID
 *              2. **History ID Validation**: Ensures a valid history ID exists for incremental sync
 *              3. **Gmail History API**: Uses Gmail's history API to get all changes since the last sync
 *              4. **Message Filtering**: Filters for only "messageAdded" events (new incoming emails)
 *              5. **Thread Tracking**: Identifies which new messages belong to tracked email threads
 *              6. **Content Fetching**: Downloads full message content only for messages in tracked threads
 *              7. **Email Processing**: Parses Gmail messages and extracts relevant information
 *              8. **Database Updates**: Records new emails and updates task statuses
 *              9. **History ID Update**: Updates the last processed history ID for future syncs
 *
 *              The endpoint is optimized to only process emails that belong to tracked sponsor conversations,
 *              avoiding unnecessary processing of unrelated emails. It also handles the complexities of
 *              Gmail's threading system and ensures proper task status updates when sponsors reply.
 *
 * @headers {string} Authorization - Bearer token for user authentication
 *
 * @returns {Object} JSON response containing:
 *   - Success (200):
 *     {
 *       message: "Sync complete. Processed X new email(s)." | "No new messages to sync." | "No relevant messages found in history." | "New messages found, but none in tracked threads."
 *     }
 *   - Error (400): No history ID found for user
 *   - Error (500): Profile fetch error, thread query error, or unexpected error
 *
 * @throws {RouterError} 400 - No history ID found for user
 * @throws {RouterError} 401 - Missing or invalid authentication token
 * @throws {RouterError} 403 - User does not have member role access
 * @throws {RouterError} 500 - Profile fetch error, thread query error, or unexpected error
 *
 * @note This is a temporary solution while waiting to implement a proper pub/sub client for real-time email notifications.
 *       The sync process uses Gmail's history API for incremental updates and only processes emails in tracked threads.
 *
 * @see ParsedEmail - Type definition for parsed email data
 * @see EmailInsert - Type definition for email database record
 * @see EmailDirections - Email direction constants (INBOUND, OUTBOUND)
 * @see EmailStatus - Task status constants (PENDING, SENT, REPLIED, etc.)
 */
emailRouter.get("/sync", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    try {
        const { data: profile, error: profileError } = await supabase
            .from(Tables.PROFILES)
            .select("last_history_id")
            .eq("id", user.id)
            .single();

        if (profileError || !profile) {
            return next(new RouterError(StatusCode.ServerErrorInternal, "Failed to fetch profile.", null, profileError));
        }

        const lastHistoryId = profile.last_history_id;

        if (!lastHistoryId) {
            return next(new RouterError(StatusCode.ClientErrorBadRequest, "No history ID found for user."));
        }

        const gmail = await getGmailClient(user.id);

        const historyResponse = await gmail.users.history.list({
            userId: "me",
            startHistoryId: lastHistoryId.toString(),
            historyTypes: ["messageAdded"],
            maxResults: 500,
        });

        const { history, historyId: newHistoryId } = historyResponse.data;

        if (!history || history.length === 0) {
            if (newHistoryId) {
                await supabase.from(Tables.PROFILES).update({ last_history_id: newHistoryId }).eq("id", user.id);
            }

            return res.status(StatusCode.SuccessOK).json({
                message: "No new messages to sync.",
            });
        }

        const newMessagesMetadata = history
            .flatMap((h) => h.messagesAdded || [])
            .map((ma) => ma.message)
            .filter((msg): msg is gmail_v1.Schema$Message => !!msg);

        if (newMessagesMetadata.length === 0) {
            if (newHistoryId) {
                await supabase.from(Tables.PROFILES).update({ last_history_id: newHistoryId }).eq("id", user.id);
            }
            return res.status(StatusCode.SuccessOK).json({ message: "No relevant messages found in history." });
        }

        const googleThreadIds = [...new Set(newMessagesMetadata.map((msg) => msg.threadId!))];

        const { data: trackedDbThreads, error: threadsError } = await supabase
            .from(Tables.EMAIL_THREADS)
            .select("id, thread_id, task_id")
            .in("thread_id", googleThreadIds);

        if (threadsError) {
            return next(new RouterError(StatusCode.ServerErrorInternal, "Failed to query tracked threads.", null, threadsError));
        }

        if (!trackedDbThreads || trackedDbThreads.length === 0) {
            if (newHistoryId) {
                await supabase.from(Tables.PROFILES).update({ last_history_id: newHistoryId }).eq("id", user.id);
            }
            return res.status(StatusCode.SuccessOK).json({ message: "New messages found, but none in tracked threads." });
        }

        const dbThreadMap = new Map(trackedDbThreads.map((t) => [t.thread_id, { dbId: t.id, taskId: t.task_id }]));
        let syncedMessageCount = 0;

        // 5. Fetch full content ONLY for messages in tracked threads
        for (const messageMeta of newMessagesMetadata) {
            // Check if this message's thread is one we are tracking
            if (messageMeta.id && dbThreadMap.has(messageMeta.threadId!)) {
                const messageResponse = await gmail.users.messages.get({
                    userId: "me",
                    id: messageMeta.id,
                    format: "full",
                });

                const fullMessage = messageResponse.data;
                const parsedEmail = parseGmailMessage(fullMessage); // Assumes you have this helper

                // Make sure this is an INBOUND email (sender is not the user)
                if (parsedEmail.from !== user.email) {
                    const threadInfo = dbThreadMap.get(fullMessage.threadId!);
                    if (!threadInfo) continue; // Should not happen, but a good safeguard

                    const newEmailRecord: EmailInsert = {
                        thread_id: threadInfo.dbId,
                        message_id: fullMessage.id!,
                        sender_email: parsedEmail.from,
                        subject: parsedEmail.subject,
                        body: parsedEmail.body,
                        direction: EmailDirections.INBOUND,
                        sent_at: parsedEmail.date ? new Date(parsedEmail.date).toISOString() : new Date().toISOString(),
                    };

                    // 6a. INSERT the new email record into your database
                    await supabase.from(Tables.EMAILS).insert(newEmailRecord);

                    // 6b. UPDATE the corresponding task status to 'REPLIED'
                    await supabase.from(Tables.CONTACT_TASKS).update({ status: EmailStatus.REPLIED }).eq("id", threadInfo.taskId);

                    syncedMessageCount++;
                }
            }
        }

        // 7. CRITICAL: Update the history ID for the profile after processing is complete
        if (newHistoryId) {
            await supabase.from(Tables.PROFILES).update({ last_history_id: newHistoryId }).eq("id", user.id);
        }

        return res.status(StatusCode.SuccessOK).json({
            message: `Sync complete. Processed ${syncedMessageCount} new email(s).`,
        });
    } catch (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "An unexpected error occurred.", null, error));
    }
});

export default emailRouter;
