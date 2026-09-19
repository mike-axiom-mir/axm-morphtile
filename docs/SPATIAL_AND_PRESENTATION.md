# Spatial roots and presentation matter

MorphTile now has one guaranteed spatial contract and no guaranteed surroundings.

- `world.spatial_root` is the identity frame. Old worlds without the field resolve exactly as before.
- A root tile's `connect.place` and optional `connect.rotation` are local to the world root.
- An interior root is local to its containing shell; attached children resolve through sockets.
- `tileMatrix()` resolves the recursive frame without rewriting descendant coordinates.
- `importKit(..., {anchor:{position,rotation}})` changes only the arriving top-level tile frame and records that descendants were not rewritten.
- A moved and rotated shell expands by composing its frame into its roots, preserving their observed world placement.
- Definition bodies exclude both `connect.place` and `connect.rotation`, so every instance keeps its own frame.

Interface placement is separate from interface content:

```json
{
  "mode": "docked",
  "dock": "right",
  "preferred_size": [360, 480],
  "preferred_position": [0, 0],
  "user_adjustable": true
}
```

The descriptor is canonical tile matter. `resolvePresentation()` may layer session state over it only when the tile
allows adjustment. The session result is returned to the host and never mutates the world. `world` and `tile` modes
resolve against the same frames used by the game-asset renderer. Missing anchors and unsupported modes return typed
HOLD results.

Evidence: `test/spatial.js` and `test/presentation.js`.
