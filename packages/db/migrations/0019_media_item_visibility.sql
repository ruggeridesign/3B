-- Custom SQL migration file, put your code below! --

-- Visibilidad de imágenes de ítems para compradores. `media_select` (0007) acota
-- por `created_by` (solo quien subió la ve). Esta policy permissive (se combina
-- por OR) deja ver una media `owner_type='item'` a quien pueda ver el ítem: la
-- subconsulta a catalog.items queda sujeta a su RLS (publicado en comunidad
-- visible, o miembro de la tienda). Así la ficha pública muestra las fotos sin
-- acoplar media→catalog en el código.
CREATE POLICY media_select_item ON media.media FOR SELECT USING (
  owner_type = 'item'
  AND EXISTS (SELECT 1 FROM catalog.items i WHERE i.id = owner_id)
);--> statement-breakpoint

-- Disponibilidad visible al comprador: la RLS de `stock_levels` (M3) era solo de
-- miembros. Esta policy permissive (OR) deja LEER el nivel a quien pueda ver la
-- variante→ítem (publicado en comunidad visible). La API solo expone `available`
-- en la ficha, no datos operativos crudos.
CREATE POLICY stock_levels_select_public ON inventory.stock_levels FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM catalog.item_variants v
    JOIN catalog.items i ON i.id = v.item_id
    WHERE v.id = variant_id
  )
);