FROM alpine:3.20

RUN apk add --no-cache \
    dnsmasq \
    nginx \
    samba \
    wimlib \
    python3 \
    bash \
    curl \
    wget \
    gettext

# Download iPXE binaries (secondary boot path for forensics/rescue)
RUN mkdir -p /opt/ipxe && \
    wget -q https://boot.ipxe.org/undionly.kpxe -O /opt/ipxe/undionly.kpxe && \
    wget -q https://github.com/ipxe/wimboot/releases/latest/download/wimboot -O /opt/ipxe/wimboot || true

# s6-overlay for multi-process supervision
ADD https://github.com/just-containers/s6-overlay/releases/download/v3.2.0.2/s6-overlay-noarch.tar.xz /tmp/
ADD https://github.com/just-containers/s6-overlay/releases/download/v3.2.0.2/s6-overlay-x86_64.tar.xz /tmp/
RUN tar -C / -Jxf /tmp/s6-overlay-noarch.tar.xz && \
    tar -C / -Jxf /tmp/s6-overlay-x86_64.tar.xz && \
    rm /tmp/s6-overlay-*.tar.xz

RUN mkdir -p /etc/pxe-templates /etc/pxe-generated \
    /generated/tftp /generated/winpe /generated/win11 \
    /var/log/nginx /var/run/samba

COPY templates/ /etc/pxe-templates/
COPY scripts/ /opt/scripts/
COPY s6/ /etc/s6-overlay/s6-rc.d/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /opt/scripts/*.sh 2>/dev/null || true
RUN chmod +x /etc/s6-overlay/s6-rc.d/*/run 2>/dev/null || true

ENTRYPOINT ["/entrypoint.sh"]
