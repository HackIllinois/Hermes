import dotenv from "dotenv";

dotenv.config();

export const config = {
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_KEY: process.env.SUPABASE_KEY || "",
    ENVIRONMENT: process.env.ENVIRONMENT || "DEV",
} as const;

export const validateEnv = (): void => {
    const requiredEnvVars = ["SUPABASE_URL", "SUPABASE_KEY"];

    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            throw new Error(`Missing required environment variable: ${envVar}`);
        }
    }
};

export const BASE_FRONTEND_URL = config.ENVIRONMENT == "DEV" ? "http://localhost:3000" : "https://hermes.hackillinois.org";
export const BASE_BACKEND_URL = config.ENVIRONMENT == "DEV" ? `http://localhost:5555/api` : "https://hermes.hackillinois.org/api";
