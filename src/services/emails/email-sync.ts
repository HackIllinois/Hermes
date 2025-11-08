import { gmail_v1 } from "googleapis";
import { supabase } from "../../lib/supabase";
import { EmailDirections, EmailStatus, Tables } from "../../lib/db/strings";
import { EmailInsert, parseGmailMessage } from "./email-helpers";

export async function syncUserHistory(
    userId: string,
    startHistoryId: string,
    gmail: gmail_v1.Gmail,
): Promise<{ status: "synced" | "resynced" | "no_changes" | "error"; syncedMessages?: number; error?: any }> {
    let newHistoryId: string | null | undefined;
    try {
        const historyResponse = await gmail.users.history.list({
            userId: "me",
            startHistoryId: startHistoryId.toString(),
            historyTypes: ["messageAdded"],
            maxResults: 500,
        });

        const { history, historyId } = historyResponse.data;
        newHistoryId = historyId; // Save the new history ID

        if (!history || history.length === 0) {
            if (newHistoryId) {
                await supabase.from(Tables.PROFILES).update({ last_history_id: newHistoryId }).eq("id", userId);
            }
            return { status: "no_changes" };
        }

        const newMessagesMetadata = history
            .flatMap((h) => h.messagesAdded || [])
            .map((ma) => ma.message)
            .filter((msg): msg is gmail_v1.Schema$Message => !!msg);

        if (newMessagesMetadata.length === 0) {
            if (newHistoryId) {
                await supabase.from(Tables.PROFILES).update({ last_history_id: newHistoryId }).eq("id", userId);
            }
            return { status: "no_changes" };
        }

        const googleThreadIds = [...new Set(newMessagesMetadata.map((msg) => msg.threadId!))];
        const { data: trackedDbThreads } = await supabase
            .from(Tables.EMAIL_THREADS)
            .select("id, thread_id, task_id")
            .in("thread_id", googleThreadIds);

        if (!trackedDbThreads || trackedDbThreads.length === 0) {
            if (newHistoryId) {
                await supabase.from(Tables.PROFILES).update({ last_history_id: newHistoryId }).eq("id", userId);
            }
            return { status: "no_changes" };
        }

        const dbThreadMap = new Map(trackedDbThreads.map((t) => [t.thread_id, { dbId: t.id, taskId: t.task_id }]));
        let syncedMessageCount = 0;
        const userEmail = (await gmail.users.getProfile({ userId: "me" })).data.emailAddress;

        for (const messageMeta of newMessagesMetadata) {
            console.log("messageMeta", messageMeta);
            if (messageMeta.id && dbThreadMap.has(messageMeta.threadId!)) {
                const messageResponse = await gmail.users.messages.get({ userId: "me", id: messageMeta.id, format: "full" });
                const fullMessage = messageResponse.data;
                const parsedEmail = parseGmailMessage(fullMessage);

                // Process only INBOUND messages
                if (parsedEmail.from !== userEmail) {
                    console.log("message is inbound", parsedEmail.from);
                    const threadInfo = dbThreadMap.get(fullMessage.threadId!);
                    if (!threadInfo) continue;

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
                        rfc_references: parsedEmail.references,
                    };

                    await supabase.from(Tables.EMAILS).insert(newEmailRecord);
                    await supabase
                        .from(Tables.CONTACT_TASKS)
                        .update({ status: EmailStatus.NEEDS_REPLY })
                        .eq("id", threadInfo.taskId);
                    syncedMessageCount++;
                } else {
                    console.log("message is outbound", parsedEmail.from);
                    const threadInfo = dbThreadMap.get(fullMessage.threadId!);
                    if (!threadInfo) continue;
                    const newEmailRecord: EmailInsert = {
                        thread_id: threadInfo.dbId,
                        gmail_message_id: fullMessage.id!,
                        sender_email: parsedEmail.from,
                        subject: parsedEmail.subject,
                        body: parsedEmail.body,
                        direction: EmailDirections.OUTBOUND,
                        sent_at: parsedEmail.date ? new Date(parsedEmail.date).toISOString() : new Date().toISOString(),
                        to_recipients: parsedEmail.to,
                        cc_recipients: parsedEmail.cc,
                        bcc_recipients: parsedEmail.bcc,
                        rfc_in_reply_to: parsedEmail.inReplyTo,
                        rfc_references: parsedEmail.references,
                    };

                    // we won't update the task status here because it's outbound
                    // ideally we would update the task status even if done out of platform but leaving it for simplicity purposes
                    const { error: newEmailError } = await supabase
                        .from(Tables.EMAILS)
                        .upsert(newEmailRecord, { ignoreDuplicates: true });

                    if (newEmailError) {
                        console.error("Error inserting outbound email record", newEmailError);
                    }
                    syncedMessageCount++;
                }
            }
        }

        // update history id
        if (newHistoryId) {
            await supabase.from(Tables.PROFILES).update({ last_history_id: newHistoryId }).eq("id", userId);
        }

        return { status: "synced", syncedMessages: syncedMessageCount };
    } catch (error) {
        return { status: "error", error };
    }
}
