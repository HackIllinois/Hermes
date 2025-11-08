import app from "./app";
import cron from "node-cron";
import { renewAllGmailPubSubWatchers } from "./services/pubsub/pubsub-cron";
import { config } from "./config";
import { processScheduledSends } from "./services/emails/email-cron";

const PORT = process.env.PORT || 5555;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} in ${config.ENVIRONMENT} environment`);

    console.log("Scheduling cron job for daily Gmail watch renewal (at 6:00 AM UTC).");
    cron.schedule(
        "0 6 * * *",
        () => {
            // The function itself will log its own start/end
            renewAllGmailPubSubWatchers();
        },
        {
            timezone: "UTC", // Explicitly set timezone for predictability
        },
    );

    console.log("Scheduling cron job for process scheduled sends (every minute).");
    cron.schedule(
        "* * * * *", // Runs every minute
        () => {
            // The function itself logs its own start/end
            processScheduledSends();
        },
        {
            // No timezone needed for "every minute"
        },
    );
});
