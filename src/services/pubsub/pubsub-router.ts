import { Router, Request, Response } from "express";
import StatusCode from "status-code-enum";
import { supabase } from "../../lib/supabase";
import { Tables } from "../../lib/db/strings";
import { getGmailClient } from "../emails/email-helpers";
import { syncUserHistory } from "../emails/email-sync";

const pubsubRouter: Router = Router();

pubsubRouter.post("/gmail", async (req: Request, res: Response) => {
    res.status(StatusCode.SuccessOK).send();
    
    try {
        const message = req.body.message;
        if (!message || !message.data) {
            console.error("Invalid Pub/Sub message received.");
            return;
        }

        const data = Buffer.from(message.data, "base64url").toString("utf8");
        const { emailAddress, historyId: newHistoryId } = JSON.parse(data);

        if (!emailAddress || !newHistoryId) {
            console.error("Pub/Sub message missing emailAddress or historyId.");
            return;
        }

        // Find the user in our DB by their email
        const { data: profile, error: profileError } = await supabase
            .from(Tables.PROFILES)
            .select("id, last_history_id")
            .eq("email", emailAddress)
            .single();

        if (profileError || !profile || !profile.last_history_id) {
            console.error(`No profile found for email ${emailAddress} or profile is missing historyId.`);
            return;
        }

        const { id: userId, last_history_id: startHistoryId } = profile;

        const gmail = await getGmailClient(userId);

        const syncResult = await syncUserHistory(userId, startHistoryId, gmail);

        // 5. Update the history ID to the one from the push notification
        // This is safer than the one from history.list, as it's the absolute latest
        await supabase.from(Tables.PROFILES).update({ last_history_id: newHistoryId }).eq("id", userId);

        console.log(`Pub/Sub sync for ${emailAddress} completed: ${syncResult}`);
    } catch (error) {
        console.error("Failed to process Gmail Pub/Sub message:", error);
    }
});

export default pubsubRouter;
