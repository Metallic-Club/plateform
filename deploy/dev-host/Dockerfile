FROM rust:1.99.1-bookworm@sha256:9181b56c2a21ab1d5e73cffe04fc762426d30aa7fac3c91141dd033f49a7fc8b AS build
WORKDIR /build
COPY server/Cargo.toml server/Cargo.lock server/build.rs ./server/
COPY server/src ./server/src
COPY server/migrations ./server/migrations
COPY api/openapi.yaml ./api/openapi.yaml
RUN cargo build --manifest-path server/Cargo.toml --release --locked -j 4

FROM debian:bookworm-slim@sha256:99c0b25c46d0214d5a2091092e7908907dcaecd6a962cde0ac700acee222b6f3
COPY --from=build /build/server/target/release/metallic-platform /usr/local/bin/metallic-platform
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /lib/x86_64-linux-gnu/libgcc_s.so.1 /lib/x86_64-linux-gnu/libgcc_s.so.1
COPY --chmod=0555 deploy/dev-host/entrypoint.sh /usr/local/bin/metallic-entrypoint
USER 10001:10001
WORKDIR /tmp
ENTRYPOINT ["/usr/local/bin/metallic-entrypoint"]
CMD ["serve"]
