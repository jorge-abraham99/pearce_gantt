import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient<any> | null = null;

export function getSupabaseClient() {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing public Supabase environment variables");
  }

  client = createClient<any>(supabaseUrl, supabaseAnonKey);
  return client;
}
