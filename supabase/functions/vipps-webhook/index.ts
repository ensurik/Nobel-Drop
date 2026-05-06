// =====================================================================
// vipps-webhook
// Mottar callback fra Vipps og oppdaterer ordre-status. Idempotent.
// Endepunkt: <SUPABASE_URL>/functions/v1/vipps-webhook/v2/payments/{orderId}
// =====================================================================
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { signPickupToken } from "../_shared/qr.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405);

  try {
    const body = await req.json();
    const url = new URL(req.url);
    const pathOrderRef = url.pathname.split("/").pop()?.trim();
    const providerIntentId = body.orderId ?? pathOrderRef;
    const status = body.transactionInfo?.status ?? body.status;

    if (!providerIntentId) return errorResponse("missing_orderId");

    const supabase = getServiceClient();

    // Finn payment intent
    const { data: pi } = await supabase
      .from("payment_intents")
      .select("*")
      .eq("provider", "vipps")
      .eq("provider_intent_id", providerIntentId)
      .single();

    if (!pi) {
      console.error("vipps_webhook unknown_intent", providerIntentId);
      return errorResponse("unknown_intent", 404);
    }

    await supabase
      .from("payment_intents")
      .update({ status, raw_payload: body, updated_at: new Date().toISOString() })
      .eq("id", pi.id);

    if (status === "RESERVE" || status === "RESERVED" || status === "SALE") {
      const token = await signPickupToken(pi.order_id, Deno.env.get("PICKUP_QR_SECRET")!);
      const { error: confirmErr } = await supabase.rpc("confirm_order_paid", {
        p_order_id: pi.order_id,
        p_provider: "vipps",
        p_provider_intent_id: providerIntentId,
        p_pickup_qr_token: token,
      });
      if (confirmErr) {
        console.error("confirm_order_paid error", confirmErr);
        return errorResponse(confirmErr.message, 500);
      }
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("vipps-webhook error", err);
    return errorResponse(err instanceof Error ? err.message : "unknown", 500);
  }
});
