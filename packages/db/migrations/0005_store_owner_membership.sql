-- Al crear una tienda, crear automáticamente la membresía `owner` del dueño.
--
-- Por qué: bajo RLS, el creador NO puede insertar su propia fila en
-- `store.store_members` (la política `sm_insert` exige ya ser owner/admin de la
-- tienda). Un trigger SECURITY DEFINER (owner `3b`, que bypassa RLS al no tener
-- FORCE ROW LEVEL SECURITY) resuelve el bootstrap de forma atómica con el INSERT
-- de la tienda, sin abrir un agujero en la política. La capacidad de Seller del
-- dueño queda así derivada de una membresía real (coherente con el seed y /me).

CREATE OR REPLACE FUNCTION store.tg_create_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  INSERT INTO store.store_members (store_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (store_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS stores_owner_membership ON store.stores;
--> statement-breakpoint

CREATE TRIGGER stores_owner_membership
AFTER INSERT ON store.stores
FOR EACH ROW
EXECUTE FUNCTION store.tg_create_owner_membership();
