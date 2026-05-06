// =====================================================================
// vipps-create-payment
// Initierer en Vipps eCom v2 payment for en gitt ordre.
// Forutsetter at create-order allerede har reservert ordren.
//
// POST body:
// { order_id: uuid, amount_ore: bigint, return_url?: string }
// =====================================================================
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";

const VIPPS_BASE_URL = Deno.env.get("VIPPS_BASE_URL") ?? "https://apitest.vipps.no";

async function getVippsAccessToken() {
  const res = await fetch(`${VIPPS_BASE_URL}/accesstoken/get`, {
    method: "POST",
    headers: {
      client_id: Deno.env.get("VIPPS_CLIENT_ID")!,
      client_secret: Deno.env.get("VIPPS_CLIENT_SECRET")!,
      "Ocp-Apim-Subscription-Key": Deno.env.get("VIPPS_SUBSCRIPTION_KEY")!,
      "Merchant-Serial-Number": Deno.env.get("VIPPS_MERCHANT_SERIAL_NUMBER")!,
    },
  });
  if (!res.ok) throw new Error(`vipps_token_failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405);

  try {
    const { order_id, amount_ore, return_url } = await req.json();
    if (!order_id || !amount_ore) return errorResponse("missing_fields");

    const supabase = getServiceClient();
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*, profiles(phone, full_name)")
      .eq("id", order_id)
      .single();
    if (orderErr || !order) return errorResponse("order_not_found", 404);

    const accessToken = await getVippsAccessToken();
    const merchantSerial = Deno.env.get("VIPPS_MERCHANT_SERIAL_NUMBER")!;
    const callbackPrefix = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

    const payload = {
      merchantInfo: {
        merchantSerialNumber: merchantSerial,
        callbackPrefix: callbackPrefix,
        fallBack: return_url ?? `${Deno.env.get("APP_URL")}/checkout/return?order_id=${order_id}`,
        consentRemovalPrefix: callbackPrefix,
      },
      customerInfo: {
        mobileNumber: (order as { profiles?: { phone?: string } }).profiles?.phone ?? "",
      },
      transaction: {
        orderId: order_id.replace(/-/g, "").substring(0, 30),
        amount: amount_ore,
        transactionText: `Nobel Drop ordre ${order_id.substring(0, 8)}`,
      },
    };

    const res = await fetch(`${VIPPS_BASE_URL}/ecomm/v2/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Ocp-Apim-Subscription-Key": Deno.env.get("VIPPS_SUBSCRIPTION_KEY")!,
        "Merchant-Serial-Number": merchantSerial,
        "Content-Type": "application/json",
        "X-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("vipps_init_error", data);
      return errorResponse("vipps_init_failed", 502, { detail: data });
    }

    await supabase.from("payment_intents").insert({
      order_id,
      provider: "vipps",
      provider_intent_id: data.orderId ?? payload.transaction.orderId,
      status: "INITIATED",
      amount_ore,
      raw_payload: data,
    });

    return jsonResponse({ provider: "vipps", redirect_url: data.url, intent_id: data.orderId });
  } catch (err) {
    console.error("vipps-create-payment error", err);
    return errorResponse(err instanceof Error ? err.message : "unknown", 500);
  }
});
