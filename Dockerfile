FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install only production dependencies
RUN apk add --no-cache ffmpeg python3 py3-pip && \
    pip3 install yt-dlp --break-system-packages --quiet && \
    mkdir -p /root/.config/yt-dlp && \
    echo '--js-runtimes node' > /root/.config/yt-dlp/config && \
    yt-dlp --js-runtimes node --remote-components ejs:github --simulate "https://www.youtube.com/watch?v=jNQXAC9IVRw" 2>/dev/null || true

RUN npm ci --omit=dev

# Bundle app source
COPY . .

# Expose the health check port from src/app.js
EXPOSE 3000

# Start the bot
CMD [ "npm", "start" ]
