FROM node:21-alpine

# Add build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

WORKDIR /app

COPY package.json package-lock.json ./

# Upgrade npm, remove deprecated packages, and fix vulnerabilities
RUN npm install -g npm@latest && npm install && npm audit fix --force

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
