// =====================================================================
// evaluate-pickup-windows (cron / manuell)
// Kjører gjennom alle pickup_windows hvor cutoff_at < now() og status er
// 'open' eller 'locked'. Bestemmer om vinduet får nok volum eller skal
// refunderes. Aktuelle betalingsleverandører kalles for refusjon.
// Kjøres typisk hvert 5. minutt via supabase cron eller GitHub Actions.
// =====================================================================
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";

async function refundVipps(intentId: string, amountOre: number) {
  const VIPPS_BASE_URL = Deno.env.get("VIPPS_BASE_URL") ?? "https://apitest.vipps.no";
  const tokenRes = await fetch(`${VIPPS_BASE_URL}/accesstoken/get`, {
    method: "POST",
    headers: {
      client_id: Deno.env.get("VIPPS_CLIENT_ID")!,
      client_secret: Deno.env.get("VIPPS_CLIENT_SECRET")!,
      "Ocp-Apim-Subscription-Key": Deno.env.get("VIPPS_SUBSCRIPTION_KEY")!,
      "Merchant-Serial-Number": Deno.env.get("VIPPS_MERCHANT_SERIAL_NUMBER")!,
    },
  });
  const { access_token } = await tokenRes.json();
  return fetch(`${VIPPS_BASE_URL}/ecomm/v2/payments/${intentId}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Ocp-Apim-Subscription-Key": Deno.env.get("VIPPS_SUBSCRIPTION_KEY")!,
      "Merchant-Serial-Number": Deno.env.get("VIPPS_MERCHANT_SERIAL_NUMBER")!,
      "X-Request-Id": crypto.randomUUID(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      merchantInfo: { merchantSerialNumber: Deno.env.get("VIPPS_MERCHANT_SERIAL_NUMBER") },
      transaction: { amount: amountOre, transactionText: "Refund — minimumsvolum ikke nådd" },
    }),
  });
}

async function refundStripe(intentId: string) {
  const Stripe = (await import("https://esm.sh/stripe@14.21.0?target=deno")).default;
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
  return stripe.refunds.create({ payment_intent: intentId });
}

async function refundKlarna(klarnaOrderId: string, amountOre: number) {
  const KLARNA_BASE_URL = Deno.env.get("KLARNA_BASE_URL") ?? "https://api.playground.klarna.com";
  const u = Deno.env.get("KLARNA_USERNAME")!;
  const p = Deno.env.get("KLARNA_PASSWORD")!;
  return fetch(`${KLARNA_BASE_URL}/ordermanagement/v1/orders/${klarnaOrderId}/refunds`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${u}:${p}`)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ refunded_amount: amountOre, description: "Minimumsvolum ikke nådd" }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = getServiceClient();

    // Finn vinduer som skal evalueres
    const { data: windows } = await supabase
      .from("pickup_windows")
      .select("id, drop_id")
      .in("status", ["open", "locked"])
      .lt("cutoff_at", new Date().toISOString());

    if (!windows?.length) return jsonResponse({ ok: true, evaluated: 0 });

    let confirmedCount = 0;
    let refundedCount = 0;

    for (const w of windows) {
      const { data: result } = await supabase.rpc("evaluate_pickup_window", {
        p_window_id: w.id,
      });
      const action = result?.[0]?.action;
      const orderIds: string[] = result?.[0]?.order_ids ?? [];

      if (action === "confirmed") confirmedCount++;
      if (action === "refunded") {
        refundedCount += orderIds.length;
        // Trigger refund hos provider for hver ordre
        for (const oid of orderIds) {
          const { data: pi } = await supabase
            .from("payment_intents")
            .select("provider, provider_intent_id, amount_ore")
            .eq("order_id", oid)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
          if (!pi?.provider_intent_id) continue;
          try {
            if (pi.provider === "vipps") await refundVipps(pi.provider_intent_id, pi.amount_ore);
            if (pi.provider === "stripe") await refundStripe(pi.provider_intent_id);
            if (pi.provider === "klarna") await refundKlarna(pi.provider_intent_id, pi.amount_ore);
          } catch (e) {
            console.error("refund failed for order", oid, e);
          }
        }
      }
    }

    return jsonResponse({ ok: true, confirmed: confirmedCount, refunded_orders: refundedCount });
  } catch (err) {
    console.error("evaluate-pickup-windows error", err);
    return errorResponse(err instanceof Error ? err.message : "unknown", 500);
  }
});
