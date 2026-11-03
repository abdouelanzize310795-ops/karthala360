FROM node:20.20.2-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache su-exec
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js db.js render.js securite.js pdf.js ./
COPY public ./public
COPY scripts ./scripts
RUN mkdir -p /app/data && chown -R node:node /app/data
ENV PORT=3000 DB_FILE=/app/data/karthala360.db
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/k360?action=stats >/dev/null || exit 1
# Le volume de données peut avoir été créé par un autre conteneur (propriétaire root) :
# on rend le dossier à l'utilisateur node, puis l'application tourne sans droits root.
CMD ["sh", "-c", "chown -R node:node /app/data && exec su-exec node node server.js"]
