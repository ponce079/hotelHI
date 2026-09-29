# Backend — SGH Holiday Inn

## Usuarios de prueba

Para que todo el equipo pueda loguearse mientras prueba su parte, hay un script que crea un usuario de prueba por cada rol del sistema (admin, recepcionista, housekeeping, deposito, compras, gerente), con nombre de usuario `<rol>.prueba` (ej. `gerente.prueba`).

Correrlo:

```bash
cd backend
node scripts/seed-usuarios-prueba.js
```

Es idempotente — se puede correr las veces que haga falta: si un usuario de prueba ya existe, lo deja activo, le resetea los intentos fallidos y le actualiza la contraseña, sin duplicar nada.

**Contraseña**: es la misma para los 6 usuarios de prueba y el script la imprime al final. Por defecto usa una contraseña de desarrollo fija, pero se puede fijar la propia con la variable `SEED_USUARIOS_PASSWORD` en el `.env` (ver `.env.example`) antes de correr el script. La contraseña en uso se comparte por el canal del equipo, no queda documentada acá.

**Usuarios que crea** (uno por rol válido del sistema):

- `admin.prueba`
- `recepcionista.prueba`
- `housekeeping.prueba`
- `deposito.prueba`
- `compras.prueba`
- `gerente.prueba`

El script se niega a correr si `NODE_ENV=production`.
