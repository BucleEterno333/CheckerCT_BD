#!/bin/bash
# start.sh
set -e

echo "=== CHECKERCT BACKEND STARTING ==="
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Working directory: $(pwd)"
echo "User: $(whoami)"

# Listar archivos para debug
echo "=== LISTANDO ARCHIVOS ==="
ls -la

# Verificar node_modules
echo "=== VERIFICANDO DEPENDENCIAS ==="
if [ -d "node_modules" ]; then
    echo "✅ node_modules existe"
    echo "Tamaño: $(du -sh node_modules | cut -f1)"
else
    echo "❌ node_modules NO existe"
    echo "Instalando dependencias..."
    npm install --production
fi

# Verificar package.json
if [ -f "package.json" ]; then
    echo "✅ package.json existe"
    echo "Dependencias principales:"
    cat package.json | grep -A 20 '"dependencies"'
else
    echo "❌ package.json NO existe"
    exit 1
fi

# Verificar index.js
if [ -f "index.js" ]; then
    echo "✅ index.js existe"
else
    echo "❌ index.js NO existe"
    exit 1
fi

# Verificar variables de entorno
echo "=== VARIABLES DE ENTORNO ==="
echo "NODE_ENV: ${NODE_ENV:-no definido}"
echo "PORT: ${PORT:-no definido}"
echo "DB_HOST: ${DB_HOST:-no definido}"
echo "JWT_SECRET: ${JWT_SECRET:+(definido)}"

# Iniciar aplicación
echo "=== INICIANDO APLICACIÓN ==="
exec node index.js