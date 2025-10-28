import { Tables } from "../../lib/db/strings";
import { supabase } from "../../lib/supabase";
import { PUBSUB_TOPIC } from "../../app";
import { getGmailClient } from "../emails/email-helpers";

export async function renewAllGmailPubSubWatchers() {
    console.log("Starting Gmail Pub/Sub watcher renewal process...");

    const { data: profiles, error } = await supabase.from(Tables.PROFILES).select("id, email").not("gmail_refresh", "is", null);

    if (error || !profiles) {
        console.error("Failed to fetch profiles for renewal:", error);
        return;
    }

    for (const profile of profiles) {
        try {
            const gmail = await getGmailClient(profile.id);

            const watchResponse = await gmail.users.watch({
                userId: "me",
                requestBody: { labelIds: ["INBOX"], topicName: PUBSUB_TOPIC },
            });

            const { historyId } = watchResponse.data;

            await supabase
                .from(Tables.PROFILES)
                .update({
                    last_history_id: historyId,
                })
                .eq("id", profile.id);
        } catch (error) {
            console.error("Failed to renew Gmail Pub/Sub watcher for profile:", profile.id, error);
        }
    }

    console.log("Successfully renewed all Gmail Pub/Sub watchers.");
}
