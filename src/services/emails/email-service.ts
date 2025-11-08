import { gmail_v1 } from "googleapis";
import { EmailSendRequest, EmailReplyRequest } from "./email-formats";
import { supabase } from "../../lib/supabase";
import { EmailDirections, EmailReplyTypes, EmailStatus, SponsorStatus, Tables } from "../../lib/db/strings";
import { marked } from "marked";
import { getHeaderVal, makeRawMessage, stripBrackets } from "./email-helpers";
import { TablesInsert, Database } from "../../lib/db/schemas";
import { User } from "./email-formats";

/**
 * This function is used to process sends. It is used by the regular send endpoint and the schedule send cron job.
 * @param sendRequest - The email send request.
 * @param owner - The owner of the task.
 * @param gmail - The Gmail client.
 * @returns The sent message and the new database thread.
 */
export async function processNewSendRequest(sendRequest: EmailSendRequest, owner: User, gmail: gmail_v1.Gmail) {
    const { contact_task_id, subject, body } = sendRequest;

    // Check if a thread already exists for this task
    const { data: existingThread, error: threadCheckError } = await supabase
        .from(Tables.EMAIL_THREADS)
        .select("id")
        .eq("task_id", contact_task_id)
        .maybeSingle();

    if (threadCheckError) {
        throw new Error(`Failed to check for existing thread: ${threadCheckError.message}`);
    }
    if (existingThread) {
        throw new Error(`A thread already exists for task ${contact_task_id}. Cannot send a new email.`);
    }

    // Fetch the contact task, its owner, and the associated sponsor
    const { data: task, error: taskError } = await supabase
        .from(Tables.CONTACT_TASKS)
        .select(`owner_id, sponsor_email, sponsors (sponsor_email)`)
        .eq("id", contact_task_id)
        .single();

    if (taskError || !task || !task.owner_id) {
        throw new Error(`Failed to fetch task ${contact_task_id}: ${taskError?.message}`);
    }

    const senderEmail = owner.email; // The sender is the authenticated user
    const sponsorEmail = task.sponsors?.sponsor_email;

    if (!sponsorEmail) {
        throw new Error(`Task ${contact_task_id} is missing sponsor email.`);
    }

    const toList = Array.from(
        new Set((sendRequest.to && sendRequest.to.length > 0 ? sendRequest.to : [sponsorEmail]).map((e) => e.toLowerCase())),
    );

    const plainBody = body;
    const htmlBody = `<div>${marked.parse(body, { breaks: true })}</div>`;

    // Construct and send the email via Gmail API
    const rawMessage = makeRawMessage(
        toList.join(", "),
        senderEmail,
        owner.name,
        subject,
        plainBody,
        htmlBody,
        sendRequest.cc,
        sendRequest.bcc,
        undefined,
        undefined,
    );

    // send email via Gmail API
    const { data: sentMessage } = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: rawMessage },
    });

    if (!sentMessage?.id || !sentMessage.threadId) {
        throw new Error("Failed to send email via Gmail API.");
    }

    // get email metadata
    // this includes the Message-ID header
    const sentMeta = await gmail.users.messages.get({
        userId: "me",
        id: sentMessage.id!, // Gmail internal id
        format: "metadata",
        metadataHeaders: ["Message-ID"],
    });

    const rfcMsgId = stripBrackets(getHeaderVal(sentMeta.data.payload?.headers, "Message-ID"));

    // create db email thread record
    const newThread: TablesInsert<"email_threads"> = {
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
        throw new Error(`Email sent, but failed to create DB thread: ${newDbThreadError?.message}`);
    }

    let dbThreadId = newDbThread.id;

    // create db email record
    const newEmail: TablesInsert<"emails"> = {
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

    // update sponsor status to CONTACTED
    await supabase
        .from(Tables.SPONSORS)
        .update({
            status: SponsorStatus.CONTACTED,
            updated_at: new Date().toISOString(),
        })
        .eq("sponsor_email", sponsorEmail);

    // 8. Return success response
    return { sentMessage, newDbThread };
}

/**
 * This function is used to process replies. It is used by the regular reply endpoint and the schedule send cron job.
 * @param replyRequest - The email reply request.
 * @param owner - The owner of the task.
 * @param gmail - The Gmail client.
 * @returns The sent message and the new database thread.
 */
export async function processReplyRequest(replyRequest: EmailReplyRequest, owner: User, gmail: gmail_v1.Gmail) {
    const { data: dbThread, error: threadError } = await supabase
        .from(Tables.EMAIL_THREADS)
        .select("id, task_id, thread_id")
        .eq("id", replyRequest.db_thread_id)
        .single();

    if (threadError || !dbThread) {
        throw new Error(`Email thread ${replyRequest.db_thread_id} not found in db.`);
    }

    const googleThreadId = dbThread.thread_id;

    const { data: emailToReplyTo, error: emailToReplyToError } = await supabase
        .from(Tables.EMAILS)
        .select("*")
        .eq("gmail_message_id", replyRequest.message_id_to_reply_to)
        .single();

    if (emailToReplyToError || !emailToReplyTo) {
        throw new Error(`Email to reply to (${replyRequest.message_id_to_reply_to}) not found.`);
    }

    let to: string[] = [];
    let cc: string[] = [...(replyRequest.cc || [])]; // Start with any new CCs from the request

    const isReplyingToSelf = emailToReplyTo.sender_email === owner.email;

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
                if (recipient !== owner.email && recipient !== originalSender) {
                    cc.push(recipient);
                }
            });
            // Add original 'Cc' list to CC (excluding user)
            (emailToReplyTo.cc_recipients || []).forEach((recipient) => {
                if (recipient !== owner.email) {
                    cc.push(recipient);
                }
            });
        }
    }

    // Final cleanup: remove duplicates and the user's own email from the final lists.
    to = [...new Set(to.filter((email) => email !== owner.email))];
    cc = [...new Set(cc.filter((email) => email !== owner.email && !to.includes(email)))];

    // This is a safeguard. If 'To' becomes empty, move the first 'Cc' to 'To'.
    if (to.length === 0 && cc.length > 0) {
        to.push(cc.shift()!);
    }

    if (to.length === 0) {
        throw new Error("Could not determine a recipient for the reply.");
    }

    const parentRfcId = emailToReplyTo.rfc_message_id || stripBrackets(emailToReplyTo.gmail_message_id) || null;

    if (!parentRfcId) {
        throw new Error("Missing RFC Message-ID to reply to.");
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

    const plainBody = replyRequest.body;
    // const htmlBody = await marked.parse(replyRequest.body, {breaks: true});
    const htmlBody = `<div>${marked.parse(replyRequest.body, { breaks: true })}</div>`;

    const rawMessage = makeRawMessage(
        to.join(", "),
        owner.email,
        owner.name,
        newSubject!,
        plainBody,
        htmlBody,
        cc,
        replyRequest.bcc,
        parentRfcId,
        referencesHeaderValue,
    );

    const { data: sentMessage } = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
            raw: rawMessage,
            threadId: googleThreadId,
        },
    });

    if (!sentMessage.id) {
        throw new Error("Failed to send reply via Gmail API.");
    }

    const sentMeta = await gmail.users.messages.get({
        userId: "me",
        id: sentMessage.id!,
        format: "metadata",
        metadataHeaders: ["Message-ID", "References", "In-Reply-To"],
    });

    const newRfcId = stripBrackets(getHeaderVal(sentMeta.data.payload?.headers, "Message-ID"));

    // create db email record
    const newEmail: TablesInsert<"emails"> = {
        thread_id: dbThread.id,
        gmail_message_id: sentMessage.id,
        sender_email: owner.email,
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

    return { sentMessage };
}
