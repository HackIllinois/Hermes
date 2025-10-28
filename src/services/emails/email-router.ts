import { Router, Request, Response, NextFunction } from "express";
import { createUser, requireMemberRole } from "../../middleware/auth";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";
import { EmailDirections, EmailReplyTypes, EmailStatus, SponsorStatus, Tables } from "../../lib/db/strings";
import { supabase } from "../../lib/supabase";
import { getGmailClient, getHeaderVal, makeRawMessage, parseGmailMessage, stripBrackets } from "./email-helpers";
import { isValidEmailSendRequest, EmailSendRequest, EmailReplyRequest, isValidEmailReplyRequest } from "./email-formats";
import { EmailInsert, EmailThreadInsert } from "./email-helpers";
import { gmail_v1 } from "googleapis";
import { isValidIdFormat } from "../tasks/task-formats";
import { Database } from "../../lib/db/schemas";
import { PUBSUB_TOPIC } from "../../app";

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

        const toList = Array.from(
            new Set((sendRequest.to && sendRequest.to.length > 0 ? sendRequest.to : [sponsorEmail]).map((e) => e.toLowerCase())),
        );

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
            toList.join(", "),
            senderEmail,
            user.user_metadata?.name,
            subject,
            body,
            sendRequest.cc,
            sendRequest.bcc,
            undefined,
            undefined,
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

        const sentMeta = await gmail.users.messages.get({
            userId: "me",
            id: sentMessage.id!, // Gmail internal id
            format: "metadata",
            metadataHeaders: ["Message-ID"],
        });

        const rfcMsgId = stripBrackets(getHeaderVal(sentMeta.data.payload?.headers, "Message-ID"));

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
        let dbThreadId = newDbThread.id;

        // Record the sent email in the `emails` table using the EmailInsert type.
        const newEmail: EmailInsert = {
            thread_id: dbThreadId,
            gmail_message_id: sentMessage.id,
            sender_email: senderEmail,
            subject: subject,
            body: body,
            direction: EmailDirections.OUTBOUND,
            sent_at: new Date().toISOString(),
            to_recipients: toList,
            cc_recipients: sendRequest.cc || [],
            bcc_recipients: sendRequest.bcc || [],
            rfc_in_reply_to: null,
            rfc_message_id: rfcMsgId,
            rfc_references: null,
        };

        await supabase.from(Tables.EMAILS).insert(newEmail);

        // Update the task status to 'SENT'.
        await supabase
            .from(Tables.CONTACT_TASKS)
            .update({
                status: EmailStatus.SENT,
                updated_at: new Date().toISOString(),
            })
            .eq("id", contact_task_id);

        await supabase
            .from(Tables.SPONSORS)
            .update({
                status: SponsorStatus.CONTACTED,
                updated_at: new Date().toISOString(),
            })
            .eq("sponsor_email", sponsorEmail);

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

emailRouter.post("/reply", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const replyRequest: EmailReplyRequest = req.body;

    if (!isValidEmailReplyRequest(replyRequest)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid request body format."));
    }

    const user = (req as any).user;
    const gmail = await getGmailClient(user.id);

    try {
        const { data: dbThread, error: threadError } = await supabase
            .from(Tables.EMAIL_THREADS)
            .select("id, task_id, thread_id")
            .eq("id", replyRequest.db_thread_id)
            .single();

        if (threadError || !dbThread) {
            return next(
                new RouterError(StatusCode.ClientErrorNotFound, "Email thread not found in database.", null, threadError),
            );
        }

        const googleThreadId = dbThread.thread_id;

        const { data: emailToReplyTo, error: emailToReplyToError } = await supabase
            .from(Tables.EMAILS)
            .select("*")
            .eq("gmail_message_id", replyRequest.message_id_to_reply_to)
            .single();

        if (emailToReplyToError || !emailToReplyTo) {
            return next(
                new RouterError(StatusCode.ClientErrorNotFound, "Email to reply to not found.", null, emailToReplyToError),
            );
        }

        let to: string[] = [];
        let cc: string[] = [...(replyRequest.cc || [])]; // Start with any new CCs from the request

        const isReplyingToSelf = emailToReplyTo.sender_email === user.email;

        if (isReplyingToSelf) {
            const originalTo = emailToReplyTo.to_recipients || [];
            const originalCc = emailToReplyTo.cc_recipients || [];

            to.push(...originalTo);
            cc.push(...originalCc);
        } else {
            // SCENARIO: User is replying to an email from someone else.
            const originalSender = emailToReplyTo.sender_email;
            to.push(originalSender);

            if (replyRequest.reply_type === EmailReplyTypes.REPLY_ALL) {
                // Add original 'To' list to CC (excluding user and new 'To' recipient)
                (emailToReplyTo.to_recipients || []).forEach((recipient) => {
                    if (recipient !== user.email && recipient !== originalSender) {
                        cc.push(recipient);
                    }
                });
                // Add original 'Cc' list to CC (excluding user)
                (emailToReplyTo.cc_recipients || []).forEach((recipient) => {
                    if (recipient !== user.email) {
                        cc.push(recipient);
                    }
                });
            }
        }

        // Final cleanup: remove duplicates and the user's own email from the final lists.
        to = [...new Set(to.filter((email) => email !== user.email))];
        cc = [...new Set(cc.filter((email) => email !== user.email && !to.includes(email)))];

        // This is a safeguard. If 'To' becomes empty, move the first 'Cc' to 'To'.
        if (to.length === 0 && cc.length > 0) {
            to.push(cc.shift()!);
        }

        if (to.length === 0) {
            return next(new RouterError(StatusCode.ClientErrorBadRequest, "Could not determine a recipient for the reply."));
        }

        const parentRfcId = emailToReplyTo.rfc_message_id || stripBrackets(emailToReplyTo.gmail_message_id) || null;

        if (!parentRfcId) {
            return next(
                new RouterError(
                    StatusCode.ClientErrorBadRequest,
                    "Missing RFC Message-ID to reply to (cannot set In-Reply-To/References).",
                ),
            );
        }

        const newSubject = emailToReplyTo.subject?.toLowerCase().startsWith("re:")
            ? emailToReplyTo.subject
            : `Re: ${emailToReplyTo.subject}`;

        const referencesHeaderValue = [
            emailToReplyTo.rfc_references, // may be null/empty
            parentRfcId,
        ]
            .filter(Boolean)
            .join(" ");

        const rawMessage = makeRawMessage(
            to.join(", "),
            user.email,
            user.user_metadata?.name,
            newSubject!,
            replyRequest.body,
            cc,
            replyRequest.bcc,
            parentRfcId,
            referencesHeaderValue,
            googleThreadId,
        );

        const { data: sentMessage } = await gmail.users.messages.send({
            userId: "me",
            requestBody: {
                raw: rawMessage,
                threadId: googleThreadId,
            },
        });

        if (!sentMessage.id) {
            return next(new RouterError(StatusCode.ServerErrorInternal, "Failed to send reply via Gmail API."));
        }

        const sentMeta = await gmail.users.messages.get({
            userId: "me",
            id: sentMessage.id!,
            format: "metadata",
            metadataHeaders: ["Message-ID", "References", "In-Reply-To"],
        });

        const newRfcId = stripBrackets(getHeaderVal(sentMeta.data.payload?.headers, "Message-ID"));

        const newEmail: EmailInsert = {
            thread_id: dbThread.id,
            gmail_message_id: sentMessage.id,
            sender_email: user.email,
            subject: newSubject,
            body: replyRequest.body,
            direction: EmailDirections.OUTBOUND,
            sent_at: new Date().toISOString(),
            to_recipients: to,
            cc_recipients: cc,
            bcc_recipients: replyRequest.bcc || [],
            rfc_message_id: newRfcId,
            rfc_in_reply_to: parentRfcId,
            rfc_references: referencesHeaderValue,
        };
        await supabase.from(Tables.EMAILS).insert(newEmail);

        const { data: task, error: taskError } = await supabase
            .from(Tables.CONTACT_TASKS)
            .select("status")
            .eq("id", dbThread.task_id)
            .single();

        if (task && !taskError) {
            let currentStatus = task.status;
            let newStatus: Database["public"]["Enums"]["task_status"] | null = null;

            if (isReplyingToSelf) {
                if (currentStatus === EmailStatus.SENT) {
                    newStatus = EmailStatus.BUMP_1;
                } else if (currentStatus === EmailStatus.BUMP_1) {
                    newStatus = EmailStatus.BUMP_2;
                } else if (currentStatus === EmailStatus.BUMP_2) {
                    newStatus = EmailStatus.BUMP_3;
                }
            } else {
                newStatus = EmailStatus.NEEDS_REPLY;
            }

            if (newStatus) {
                await supabase
                    .from(Tables.CONTACT_TASKS)
                    .update({
                        status: newStatus,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", dbThread.task_id);
            }
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
 * TODO: update endpoint to use the new rfc_in_reply_to and rfc_references fields.
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
                        gmail_message_id: fullMessage.id!,
                        sender_email: parsedEmail.from,
                        subject: parsedEmail.subject,
                        body: parsedEmail.body,
                        direction: EmailDirections.INBOUND,
                        sent_at: parsedEmail.date ? new Date(parsedEmail.date).toISOString() : new Date().toISOString(),
                        to_recipients: parsedEmail.to,
                        cc_recipients: parsedEmail.cc,
                        bcc_recipients: parsedEmail.bcc,
                        rfc_in_reply_to: parsedEmail.inReplyTo,
                    };

                    // 6a. INSERT the new email record into your database
                    await supabase.from(Tables.EMAILS).insert(newEmailRecord);

                    // 6b. UPDATE the corresponding task status to 'REPLIED'
                    await supabase
                        .from(Tables.CONTACT_TASKS)
                        .update({ status: EmailStatus.NEEDS_REPLY })
                        .eq("id", threadInfo.taskId);

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

/**
 * GET /emails/task/:taskId
 *
 * Retrieves all emails associated with a specific contact task from the local database.
 *
 * @description This endpoint fetches the email thread for a given task ID from the local
 * database and then returns all email records from that thread, ordered chronologically.
 * This provides the full conversation history for a task.
 *
 * @param {string} taskId - The ID of the contact task.
 *
 * @returns {Object} JSON response containing:
 * - Success (200): An array of email objects, sorted by sent_at ascending.
 * - Error (404): No email thread found for the given task ID.
 * - Error (500): Internal server error.
 */
emailRouter.get("/task/:taskIdStr", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const { taskIdStr } = req.params;
    const taskId = parseInt(taskIdStr);

    if (isNaN(taskId)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid task ID format."));
    }

    try {
        // Step 1: Find the database thread record linked to the task ID.
        const { data: thread, error: threadError } = await supabase
            .from(Tables.EMAIL_THREADS)
            .select("id") // We only need the thread's primary key
            .eq("task_id", taskId)
            .single();

        // If no thread is found, it means no emails have been sent for this task yet.
        // This is not an error; just return an empty array.
        if (threadError) {
            if (threadError.code === "PGRST116") {
                // "single() row not found"
                return res.status(StatusCode.SuccessOK).json([]);
            }
            // For other errors, pass them to the error handler.
            return next(new RouterError(StatusCode.ServerErrorInternal, "Error fetching email thread.", null, threadError));
        }

        // Step 2: Fetch all emails from our database that belong to this thread.
        const { data: emails, error: emailsError } = await supabase
            .from(Tables.EMAILS)
            .select("*") // Select all columns, including the new ones
            .eq("thread_id", thread.id)
            .order("sent_at", { ascending: true }); // Order chronologically

        if (emailsError) {
            return next(
                new RouterError(StatusCode.ServerErrorInternal, "Error fetching emails for the task.", null, emailsError),
            );
        }

        // Step 3: Return the array of emails from our database.
        return res.status(StatusCode.SuccessOK).json(emails || []);
    } catch (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "An unexpected error occurred.", null, error));
    }
});

emailRouter.post("/watch", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user.email) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "User email is missing from auth token."));
    }

    try {
        const gmail = await getGmailClient(user.id);

        const watchResponse = await gmail.users.watch({
            userId: "me",
            requestBody: {
                labelIds: ["INBOX"],
                topicName: PUBSUB_TOPIC,
            },
        });

        const { historyId, expiration } = watchResponse.data;

        if (!historyId || !expiration) {
            return next(new RouterError(StatusCode.ServerErrorInternal, "Gmail API did not return historyId or expiration."));
        }

        const { error: updateError } = await supabase
            .from(Tables.PROFILES)
            .update({
                last_history_id: historyId,
                watch_expiration: new Date(parseInt(expiration)).toISOString(),
            })
            .eq("id", user.id);

        if (updateError) {
            return next(
                new RouterError(StatusCode.ServerErrorInternal, "Failed to save watch details to profile.", null, updateError),
            );
        }

        return res.status(StatusCode.SuccessOK).json({
            message: "Successfully subscribed to Gmail updates.",
            historyId: historyId,
            expiration: expiration,
        });
    } catch (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "Failed to create gmail watcher.", null, error));
    }
});

export default emailRouter;
