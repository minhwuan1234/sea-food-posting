FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY public ./public
COPY src ./src
EXPOSE 4173
ENV HOST=0.0.0.0
CMD ["npm", "start"]
