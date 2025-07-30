ARG ALPINE_LINUX_VERSION=3.22

###############
# Build Image #
###############
FROM denoland/deno:alpine as build

WORKDIR /app
RUN chown -R deno:deno /app
USER deno

COPY . .
RUN deno install && deno run build

#############
# App Image #
#############
FROM alpine:3.22 as linode-ddns
RUN mkdir /linode-ddns
WORKDIR /linode-ddns
ENV LINODE_API_TOKEN=

COPY --from=build /app/dist/linode-ddns /linode-ddns/linode-ddns

VOLUME /linode-ddns/linode-ddns.json
CMD ["/linode-ddns/linode-ddns"]
