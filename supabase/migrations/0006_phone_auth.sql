-- 0006_phone_auth.sql
-- Konvertér auth fra epost-magic-link til telefon+passord.
-- Telefon blir primær identifikator; epost beholdes som valgfritt felt for senere.

-- Gjør epost nullable i profiles slik at telefon-kun-brukere er gyldige.
ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;

-- Auto-opprett en profil-rad når en ny auth.users-rad opprettes.
-- Kopier email og phone hvis de finnes; sett role='customer' default.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, role, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    'customer',
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(NEW.email, public.profiles.email),
        phone = COALESCE(NEW.phone, public.profiles.phone);
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Sync-trigger for fremtidige endringer (hvis bruker oppdaterer phone i auth)
CREATE OR REPLACE FUNCTION public.sync_user_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email
     OR NEW.phone IS DISTINCT FROM OLD.phone
  THEN
    UPDATE public.profiles
       SET email = NEW.email,
           phone = NEW.phone
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_user_to_profile() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF email, phone ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_to_profile();
