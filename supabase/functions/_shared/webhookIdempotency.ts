// Webhook idempotency helper.
// Bruk: sjekk isAlreadyProcessed FØR du prosesserer; kall markProcessed ETTER.
// PK (provider, event_id) hindrer dobbeltbehandling selv ved race.

import { getServiceClient } from "./supabase.ts";

export async function isAlreadyProcessed(
  provider: string,
  eventId: string,
): Promise<boolean> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("webhook_events")
    .select("event_id")
    .eq("provider", provider)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) {
    console.error("webhookIdempotency.isAlreadyProcessed error", error);
    return false;
  }
  return !!data;
}

export async function markProcessed(
  provider: string,
  eventId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("webhook_events")
    .insert({ provider, event_id: eventId, metadata: metadata ?? null });
  if (error && error.code !== "23505") {
    // 23505 = unique violation = race-condition: another instance just marked it.
    // Trygg å ignorere; vi har allerede prosessert (eller noen andre gjør det).
    console.error("webhookIdempotency.markProcessed error", error);
  }
}
