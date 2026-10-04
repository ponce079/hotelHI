# Runbook del despliegue de estadía en la base compartida

Rama `docs/despliegue-estadia`, desde `origin/feature/estadia-ocupantes`. PR hacia `feature/estadia-ocupantes`.

## Qué incluye

- **`docs/despliegue-estadia.md`**: runbook paso a paso en PowerShell para aplicar la migración de estadía en la compartida de Clever Cloud una sola vez, después del merge a `master`. Tiene:
  - qué cambia y qué datos pueden verse afectados;
  - las lecciones del despliegue de tarifas;
  - los 10 pasos con cada comando y lo que debería verse;
  - la prueba de humo con el walk-in `PRUEBA-DESPLIEGUE-1`, cuyo código queda listado para la limpieza del 8/10;
  - la vuelta atrás, probada;
  - la actualización de la base local de cada integrante;
  - el informe del ensayo.
- **`backend/scripts/_destinoMigracion.js`** (con tests): modo explícito para apuntar a la compartida.
  - Por defecto, todo lo que no sea local sigue bloqueado.
  - Con `CONFIRMAR_BASE_COMPARTIDA=<base>`, que tiene que coincidir con la base de `DATABASE_URL`, y escribiendo el nombre de la base cuando se pide. Muestra host y base, nunca las credenciales.
  - Lo usa `actualizar-esquema-estadia.js`; la guardia de host local (`_baseLocal.js`) no cambió.
- **`backend/scripts/verificar-previo-estadia.js`**: verificación de solo lectura, antes y después (`--despues`). Revisa:
  - conteos y plan pendiente;
  - tablas de estadía que ya existan y sus filas huérfanas;
  - índices de `huespedes` y tipos de documento fuera del catálogo;
  - reservas vigentes;
  - `prisma migrate diff` contra `schema.prisma`.

## Qué cambia en la compartida

Son 32 operaciones aditivas:
- 3 tablas nuevas;
- 23 columnas nuevas, todas `NULL` o con valor por defecto;
- 3 índices únicos sobre columnas nuevas;
- 4 claves foráneas desde las tablas nuevas.

**No modifica ni borra ninguna fila**, no usa `db push` ni `--accept-data-loss`, y no incluye la normalización de documentos (la hace Ricardo). El detalle está en el runbook.

## Ensayo

Sobre una copia local (`hotelhi_ensayo`) del backup real de la compartida del 2/10 a las 23:09, con el modo explícito:

| Paso | Resultado |
|---|---|
| Verificación previa | OK, 32 de 32 pendientes; todas las diferencias de esquema eran de estadía |
| Migración | 1,8 s |
| Segunda corrida | 0 operaciones |
| Verificación posterior | Conteos idénticos y `prisma migrate diff` vacío |
| Vuelta atrás (borrar las 3 tablas y `source`) | Volvió a 32 de 32 con los mismos conteos y los acentos intactos |

No hubo problemas. La base de ensayo y las copias locales se borraron.

## Pendiente

- Correr el runbook en la compartida, después del merge a `master`. Lo hace Gimena.
- Anotar el código de la reserva de prueba en "Datos de prueba a limpiar".

🤖 Generated with [Claude Code](https://claude.com/claude-code)
