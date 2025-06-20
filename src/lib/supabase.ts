import { createClient } from "@supabase/supabase-js";
import { config } from "../config";
import { Database } from "./db/schemas";

export const supabase = createClient<Database>(config.SUPABASE_URL, config.SUPABASE_KEY);
