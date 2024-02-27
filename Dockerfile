FROM node:16-bullseye

# node doesnt like to run as pid 1 so install dumb-init to avoid that
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init
WORKDIR /usr/src/app
COPY --chown=node:node . .
RUN yarn install --frozen-lockfile
ENV NODE_ENV production
RUN rm -rf node_modules/mrgn-ts
COPY ./mrgn-ts /usr/src/app/node_modules/mrgn-ts
RUN yarn build
USER node

CMD ["dumb-init", "node", "--max-old-space-size=46384", "--max-semi-space-size=15512", "build/src/bot.js"]
