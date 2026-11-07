# demo-assets

Schematic GLB assets for building and testing the Phase 4 viewer, scene resolver and animation
runtime before reviewed models exist. **Development and demo only. Not reviewed content.**

| Path | What |
|---|---|
| `glb/<asset_id>.glb` | glTF 2.0 binary, one named node per selectable component (node name = scene `mesh_name`) |
| `metadata/<asset_id>.json` | Asset-registry record (design §7.4): hash, size, components, paths, license, review status |
| `previews/<asset_id>.png` | Thumbnail rendered from the GLB by the validator |

Scenes and animations that use these assets live in `../three-d-contracts/fixtures/`.

Rebuild and validate everything (needs `numpy` and `matplotlib`):

```bash
./scripts/check_demo_assets.sh
```

`backend/tests/test_demo_assets.py` checks in CI, without numpy, that the GLBs, metadata and
fixtures agree. The full process for real assets is in
[docs/3d-asset-workflow.md](../../docs/3d-asset-workflow.md).
