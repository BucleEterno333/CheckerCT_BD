# Dockerfile
# Usar Node.js LTS Alpine para imagen más pequeña
FROM node:18-alpine AS builder

# Instalar dependencias necesarias para compilar módulos nativos
RUN apk add --no-cache python3 make g++ git

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias primero para cache
COPY package*.json ./

# Instalar TODAS las dependencias (incluyendo devDependencies para build si es necesario)
RUN npm ci --legacy-peer-deps

# Copiar todo el código fuente
COPY . .

# ============================================
# Etapa de producción
# ============================================
FROM node:18-alpine AS production

# Instalar solo lo esencial
RUN apk add --no-cache dumb-init

WORKDIR /app

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copiar node_modules y package.json desde builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Copiar el resto de la aplicación
COPY --from=builder --chown=nodejs:nodejs /app/. ./

# Cambiar a usuario no-root
USER nodejs

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error()})"

# Usar dumb-init para manejar señales correctamente
ENTRYPOINT ["dumb-init", "--"]

# Comando para iniciar
CMD ["node", "index.js"]