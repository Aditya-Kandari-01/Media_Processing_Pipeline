FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
COPY storage ./storage
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "api"]
