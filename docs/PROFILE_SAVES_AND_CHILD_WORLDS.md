# Profile saves, AI bindings and child worlds

This is the substrate for a future adjustable MorphTile front interface. It deliberately does **not** make the front interface itself canonical.

## Profiles are outside worlds

A profile is a host-level workspace for a human, Walmi, another AI, or another local user. It may contain categories, named world slots, save slots for those worlds, and connections to local or platform AI instances.

Several profiles may point at the same opaque `world_ref`. Linking a world from one profile to another copies only that reference, not the world memory.

## Save is save

MorphTile does not prescribe checkpoint structure. Save payloads are opaque JSON. A slot may hold a simple checkpoint, RPG progression, editor state, simulation state or another application-defined object.

A world chooses its contract:

- `{mode:"none"}` — no profile saves;
- `{mode:"profile", ai_bridge:false}` — profile saves only;
- `{mode:"profile", ai_bridge:true}` — profile saves may also be bridged by reference to a connected AI instance.

The policy is world matter. The actual profile, save slot and payload never are. Old worlds may omit a policy; a save attempt then HOLDs instead of silently choosing on behalf of the creator.

## AI connections

A profile may connect any number of AI instances. v0.1 distinguishes only `local` and `platform`; the `ref` is opaque. Tokens, passwords and provider credentials are out of scope.

An AI save bridge points at the existing profile save record. It does not clone the payload into a second hidden store and never writes it into the world.

## Child worlds are references, not embedded multiverses

A parent world may carry a `child_worlds` descriptor map. Each descriptor contains an opaque `world_ref`, optional label, and optional `via {tile, action}` route.

The only v0.1 activation mode is `lazy`. Parent matter does not contain the child bytes. A runtime session has one `active_world_ref`; entering a child tells the host which one reference to load and puts the parent reference on a return stack.

A loaded child is a normal world and can define its own children. Therefore house → cellar → dungeon → another world can continue without a special depth limit in this contract. Only the path the user actually enters must be activated.

## What is still separate

- The adjustable front profile UI is not implemented here.
- File/database I/O is host responsibility; the store itself is deterministic and zero-I/O.
- No cross-device sync, network authority or credential handling is claimed.
- No child is automatically trusted merely because a parent references it; a host may still hash-verify/load it using its normal world import path.
