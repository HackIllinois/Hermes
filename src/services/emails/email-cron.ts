import { Database } from "../../lib/db/schemas";
import { ScheduleStatus, Tables } from "../../lib/db/strings";
import { supabase } from "../../lib/supabase";
import { EmailReplyRequest, EmailSendRequest, User } from "./email-formats";
import { getGmailClient } from "./email-helpers";
import { processNewSendRequest, processReplyRequest } from "./email-service";

async function getTaskAndOwner(taskId: number): Promise<{ taskData: any; owner: User }> {
    const { data, error } = await supabase
        .from(Tables.CONTACT_TASKS)
        .select("owner_id, sponsor_email, sponsors ( sponsor_email ), profiles ( id, email, name )")
        .eq("id", taskId)
        .single();

    if (error) throw new Error(`Failed to fetch task ${taskId}: ${error.message}`);
    if (!data.profiles) throw new Error(`Task ${taskId} has no owner profile.`);

    // Reconstruct the user object as it appears in the auth middleware
    const owner: User = {
        id: data.owner_id!,
        email: data.profiles.email!,
        name: data.profiles.name,
    };

    return { taskData: data, owner: owner };
}

export async function processScheduledSends() {
    console.log("Starting scheduled send processing...");
    const { data: jobs, error: jobsError } = await supabase.rpc("get_pending_scheduled_sends");

    if (jobsError) {
        console.error("Error fetching scheduled sends:", jobsError);
        return;
    }

    if (!jobs || jobs.length === 0) {
        return;
    }

    console.log(`Found ${jobs.length} scheduled send(s) to process.`);
    let successCount = 0;
    let errorCount = 0;

    for (const job of jobs) {
        try {
            // 1. Get task info and owner profile
            const { owner } = await getTaskAndOwner(job.contact_task_id);

            if (!owner.email) {
                throw new Error(`Task ${job.contact_task_id} has no owner email.`);
            }
            if (!owner.id) {
                throw new Error(`Task ${job.contact_task_id} has no owner ID.`);
            }

            // 2. Get the owner's Gmail client
            const gmail = await getGmailClient(owner.id);

            if (!gmail) {
                throw new Error(`Failed to get Gmail client for owner ${owner.id}.`);
            }

            // 3. Find the email thread (if it exists)
            const { data: thread } = await supabase
                .from(Tables.EMAIL_THREADS)
                .select("id, thread_id")
                .eq("task_id", job.contact_task_id)
                .maybeSingle();

            // 4. Decide whether to Send or Reply
            if (thread && thread.id && thread.thread_id) {
                // this is a REPLY
                const replyRequest: EmailReplyRequest = {
                    ...(job.job_data as any),
                    db_thread_id: thread.id,
                };

                await processReplyRequest(replyRequest, owner, gmail);
            } else {
                // This is a NEW SEND
                const sendRequest: EmailSendRequest = {
                    ...(job.job_data as any),
                    contact_task_id: job.contact_task_id,
                };
                await processNewSendRequest(sendRequest, owner, gmail);
            }

            // 5. If successful, mark job as SENT
            await supabase.from(Tables.SCHEDULED_SENDS).update({ status: ScheduleStatus.SENT, error_log: null }).eq("id", job.id);
            successCount++;
        } catch (error: any) {
            // 6. If failed, mark job as ERROR
            console.error(`Failed to process job ${job.id}:`, error);
            await supabase
                .from(Tables.SCHEDULED_SENDS)
                .update({ status: ScheduleStatus.ERROR, error_log: error.message })
                .eq("id", job.id);
            errorCount++;
        }
    }

    console.log(`Finished processing scheduled sends: ${successCount} sent, ${errorCount} failed.`);
}
