import dotenv from "dotenv";

dotenv.config();

const DEFAULT_FRONTEND_URL = "http://localhost:3000";
const DEFAULT_BACKEND_URL = "http://localhost:5555/api";

function normalizeBaseUrl(value: string): string {
    return value.replace(/\/+$/, "");
}

export const config = {
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_KEY: process.env.SUPABASE_KEY || "",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
    ENVIRONMENT: process.env.ENVIRONMENT || "DEV",
    FRONTEND_URL: normalizeBaseUrl(process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL),
    BACKEND_URL: normalizeBaseUrl(process.env.BACKEND_URL || DEFAULT_BACKEND_URL),
    GMAIL_PUBSUB_TOPIC: process.env.GMAIL_PUBSUB_TOPIC || "",
    ORG_NAME: process.env.ORG_NAME || "",
} as const;

export const isProductionEnvironment = config.ENVIRONMENT === "PROD";

export const validateEnv = (): void => {
    const requiredEnvVars = [
        "SUPABASE_URL",
        "SUPABASE_KEY",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "FRONTEND_URL",
        "BACKEND_URL",
        "GMAIL_PUBSUB_TOPIC",
        "ORG_NAME",
    ];

    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            throw new Error(`Missing required environment variable: ${envVar}`);
        }
    }
};

export const BASE_FRONTEND_URL = config.FRONTEND_URL;
export const BASE_BACKEND_URL = config.BACKEND_URL;
