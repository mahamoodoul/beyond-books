# Headless Blender with the "MCP for Blender" add-on listening on 0.0.0.0:9876 for the API's
# Claude + Blender generator. Private network only: the add-on runs any Python it is sent.
#
# Build args pin the Blender release and the add-on package; bump them together after testing.
FROM ubuntu:24.04

ARG BLENDER_VERSION=4.2.14
ARG BLENDER_SERIES=4.2
ARG MCP_FOR_BLENDER=2.2.7
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb xauth ca-certificates curl xz-utils python3 python3-venv \
      libxi6 libxxf86vm1 libxfixes3 libxrender1 libgl1 libegl1 libxkbcommon0 libsm6 libice6 libx11-6 \
    && rm -rf /var/lib/apt/lists/*

# Blender (official Linux build)
RUN curl -fsSL "https://download.blender.org/release/Blender${BLENDER_SERIES}/blender-${BLENDER_VERSION}-linux-x64.tar.xz" \
      | tar -xJ -C /opt \
    && ln -s "/opt/blender-${BLENDER_VERSION}-linux-x64/blender" /usr/local/bin/blender

# The add-on ships inside the mcp-for-blender Python package (blender_mcp/bundled/addon.py).
RUN python3 -m venv /tmp/venv && /tmp/venv/bin/pip install --no-cache-dir "mcp-for-blender==${MCP_FOR_BLENDER}" \
    && mkdir -p "/root/.config/blender/${BLENDER_SERIES}/scripts/addons" \
    && cp "$(/tmp/venv/bin/python -c 'import blender_mcp, pathlib; print(pathlib.Path(blender_mcp.__file__).parent / "bundled" / "addon.py")')" \
          "/root/.config/blender/${BLENDER_SERIES}/scripts/addons/blender_mcp.py" \
    && rm -rf /tmp/venv

COPY infrastructure/docker/blender-start.py /opt/blender-start.py
# /exports is the volume shared with the api/worker containers: the server writes the GLB there.
RUN mkdir -p /exports
VOLUME ["/exports"]
EXPOSE 9876
HEALTHCHECK --interval=15s --timeout=3s --start-period=40s --retries=5 \
  CMD python3 -c "import socket,sys; s=socket.socket(); s.settimeout(2); sys.exit(0 if s.connect_ex(('127.0.0.1', 9876))==0 else 1)"

# Not `blender -b`: the add-on serves requests from Blender's UI timer, which needs a window
# loop. xvfb provides a virtual display. --python runs the start script, then Blender keeps running.
CMD ["xvfb-run", "-a", "-s", "-screen 0 1280x720x24", "blender", "--factory-startup", "--python", "/opt/blender-start.py"]
