import dotenv from "dotenv";

dotenv.config();

export const config = {
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_KEY: process.env.SUPABASE_KEY || "",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
    ENVIRONMENT: process.env.ENVIRONMENT || "DEV",
    GMAIL_PUBSUB_TOPIC: process.env.GMAIL_PUBSUB_TOPIC || "",
} as const;

export const isProductionEnvironment = config.ENVIRONMENT === "PROD";

export const validateEnv = (): void => {
    const requiredEnvVars = ["SUPABASE_URL", "SUPABASE_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GMAIL_PUBSUB_TOPIC"];

    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            throw new Error(`Missing required environment variable: ${envVar}`);
        }
    }
};

export const BASE_FRONTEND_URL = config.ENVIRONMENT == "DEV" ? "http://localhost:3000" : "https://hermes.hackillinois.org";
export const BASE_BACKEND_URL = config.ENVIRONMENT == "DEV" ? `http://localhost:5555/api` : "https://hermes-api.hackillinois.org/api";
