-- 0005_webhook_events.sql
-- Idempotency-tabell for payment-webhooks. Hindrer dobbeltbehandling
-- når en provider sender samme event mer enn én gang (Stripe retries,
-- Vipps duplicate callbacks, manuell replay osv.).

CREATE TABLE IF NOT EXISTS public.webhook_events (
  provider     text        NOT NULL,
  event_id     text        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  metadata     jsonb,
  PRIMARY KEY (provider, event_id)
);

CREATE INDEX IF NOT EXISTS webhook_events_processed_at
  ON public.webhook_events(processed_at DESC);

-- Default deny-all (service_role bypasser RLS, så ingen policies trengs).
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.webhook_events IS
  'Hver rad markerer en webhook som er behandlet. Webhook-handlers sjekker eksistens før de prosesserer, og inserter etter — lagde idempotent.';
