import app from "./app";
import cron from "node-cron";
import { renewAllGmailPubSubWatchers } from "./services/pubsub/pubsub-cron";

const PORT = process.env.PORT || 5555;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);

    console.log("Scheduling daily Gmail watch renewal (at 6:00 AM UTC).");
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
});
