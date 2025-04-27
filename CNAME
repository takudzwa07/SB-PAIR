FROM node:lts-buster
USER root
RUN apt-get update && \
    apt-get install -y ffmpeg webp git && \
    apt-get upgrade -y && \
    rm -rf /var/lib/apt/lists/*
USER node
RUN git clone https://github.com/takudzwa07/SB-PAIR.git /home/node/SB-PAIR
WORKDIR /home/node/SB-PAIR
RUN chmod -R 777 /home/node/SB-PAIR/
RUN yarn install --network-concurrency 1
EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]
