'use client';

import { createAuthClient } from 'better-auth/react';

// Same-origin: el web proxya /api/auth a la API (ver next.config rewrites),
// así que el baseURL por defecto (origen actual) funciona.
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
