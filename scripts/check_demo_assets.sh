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
"$PY" scripts/validate_asset.py $M/plant_cell_v2.json \
  --scene $F/scene_plant_cell_02.json --animation $F/animation_plant_cell_tour_01.json \
  --preview $P/plant_cell_v2.png
"$PY" scripts/validate_asset.py $M/plant_cell_v3.json \
  --scene $F/scene_plant_cell_03.json --animation $F/animation_plant_cell_tour_01.json \
  --preview $P/plant_cell_v3.png
"$PY" scripts/validate_asset.py $M/water_molecule_v1.json \
  --scene $F/scene_water_molecule_01.json --animation $F/animation_water_shape_01.json \
  --preview $P/water_molecule_v1.png
"$PY" scripts/validate_asset.py $M/human_heart_v2.json \
  --scene $F/scene_heart_03.json --animation $F/animation_heart_tour_01.json \
  --preview $P/human_heart_v2.png
"$PY" scripts/validate_asset.py $M/human_lungs_v1.json \
  --scene $F/scene_lungs_01.json --animation $F/animation_lungs_tour_01.json \
  --preview $P/human_lungs_v1.png
"$PY" scripts/validate_asset.py $M/human_brain_v1.json \
  --scene $F/scene_brain_01.json --animation $F/animation_brain_tour_01.json \
  --preview $P/human_brain_v1.png
"$PY" scripts/validate_asset.py $M/human_body_v1.json \
  --scene $F/scene_body_01.json --animation $F/animation_body_tour_01.json \
  --preview $P/human_body_v1.png
"$PY" scripts/validate_asset.py $M/dna_replication_v1.json \
  --scene $F/scene_dna_replication_01.json \
  --animation $F/animation_dna_fork_in_action_01.json \
  --preview $P/dna_replication_v1.png
"$PY" scripts/validate_asset.py $M/car_engine_v1.json \
  --scene $F/scene_car_engine_01.json --animation $F/animation_engine_four_stroke_01.json \
  --preview $P/car_engine_v1.png
for pair in human_anatomy_systems_v1:scene_human_anatomy_01 dna_double_helix_v1:scene_dna_double_helix_01 \
  i4_dohc_engine_exploded_v1:scene_i4_engine_01 atp_synthase_v1:scene_atp_synthase_01 \
  cell_membrane_transport_v1:scene_cell_membrane_01 rutherford_gold_foil_v1:scene_rutherford_gold_foil_01 \
  neutralization_heat_v1:scene_neutralization_heat_01; do
  "$PY" scripts/validate_asset.py "$M/${pair%%:*}.json" --scene "$F/${pair##*:}.json"
done
