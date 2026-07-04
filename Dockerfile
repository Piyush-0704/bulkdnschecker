FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY backend/ ./backend/
EXPOSE 7860
ENV PORT=7860
CMD ["node", "backend/index.js"]
