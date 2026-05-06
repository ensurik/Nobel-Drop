// =====================================================================
// verify-pickup
// Driver skanner QR. Vi verifiserer HMAC og markerer ordre som picked_up.
// POST body: { token: string }
// =====================================================================
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient, getUserFromRequest } from "../_shared/supabase.ts";
import { verifyPickupToken } from "../_shared/qr.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405);

  try {
    const user = await getUserFromRequest(req);
    if (!user) return errorResponse("unauthorized", 401);

    const supabase = getServiceClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "driver" && profile.role !== "admin")) {
      return errorResponse("forbidden", 403);
    }

    const { token } = await req.json();
    if (!token) return errorResponse("missing_token");

    const { orderId } = await verifyPickupToken(token, Deno.env.get("PICKUP_QR_SECRET")!);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*, order_items(*, products(name)), profiles!orders_user_id_fkey(full_name)")
      .eq("id", orderId)
      .eq("pickup_qr_token", token)
      .single();

    if (orderErr || !order) return errorResponse("order_not_found", 404);
    if (!["paid", "confirmed"].includes(order.status)) {
      return errorResponse("invalid_status", 409, { status: order.status });
    }

    const { error: markErr } = await supabase.rpc("mark_order_picked_up", {
      p_order_id: orderId,
      p_driver_id: user.id,
    });
    if (markErr) return errorResponse(markErr.message, 500);

    return jsonResponse({
      ok: true,
      order: {
        id: order.id,
        customer: (order as { profiles?: { full_name?: string } }).profiles?.full_name,
        items: (order as { order_items: Array<{ quantity: number, products: { name: string } }> }).order_items.map((oi) => ({
          name: oi.products?.name,
          qty: oi.quantity,
        })),
      },
    });
  } catch (err) {
    if (err instanceof Error && (err.message === "invalid_signature" || err.message === "invalid_token_format")) {
      return errorResponse(err.message, 400);
    }
    console.error("verify-pickup error", err);
    return errorResponse(err instanceof Error ? err.message : "unknown", 500);
  }
});
