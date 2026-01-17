
FROM node:22

# Install ffmpeg and build tools for native modules (sodium, opus)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Compile TS to JS
RUN npm run build

CMD ["node", "dist/index.js"]
