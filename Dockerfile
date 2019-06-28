
FROM mountainpass/superlife:node-builder as install
COPY package*.json ./
RUN npm i --production
COPY . .

FROM mountainpass/superlife:node-runtime
COPY --from=install /root .