import { config } from "../../config";
import { Tables } from "../../lib/db/strings";
import { supabase } from "../../lib/supabase";
import { getGmailClient } from "../emails/email-helpers";

export async function createOrRenewGmailWatch(userId: string) {
    const gmail = await getGmailClient(userId);

    const watchResponse = await gmail.users.watch({
        userId: "me",
        requestBody: {
            labelIds: ["INBOX"],
            labelFilterBehavior: "INCLUDE",
            topicName: config.GMAIL_PUBSUB_TOPIC,
        },
    });

    const { historyId, expiration } = watchResponse.data;

    if (!historyId) {
        throw new Error("Gmail watch response did not include a historyId.");
    }

    const { error } = await supabase
        .from(Tables.PROFILES)
        .update({
            last_history_id: historyId,
        })
        .eq("id", userId);

    if (error) {
        throw new Error(`Failed to persist Gmail watch history id: ${error.message}`);
    }

    return { historyId, expiration };
}
