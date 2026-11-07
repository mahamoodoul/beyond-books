#!/usr/bin/env sh
# Rebuild demo GLBs + metadata, then validate them against fixtures and regenerate previews.
set -e
cd "$(dirname "$0")/.."
PY=${PY:-backend/.venv/bin/python}
[ -x "$PY" ] || PY=python3
F=packages/three-d-contracts/fixtures
M=packages/demo-assets/metadata
P=packages/demo-assets/previews
"$PY" scripts/build_demo_assets.py
"$PY" scripts/validate_asset.py $M/human_heart_v1.json \
  --scene $F/scene_heart_01.json --scene $F/scene_heart_02.json \
  --animation $F/animation_blood_flow_01.json --animation $F/animation_double_circulation_01.json \
  --preview $P/human_heart_v1.png
"$PY" scripts/validate_asset.py $M/plant_cell_v1.json \
  --scene $F/scene_plant_cell_01.json --animation $F/animation_plant_cell_tour_01.json \
  --preview $P/plant_cell_v1.png
"$PY" scripts/validate_asset.py $M/water_molecule_v1.json \
  --scene $F/scene_water_molecule_01.json --animation $F/animation_water_shape_01.json \
  --preview $P/water_molecule_v1.png
