# Campus building models (optional)

Place real **glTF / GLB** files here when they exist, for example:

```text
apps/web/public/models/buildings/<building-uuid>.glb
```

Then register the public URL in:

```text
apps/web/src/features/digitalTwin/models/buildingModels.ts
```

```ts
export const BUILDING_MODEL_URLS: Record<string, string> = {
  '<building-uuid>': '/models/buildings/<building-uuid>.glb',
};
```

Until a URL is registered, the Digital Twin uses the geometry hierarchy in
`features/digitalTwin/adapters/buildingAdapter.ts`:

1. Surveyed footprint (`BUILDING_FOOTPRINTS` in `buildingGeometry.ts`)
2. Measured width/depth (`BUILDING_DIMENSIONS`)
3. Fallback **28×22 m** extruded box from the building center

**Entrances, POIs, parking polygons, green-area polygons, and campus boundary**
are also registered in `buildingGeometry.ts` when real rings exist. Do not add
placeholder coordinates.

**3D Tiles:** not wired yet. A future tileset would be added as a Cesium3DTileset on the viewer, keyed by campus region — do not drop unpaid Ion tilesets into production without review.

Do not commit placeholder/fake campus models.
