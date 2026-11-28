# syntax=docker/dockerfile:1

FROM node:20-alpine

LABEL org.opencontainers.image.title="Luna Bot"
LABEL org.opencontainers.image.description="Discord Music & Community Bot powered by discord.js, @discordjs/voice, yt-dlp, and ffmpeg"

WORKDIR /usr/src/app

ENV NODE_ENV=production \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    PIP_BREAK_SYSTEM_PACKAGES=1

# تثبيت الأدوات الأساسية للصوت واستخراج الروابط
RUN apk add --no-cache \
      ca-certificates \
      ffmpeg \
      python3 \
      py3-pip \
    && pip3 install --no-cache-dir --upgrade \
      "yt-dlp[default]" \
      yt-dlp-ejs

# نسخ ملفات الاعتماديات أولاً للاستفادة من طبقة الكاش
COPY package.json package-lock.json* ./

# تثبيت حزم الإنتاج فقط وتنظيف الكاش
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev \
    && npm cache clean --force

# نسخ باقي ملفات المشروع
COPY . .

# إنشاء مستخدم غير جذري وتشغيل الحاوية بأمان
RUN addgroup -S luna && adduser -S luna -G luna \
    && chown -R luna:luna /usr/src/app

USER luna

EXPOSE 3000

CMD ["npm", "start"]
