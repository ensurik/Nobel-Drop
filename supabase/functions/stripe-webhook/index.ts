// =====================================================================
// stripe-webhook
// Verifiserer signatur via constructEventAsync + STRIPE_WEBHOOK_SECRET.
// Idempotent via webhook_events-tabell på event.id.
// Håndterer: payment_intent.succeeded, .payment_failed, .canceled,
//            charge.refunded, charge.dispute.created.
// =====================================================================
import Stripe from "https://esm.sh/stripe@17.4.0?target=denonext";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { signPickupToken } from "../_shared/qr.ts";
import { isAlreadyProcessed, markProcessed } from "../_shared/webhookIdempotency.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const PICKUP_QR_SECRET = Deno.env.get("PICKUP_QR_SECRET")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return errorResponse("missing_signature", 400);

  const rawBody = await req.text();

  // 1. Verifisér signatur — feiler her hvis Stripe ikke er avsenderen.
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("stripe_signature_failed", err instanceof Error ? err.message : err);
    return errorResponse("invalid_signature", 400);
  }

  // 2. Idempotency — har vi allerede prosessert dette event-id-et?
  if (await isAlreadyProcessed("stripe", event.id)) {
    console.log("stripe_event_already_processed", { event_id: event.id, type: event.type });
    return jsonResponse({ ok: true, idempotent: true });
  }

  const supabase = getServiceClient();

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const orderId = intent.metadata?.order_id;
        if (!orderId) {
          console.warn("stripe_succeeded_without_order_id", { intent_id: intent.id });
          break;
        }

        await supabase
          .from("payment_intents")
          .update({
            status: intent.status,
            raw_payload: intent as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          })
          .eq("provider", "stripe")
          .eq("provider_intent_id", intent.id);

        const token = await signPickupToken(orderId, PICKUP_QR_SECRET);
        const { error: confirmErr } = await supabase.rpc("confirm_order_paid", {
          p_order_id: orderId,
          p_provider: "stripe",
          p_provider_intent_id: intent.id,
          p_pickup_qr_token: token,
        });
        if (confirmErr) {
          console.error("confirm_order_paid_failed", confirmErr);
          throw new Error(confirmErr.message);
        }
        console.log("stripe_payment_succeeded", { order_id: orderId, intent_id: intent.id });
        break;
      }

      case "payment_intent.payment_failed":
      case "payment_intent.canceled": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await supabase
          .from("payment_intents")
          .update({
            status: event.type === "payment_intent.canceled" ? "canceled" : "failed",
            raw_payload: intent as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          })
          .eq("provider", "stripe")
          .eq("provider_intent_id", intent.id);

        // Hvis ordren har en tilknyttet ordre i payment_intents, kanseller den
        // for å frigjøre units. Pga atomisitet i confirm_order_paid trenger vi
        // ikke å oppdatere orders direkte — release_expired_reservations cron
        // tar hånd om det basert på status='reserved' + utløpt timestamp.
        console.log("stripe_payment_not_succeeded", {
          type: event.type,
          intent_id: intent.id,
        });
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const intentId = typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
        if (!intentId) break;

        // Finn ordren via payment_intents og marker som refundert.
        const { data: pi } = await supabase
          .from("payment_intents")
          .select("order_id")
          .eq("provider", "stripe")
          .eq("provider_intent_id", intentId)
          .maybeSingle();
        if (pi?.order_id) {
          await supabase
            .from("orders")
            .update({
              status: "refunded",
              refunded_at: new Date().toISOString(),
              refund_reason: "stripe_refund",
            })
            .eq("id", pi.order_id);
          console.log("stripe_charge_refunded", { order_id: pi.order_id });
        }
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        console.warn("stripe_dispute_created", {
          dispute_id: dispute.id,
          charge_id: dispute.charge,
          reason: dispute.reason,
        });
        // Logg til audit_log for admin-oppfølging
        await supabase.from("audit_log").insert({
          action: "stripe.dispute.created",
          entity_type: "stripe_dispute",
          entity_id: null,
          metadata: { dispute_id: dispute.id, charge: dispute.charge, reason: dispute.reason },
        });
        break;
      }

      default:
        console.log("stripe_event_ignored", { type: event.type, id: event.id });
    }

    // 3. Mark som prosessert — gjøres KUN etter vellykket håndtering.
    await markProcessed("stripe", event.id, { type: event.type });
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("stripe_webhook_error", err);
    return errorResponse(err instanceof Error ? err.message : "unknown", 500);
  }
});
