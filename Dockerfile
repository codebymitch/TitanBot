FROM node:20

# Install ffmpeg and yt-dlp (required for music playback)
RUN apt-get update && apt-get install -y ffmpeg python3 python3-pip --no-install-recommends \
    && pip3 install --break-system-packages yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install only production dependencies
RUN YOUTUBE_DL_SKIP_PYTHON_CHECK=1 npm install --omit=dev

# Bundle app source
COPY . .

# Expose the health check port from src/app.js
EXPOSE 3000

# Start the bot
CMD [ "npm", "start" ]