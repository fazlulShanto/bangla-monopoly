FROM quay.io/soketi/soketi:1.6-16-alpine

COPY docker/soketi.cjs /runtime/soketi.cjs
ENTRYPOINT ["node", "/runtime/soketi.cjs"]
