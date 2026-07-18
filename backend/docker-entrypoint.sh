#!/bin/sh
set -e

# El proyecto no usa migraciones de Prisma (no hay carpeta prisma/migrations),
# asi que sincronizamos el esquema directamente contra la base con "db push".
# Esto es lo que faltaba para que una base de Postgres recien creada (el
# primer "docker compose up" de un companero, con el volumen vacio) termine
# con las tablas creadas: antes nadie corria este paso, el backend arrancaba
# bien pero cada consulta fallaba porque las tablas no existian.
#
# "depends_on" en docker-compose solo espera a que el contenedor de Postgres
# arranque, no a que ya acepte conexiones — por eso reintentamos en vez de
# fallar al primer intento.
echo "Sincronizando el esquema de Prisma con la base de datos..."
until npx prisma db push --accept-data-loss --skip-generate; do
  echo "Postgres todavia no esta listo (o el push fallo), reintentando en 3s..."
  sleep 3
done

# Datos de ejemplo (un ejercicio por modulo) para que la app no arranque
# completamente vacia. seed.ts es idempotente: si ya hay un proyecto en la
# base (osea, si ya se corrio antes o alguien ya guardo ejercicios reales),
# no borra ni toca nada.
echo "Sembrando datos de ejemplo si la base esta vacia..."
node dist/seed.js || echo "Aviso: el seed fallo, se continua igual (la app funciona sin datos de ejemplo)."

echo "Listo. Iniciando el backend..."
exec node dist/server.js
