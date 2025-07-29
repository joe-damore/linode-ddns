ARG ALPINE_LINUX_VERSION=3.22

###############
# Build Image #
###############
FROM denoland/deno:alpine as build

# Update and install dependencies
RUN apk upgrade --update && \
  apk add --no-cache git

USER deno
RUN mkdir /linode-ddns
WORKDIR /linode-ddns
RUN git clone -b master https://github.com/joe-damore/linode-ddns.git .
RUN deno run build

#############
# App Image #
#############
FROM alpine:3.22 as linode-ddns
RUN mkdir /linode-ddns
WORKDIR /linode-ddns

COPY --from=build /linode-ddns/dist/linode-ddns /linode-ddns/linode-ddns

VOLUME /linode-ddns/linode-ddns.json
CMD ["/linode-ddns/linode-ddns"]
