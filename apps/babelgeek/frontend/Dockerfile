FROM node:20-alpine

WORKDIR /app

COPY package.json ./

RUN npm config set @geeksuite:registry http://172.17.0.1:4873

RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
