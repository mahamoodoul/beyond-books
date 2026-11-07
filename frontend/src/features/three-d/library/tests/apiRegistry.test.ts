import { describe, expect, it } from "vitest";

import type { AssetOut } from "@/api/generated/schema";

import { libraryModel } from "../runtime/apiRegistry";
import { proceduralCatalog } from "../runtime/procedural";
import { resolveScene } from "../runtime/sceneResolver";

const asset = {
  id: "a1",
  slug: "human_brain_4ef1b3",
  name: "The Human Brain",
  description: "AI-generated",
  latest_version: 1,
  review_status: "approved",
  provider: "blender",
  versions: [
    {
      version_number: 1,
      status: "ready",
      file_size_bytes: 1000,
      created_at: "2026-11-07T15:14:14Z",
      error_message: null,
      metadata_json: {
        node_names: ["frontal_lobe", "cerebellum"],
        parts: [
          { name: "frontal_lobe", label: "Frontal lobe", description: "Planning and decisions." },
          { name: "cerebellum", label: "Cerebellum", description: "" },
        ],
      },
    },
  ],
} as unknown as AssetOut;

describe("libraryModel", () => {
  const model = libraryModel(asset, "/files/signed-url");

  it("builds a scene of clickable parts with the AI's labels and explanations", () => {
    expect(model.scene.title).toBe("The Human Brain");
    expect(model.scene.components?.map((c) => c.label)).toEqual(["Frontal lobe", "Cerebellum"]);
    expect(Object.values(model.explanations)).toEqual(["Planning and decisions."]);
  });

  it("resolves only this asset's exact version, to the signed URL", () => {
    const ref = { asset_id: "human_brain_4ef1b3", version: 1 };
    expect(model.registry.resolve(ref)?.url).toBe("/files/signed-url");
    expect(model.registry.resolve({ ...ref, version: 2 })).toBeNull();
    expect(model.registry.resolve({ asset_id: "other", version: 1 })).toBeNull();
  });

  it("passes the viewer's scene resolver without errors", () => {
    const resolved = resolveScene(model.scene, model.registry, proceduralCatalog);
    expect(resolved.errors).toEqual([]);
    expect(resolved.components.map((c) => c.meshName)).toEqual(["frontal_lobe", "cerebellum"]);
  });
});
