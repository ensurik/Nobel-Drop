// =====================================================================
// stripe-webhook
// Mottar payment_intent.succeeded / payment_intent.payment_failed.
// Verifiserer signatur via STRIPE_WEBHOOK_SECRET.
// =====================================================================
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { signPickupToken } from "../_shared/qr.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return errorResponse("missing_signature", 400);

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
    );
  } catch (err) {
    console.error("stripe signature failed", err);
    return errorResponse("invalid_signature", 400);
  }

  const supabase = getServiceClient();

  try {
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const orderId = intent.metadata?.order_id;
      if (!orderId) return jsonResponse({ ok: true, ignored: true });

      await supabase
        .from("payment_intents")
        .update({ status: intent.status, raw_payload: intent as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
        .eq("provider", "stripe")
        .eq("provider_intent_id", intent.id);

      const token = await signPickupToken(orderId, Deno.env.get("PICKUP_QR_SECRET")!);
      await supabase.rpc("confirm_order_paid", {
        p_order_id: orderId,
        p_provider: "stripe",
        p_provider_intent_id: intent.id,
        p_pickup_qr_token: token,
      });
    } else if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      await supabase
        .from("payment_intents")
        .update({ status: "failed", raw_payload: intent as unknown as Record<string, unknown> })
        .eq("provider", "stripe")
        .eq("provider_intent_id", intent.id);
    }
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("stripe-webhook error", err);
    return errorResponse(err instanceof Error ? err.message : "unknown", 500);
  }
});
