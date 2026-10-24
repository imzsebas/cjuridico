import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Margen para equipos lentos: cargar la fuente del PDF o arrancar el Postgres en memoria puede tardar varios segundos
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // El cliente de Supabase exige estas variables al importarse; en las pruebas nunca se conecta a nada.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.prueba',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'clave-de-prueba',
      SUPABASE_SERVICE_ROLE_KEY: 'clave-servicio-de-prueba',
    },
  },
});
