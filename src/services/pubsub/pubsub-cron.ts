import { Tables } from "../../lib/db/strings";
import { supabase } from "../../lib/supabase";
import { createOrRenewGmailWatch } from "./pubsub-service";

export async function renewAllGmailPubSubWatchers() {
    console.log("Starting Gmail Pub/Sub watcher renewal process...");

    const { data: profiles, error } = await supabase.from(Tables.PROFILES).select("id, email").not("gmail_refresh", "is", null);

    if (error || !profiles) {
        console.error("Failed to fetch profiles for renewal:", error);
        return;
    }

    for (const profile of profiles) {
        try {
            const { historyId, expiration } = await createOrRenewGmailWatch(profile.id);

            console.log(
                `Renewed Gmail watch for ${profile.email} with historyId=${historyId} expiration=${expiration ?? "unknown"}`,
            );
        } catch (error) {
            console.error("Failed to renew Gmail Pub/Sub watcher for profile:", profile.id, error);
        }
    }

    console.log("Successfully renewed all Gmail Pub/Sub watchers.");
}
