// =====================================================================
// vipps-webhook
// Vipps eCom v2 har ikke standardisert HMAC-signering på webhooks,
// så vi verifiserer ved å kalle tilbake til Vipps API og bekrefte
// statusen mot deres source of truth. Idempotent via webhook_events.
// =====================================================================
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { signPickupToken } from "../_shared/qr.ts";
import { isAlreadyProcessed, markProcessed } from "../_shared/webhookIdempotency.ts";

const VIPPS_BASE_URL = Deno.env.get("VIPPS_BASE_URL")!;
const VIPPS_CLIENT_ID = Deno.env.get("VIPPS_CLIENT_ID")!;
const VIPPS_CLIENT_SECRET = Deno.env.get("VIPPS_CLIENT_SECRET")!;
const VIPPS_SUBSCRIPTION_KEY = Deno.env.get("VIPPS_SUBSCRIPTION_KEY")!;
const VIPPS_MERCHANT_SERIAL_NUMBER = Deno.env.get("VIPPS_MERCHANT_SERIAL_NUMBER")!;
const PICKUP_QR_SECRET = Deno.env.get("PICKUP_QR_SECRET")!;

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getVippsAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  const res = await fetch(`${VIPPS_BASE_URL}/accesstoken/get`, {
    method: "POST",
    headers: {
      "client_id": VIPPS_CLIENT_ID,
      "client_secret": VIPPS_CLIENT_SECRET,
      "Ocp-Apim-Subscription-Key": VIPPS_SUBSCRIPTION_KEY,
      "Merchant-Serial-Number": VIPPS_MERCHANT_SERIAL_NUMBER,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`vipps_token_failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (parseInt(data.expires_in, 10) * 1000),
  };
  return cachedToken.token;
}

interface VippsTransactionDetails {
  orderId: string;
  transactionLogHistory: Array<{
    operation: string;
    transactionId: string;
    amount: number;
    operationSuccess: boolean;
    timeStamp: string;
  }>;
}

async function fetchVippsOrderStatus(orderId: string): Promise<VippsTransactionDetails> {
  const token = await getVippsAccessToken();
  const res = await fetch(
    `${VIPPS_BASE_URL}/ecomm/v2/payments/${orderId}/details`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Ocp-Apim-Subscription-Key": VIPPS_SUBSCRIPTION_KEY,
        "Merchant-Serial-Number": VIPPS_MERCHANT_SERIAL_NUMBER,
      },
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`vipps_details_failed: ${res.status} ${body}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("invalid_json", 400);
  }

  const url = new URL(req.url);
  const pathOrderRef = url.pathname.split("/").pop()?.trim();
  const providerIntentId = (body.orderId as string | undefined) ?? pathOrderRef;
  if (!providerIntentId) return errorResponse("missing_orderId", 400);

  // 1. Bekreft mot Vipps API at ordren faktisk har den status webhookens påstår.
  // Dette er vår signaturverifisering — Vipps eCom v2 har ikke HMAC på webhooks,
  // men ved å kalle deres source of truth får vi sikkerhet på linje med signatur.
  let details: VippsTransactionDetails;
  try {
    details = await fetchVippsOrderStatus(providerIntentId);
  } catch (err) {
    console.error("vipps_verify_failed", { providerIntentId, err: String(err) });
    return errorResponse("vipps_verify_failed", 401);
  }

  const lastOp = details.transactionLogHistory?.[0];
  if (!lastOp) return errorResponse("no_transactions", 404);

  // event_id = orderId + transactionId — unik per status-overgang.
  const eventId = `${providerIntentId}:${lastOp.transactionId}:${lastOp.operation}`;

  // 2. Idempotency
  if (await isAlreadyProcessed("vipps", eventId)) {
    console.log("vipps_event_already_processed", { eventId });
    return jsonResponse({ ok: true, idempotent: true });
  }

  const supabase = getServiceClient();

  try {
    // Finn payment_intent i DB
    const { data: pi } = await supabase
      .from("payment_intents")
      .select("*")
      .eq("provider", "vipps")
      .eq("provider_intent_id", providerIntentId)
      .maybeSingle();

    if (!pi) {
      console.error("vipps_unknown_intent", providerIntentId);
      return errorResponse("unknown_intent", 404);
    }

    const op = lastOp.operation.toUpperCase();
    const newStatus = op; // RESERVE / SALE / CANCEL / REFUND
    await supabase
      .from("payment_intents")
      .update({
        status: newStatus,
        raw_payload: details as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pi.id);

    if ((op === "RESERVE" || op === "SALE") && lastOp.operationSuccess) {
      const token = await signPickupToken(pi.order_id, PICKUP_QR_SECRET);
      const { error: confirmErr } = await supabase.rpc("confirm_order_paid", {
        p_order_id: pi.order_id,
        p_provider: "vipps",
        p_provider_intent_id: providerIntentId,
        p_pickup_qr_token: token,
      });
      if (confirmErr) {
        console.error("confirm_order_paid_failed", confirmErr);
        throw new Error(confirmErr.message);
      }
      console.log("vipps_payment_succeeded", { order_id: pi.order_id, op });
    } else if ((op === "CANCEL" || op === "REFUND") && lastOp.operationSuccess) {
      await supabase
        .from("orders")
        .update({
          status: op === "REFUND" ? "refunded" : "cancelled",
          refunded_at: op === "REFUND" ? new Date().toISOString() : null,
          refund_reason: op === "REFUND" ? "vipps_refund" : "vipps_cancel",
        })
        .eq("id", pi.order_id);
      console.log("vipps_payment_cancelled_or_refunded", { order_id: pi.order_id, op });
    }

    await markProcessed("vipps", eventId, { op, providerIntentId });
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("vipps_webhook_error", err);
    return errorResponse(err instanceof Error ? err.message : "unknown", 500);
  }
});
