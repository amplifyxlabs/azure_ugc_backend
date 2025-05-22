FROM node:20

RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /app
COPY . .
RUN npm install

CMD ["npm", "start"] 