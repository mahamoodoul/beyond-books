"""Blender start script for the container: enable the MCP add-on, bind it to all interfaces
(the API connects from another container), start its server, keep Blender alive.

Honours BLENDER_MCP_PORT (default 9876)."""

import os

import addon_utils
import bpy

PORT = int(os.environ.get("BLENDER_MCP_PORT", "9876"))

# Enable the add-on (installed as blender_mcp.py in the user add-ons folder by the Dockerfile).
addon_utils.enable("blender_mcp", default_set=True, persistent=True)
bpy.ops.wm.save_userpref()

# Preferences: bind to every interface inside the container (never published outside the
# Docker network), fixed port, and start the server automatically for every scene.
prefs = bpy.context.preferences.addons.get("blender_mcp")
if prefs is not None and hasattr(prefs.preferences, "bind_address"):
    prefs.preferences.bind_address = "0.0.0.0"
    # The add-on refuses non-loopback binds without this. Port 9876 stays on the private Docker
    # network (docker-compose.aws.yml never publishes it).
    prefs.preferences.allow_remote_connections = True
for scene in bpy.data.scenes:
    scene.blendermcp_port = PORT
    scene.blendermcp_auto_start_server = True

# Start the server now; the add-on's auto-start also fires on load. Blender's event loop keeps
# serving. Prints go to the container log; the Docker health check is what proves the port is open.
try:
    bpy.ops.blendermcp.start_server()
    print(f"[blender-start] MCP for Blender starting on 0.0.0.0:{PORT}", flush=True)
except Exception as exc:  # the auto-start timer will retry
    print(f"[blender-start] start_server failed ({exc}); relying on auto-start", flush=True)
