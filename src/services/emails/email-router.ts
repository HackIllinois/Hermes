import { Router, Request, Response, NextFunction } from "express";
import { createUser, requireMemberRole } from "../../middleware/auth";
import { RouterError } from "../../middleware/error-handler";
import StatusCode from "status-code-enum";
import { EmailDirections, EmailReplyTypes, EmailStatus, ScheduleStatus, SponsorStatus, Tables } from "../../lib/db/strings";
import { supabase } from "../../lib/supabase";
import { getGmailClient, getHeaderVal, makeRawMessage, parseGmailMessage, stripBrackets } from "./email-helpers";
import {
    isValidEmailSendRequest,
    EmailSendRequest,
    EmailReplyRequest,
    isValidEmailReplyRequest,
    EmailScheduleRequest,
    isValidEmailScheduleRequest,
    User,
} from "./email-formats";
import { EmailInsert, EmailThreadInsert } from "./email-helpers";
import { gmail_v1 } from "googleapis";
import { marked } from "marked";
import { Database, TablesInsert, Json } from "../../lib/db/schemas";
import { PUBSUB_TOPIC } from "../../app";
import { config } from "../../config";
import { processNewSendRequest, processReplyRequest } from "./email-service";

const emailRouter: Router = Router();

/**
 * POST /emails/send
 *
 * Sends an initial email to a sponsor for a specific contact task.
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

    const owner: User = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name,
    };

    // Validate request body
    if (!isValidEmailSendRequest(sendRequest)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid request body format."));
    }

    try {
        // 1. Authorization
        const { data: task, error: taskError } = await supabase
            .from(Tables.CONTACT_TASKS)
            .select(`owner_id`)
            .eq("id", sendRequest.contact_task_id)
            .single();

        if (taskError || !task) {
            return next(new RouterError(StatusCode.ClientErrorNotFound, "Contact task not found.", null, taskError));
        }
        if (task.owner_id !== user.id) {
            return next(new RouterError(StatusCode.ClientErrorForbidden, "You do not have permission for this task."));
        }

        // 2. Get Gmail client
        const gmail = await getGmailClient(user.id);

        // 3. Call the service
        const { sentMessage } = await processNewSendRequest(sendRequest, owner, gmail);

        // 4. Return success
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
    const user = (req as any).user;

    const owner: User = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name,
    };

    if (!isValidEmailReplyRequest(replyRequest)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid request body format."));
    }

    try {
        const { data: thread, error: threadError } = await supabase
            .from(Tables.EMAIL_THREADS)
            .select(`contact_tasks ( owner_id )`) // Get the owner_id from the linked task
            .eq("id", replyRequest.email_thread_id)
            .single();

        if (threadError || !thread) {
            return next(new RouterError(StatusCode.ClientErrorNotFound, "Email thread not found.", null, threadError));
        }
        if (!thread.contact_tasks) {
            return next(new RouterError(StatusCode.ClientErrorNotFound, "Thread is not linked to a valid task."));
        }

        // check if the owner_id matches the logged-in user's id.
        if (thread.contact_tasks.owner_id !== user.id) {
            return next(new RouterError(StatusCode.ClientErrorForbidden, "You do not have permission for this email thread."));
        }

        // 1. Get Gmail client
        const gmail = await getGmailClient(user.id);

        // 2. Call the service
        const { sentMessage } = await processReplyRequest(replyRequest, owner, gmail);

        // 3. Return success
        return res.status(StatusCode.SuccessOK).json({ message: "Reply sent successfully.", data: sentMessage });
    } catch (error) {
        return next(new RouterError(StatusCode.ServerErrorInternal, "An unexpected error occurred.", null, error));
    }
});

emailRouter.post("/schedule", createUser, requireMemberRole, async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    const scheduleRequest: EmailScheduleRequest = req.body;

    if (!isValidEmailScheduleRequest(scheduleRequest)) {
        return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid request body format."));
    }

    let sendAtISO: string;
    try {
        const unixTimestamp = parseInt(scheduleRequest.send_at, 10);

        if (isNaN(unixTimestamp)) {
            throw new Error("Invalid timestamp format.");
        }

        // Convert Unix timestamp (seconds) to JavaScript Date (milliseconds)
        const sendAtDate = new Date(unixTimestamp * 1000);

        if (isNaN(sendAtDate.getTime())) {
            throw new Error("Invalid date.");
        }

        // Convert to ISO 8601 string for Postgres
        sendAtISO = sendAtDate.toISOString();
    } catch (error) {
        return next(
            new RouterError(
                StatusCode.ServerErrorInternal,
                "Error converting send time for schedule send to ISO 8601 format.",
                null,
                error,
            ),
        );
    }

    try {
        const { contact_task_id, job_data, email_thread_id } = scheduleRequest;

        let associated_task_id: number;

        if (contact_task_id) {
            // Check if the user owns the task they are scheduling for.
            const { data: task, error: taskError } = await supabase
                .from(Tables.CONTACT_TASKS)
                .select("owner_id")
                .eq("id", contact_task_id)
                .single();

            if (taskError || !task) {
                return next(new RouterError(StatusCode.ClientErrorNotFound, "Contact task not found.", null, taskError));
            }

            if (task.owner_id !== user.id) {
                return next(new RouterError(StatusCode.ClientErrorForbidden, "You do not own this contact task."));
            }

            associated_task_id = contact_task_id;
        } else if (email_thread_id) {
            // in this case, we need to link the email thread id to the contact task id
            const { data: thread, error: threadError } = await supabase
                .from(Tables.EMAIL_THREADS)
                .select(`task_id, contact_tasks ( owner_id )`) // Get task_id AND its owner
                .eq("id", email_thread_id)
                .single();

            if (threadError || !thread) {
                return next(new RouterError(StatusCode.ClientErrorNotFound, "Email thread not found.", null, threadError));
            }
            if (!thread.contact_tasks) {
                return next(new RouterError(StatusCode.ClientErrorNotFound, "Thread is not linked to a valid task."));
            }
            if (thread.contact_tasks.owner_id !== user.id) {
                return next(
                    new RouterError(StatusCode.ClientErrorForbidden, "You do not have permission for this email thread."),
                );
            }

            associated_task_id = thread.task_id;
        } else {
            return next(new RouterError(StatusCode.ClientErrorBadRequest, "Invalid request body format."));
        }

        let newScheduledSend: TablesInsert<"scheduled_sends"> = {
            contact_task_id: associated_task_id,
            send_at: sendAtISO,
            job_data: job_data as Json,
            status: ScheduleStatus.PENDING,
        };

        const { data: scheduledData, error: insertError } = await supabase
            .from(Tables.SCHEDULED_SENDS)
            .insert(newScheduledSend)
            .select()
            .single(); // .select().single() to get the newly created row back

        if (insertError) {
            return next(new RouterError(StatusCode.ServerErrorInternal, "Failed to schedule email.", null, insertError));
        }

        // 6. Return success
        return res.status(StatusCode.SuccessCreated).json({
            message: "Email scheduled successfully.",
            data: scheduledData,
        });
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
