# Compra Negocio

Marketplace intermediado para comprar y vender participaciones o negocios digitales completos.

## Principios del producto

- Ningún negocio aparece publicado hasta ser aprobado por el equipo.
- Compradores y vendedores no reciben información de contacto entre sí.
- Todas las ofertas llegan primero al panel de Compra Negocio.
- El vendedor puede ofrecer cualquier participación entre 0,01% y 100%.
- La comisión se aplica únicamente cuando una operación se concreta.

## Áreas incluidas

- Sitio público y mercado de oportunidades aprobadas.
- Registro e inicio de sesión mediante Supabase Auth.
- Envío de negocios con estado pendiente de revisión.
- Ofertas privadas dirigidas al equipo de Compra Negocio.
- Área personal para consultar publicaciones y ofertas.
- Panel administrativo para aprobar o rechazar publicaciones y administrar ofertas.

## Configuración local

1. Copiar `.env.example` como `.env.local`.
2. Completar la URL y la clave pública del proyecto de Supabase.
3. Aplicar la migración incluida en `supabase/migrations`.
4. Ejecutar `npm install` y `npm run dev`.

## Publicación

El proyecto usa Next.js y está preparado para desplegarse en Vercel.
