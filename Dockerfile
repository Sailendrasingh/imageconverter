FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    imagemagick \
    libheif-examples \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public/ public/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
