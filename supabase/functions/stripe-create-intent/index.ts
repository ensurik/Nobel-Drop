// =====================================================================
// stripe-create-intent
// Oppretter Stripe PaymentIntent for Apple Pay / kort / Google Pay.
// Returnerer client_secret som frontend bruker i PaymentSheet/Element.
//
// POST body: { order_id, amount_ore }
// =====================================================================
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405);

  try {
    const { order_id, amount_ore } = await req.json();
    if (!order_id || !amount_ore) return errorResponse("missing_fields");

    const supabase = getServiceClient();
    const { data: order } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();
    if (!order) return errorResponse("order_not_found", 404);

    const intent = await stripe.paymentIntents.create({
      amount: amount_ore,
      currency: "nok",
      automatic_payment_methods: { enabled: true },
      metadata: { order_id, user_id: order.user_id },
    });

    await supabase.from("payment_intents").insert({
      order_id,
      provider: "stripe",
      provider_intent_id: intent.id,
      status: intent.status,
      amount_ore,
      raw_payload: intent as unknown as Record<string, unknown>,
    });

    return jsonResponse({
      provider: "stripe",
      client_secret: intent.client_secret,
      intent_id: intent.id,
      publishable_key: Deno.env.get("STRIPE_PUBLISHABLE_KEY"),
    });
  } catch (err) {
    console.error("stripe-create-intent error", err);
    return errorResponse(err instanceof Error ? err.message : "unknown", 500);
  }
});
