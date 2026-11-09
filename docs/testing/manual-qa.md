# Checklist de QA manual — 3B

Guía para recorrer la app **a mano**, por tipo de usuario. Espeja la cobertura E2E
(`e2e/flows/`): si algo acá falla, probablemente falte/falle un test automático.

## Preparar el entorno

```bash
pnpm db:up          # Postgres (:5433) + Valkey (:6380)
pnpm db:reset       # migraciones + seed determinista + credenciales de dev
pnpm --filter @3b/api dev       # API (:8787)
pnpm --filter @3b/web dev       # Web (:3000)  ← abrir acá
pnpm --filter @3b/worker dev    # worker (vencimientos, outbox→Valkey, push)
```

Abrir **http://localhost:3000**. Todos los usuarios usan la contraseña de dev
**`Password123!`**.

## Usuarios del seed (quién es qué)

| Email | Rol principal | Qué debería ver |
| --- | --- | --- |
| `admin@3b.test` | Admin de Plataforma | espacio **Admin** + botón **Ver como** |
| `ana@3b.test` | Admin de Comunidad (Coro) | espacio **Comunidad** |
| `carlos@3b.test` | Seller (2 tiendas) | espacio **Mi Tienda** con tiendas |
| `marta@3b.test` | Seller | espacio **Mi Tienda** con tiendas |
| `pedro@3b.test` | Mover (aprobado) | espacio **Mover** |
| `lucia@3b.test` | Maker (solo comprador) | **Comprar** + **Carrito**, sin otros espacios |

> Todo usuario es Maker: **Comprar** y **Carrito** aparecen siempre.

## Transversal (cualquier usuario)

- [ ] Sin sesión, visitar `/` redirige a `/login`.
- [ ] Login con un usuario del seed → aterriza en la home con "Hola, <nombre>" y la
      lista de **Capacidades** correcta.
- [ ] El menú de usuario (arriba a la derecha) → **Cerrar sesión** vuelve a `/login`.
- [ ] El navbar muestra **solo** los espacios que corresponden al rol (ver tabla).

## Maker — `lucia@3b.test`

- [ ] Home: capacidades = **Maker**; navbar con **Comprar** y **Carrito** (sin Mi
      Tienda/Mover/Comunidad/Admin).
- [ ] **Comprar**: se listan ítems de sus comunidades (o el vacío si no hay).
- [ ] Abrir un ítem → **agregar al carrito** → el contador de **Carrito** sube.
- [ ] **Carrito** → checkout → el pedido aparece en **Mis pedidos** (estado
      "realizado").

## Seller — `carlos@3b.test`

- [ ] Navbar con **Mi Tienda**; la página lista **sus tiendas** del seed.
- [ ] Abrir una tienda → se ve su catálogo / gestión.
- [ ] Un pedido entrante se puede **aceptar** y llevar a **listo** (reserva stock al
      aceptar; se libera si se cancela).

## Mover — `pedro@3b.test`

- [ ] Navbar con **Mover**; la página muestra **Solicitudes abiertas** y, si hay,
      **Mis viajes**.
- [ ] (Si hay un envío asignado) se puede **avanzar** el viaje hasta **entregar**.

## Admin de Comunidad — `ana@3b.test`

- [ ] Navbar con **Comunidad**; el panel abre **sin** redirigir.
- [ ] Se ven las secciones **Verificaciones**, **Cobros por confirmar** y **Reportes
      abiertos**, acotadas a su comunidad (Coro).

## Admin de Plataforma — `admin@3b.test`

- [ ] Navbar con **Admin** + botón **Ver como**.
- [ ] **Ver como** abre un menú con roles (Comprar/Maker, Mi Tienda/Seller, Mover,
      Comunidad) y cada uno con su usuario de ejemplo.
- [ ] Elegir **Mover** → aparece el banner "Estás viendo como Pedro (Mover)", el
      navbar muestra el espacio **Mover** y la home saluda "Hola, Pedro (Mover)".
- [ ] Con "Ver como" aún visible, **saltar directo** a **Mi Tienda** (Seller) sin
      volver a admin primero → la interfaz cambia a la del Seller.
- [ ] **Volver a tu cuenta** (banner o menú) → vuelve a Admin de Plataforma.
