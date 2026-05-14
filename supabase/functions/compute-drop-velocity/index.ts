// =====================================================================
// compute-drop-velocity
// GET endpoint som wrapper get_drop_stats med 30s edge cache.
// Tillater anonym aksess (stats er aggregate, ikke per-bruker data).
//
// Query: ?drop_id=<uuid>
// Returnerer: { units_left, sold_last_5min, velocity_label, ... }
// =====================================================================
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return errorResponse("method_not_allowed", 405);

  const url = new URL(req.url);
  const dropId = url.searchParams.get("drop_id");
  if (!dropId) return errorResponse("missing drop_id", 400);

  // Valider UUID-format før vi treffer DB
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dropId)) {
    return errorResponse("invalid drop_id", 400);
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc("get_drop_stats", { p_drop_id: dropId });
    if (error) {
      console.error("get_drop_stats_error", error);
      return errorResponse(error.message, 500);
    }

    if (data?.error === "drop_not_found") {
      return errorResponse("drop_not_found", 404);
    }

    return jsonResponse(data, {
      headers: {
        // Cache 30s ved edge / CDN, og tillat stale-while-revalidate i 60s.
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("compute_drop_velocity_error", err);
    return errorResponse(err instanceof Error ? err.message : "unknown", 500);
  }
});
