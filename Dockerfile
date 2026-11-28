FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

# تثبيت ffmpeg و Python + yt-dlp مع ملحقات JS
RUN apk add --no-cache ffmpeg python3 py3-pip && \
    pip3 install --no-cache-dir --break-system-packages --upgrade "yt-dlp[default]" yt-dlp-ejs

# تثبيت اعتماديات Node أولاً للاستفادة من الكاش
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# نسخ باقي ملفات المشروع
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
