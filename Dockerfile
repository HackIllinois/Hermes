# Start from base image node v23, see https://hub.docker.com/_/node for reference
FROM node:24

# All of our code will live under /hermes
WORKDIR /hermes

# Copy package.json over, install with frozen lockfile (don't let things update, the proper lockfile should be commited)
COPY package.json yarn.lock .
RUN yarn install --frozen-lockfile

# Copy over all code & config into image
COPY src/ src/
COPY *.md *.json .

# Build
RUN yarn build

# Expose hermes port
ENV PORT=5555
EXPOSE ${PORT}

# Start hermes!
CMD ["yarn", "start"]
