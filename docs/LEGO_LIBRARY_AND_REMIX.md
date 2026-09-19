# Lego Library and Remix Bench

MorphTile already has portable worlds, kits and words. This layer does not replace those formats. It gives them one content-addressed library envelope and adds reusable **part-level Lego**.

## Two ways to grow

**Creation** invents a new atom or product. That remains the job of creation machines/humans.

**Remix** reuses atoms already in the library. Swapping a skin, behavior, capability, view or whole body onto another tile is recorded as a remix with `created_new_atoms: 0`.

A later UI can therefore have a small **Remix Bench** separate from creation.

## Lego Pack

`morphtile-lego-pack/v0.1` can contain finished or partial Lego side-by-side:

- world;
- kit (finished portable tile/product with dependencies);
- raw tile;
- reusable body;
- any facet: mesh, material, behavior, logic, connect;
- capability;
- parameter;
- view;
- presentation;
- form hints;
- definition;
- word.

Every stored object is addressed by the hash of `{kind,data}`. Multiple item labels/provenance records may point at one object. Importing the same exact material from ten packs therefore stores one material object, not ten colour/name copies.

Pack hashes and every object hash are rechecked on import. Silent changes HOLD.

## Provenance and acquisition

Entries carry opaque provenance metadata. A caller may say a piece is self-created, downloaded, licensed, purchased, gifted, or anything else without MorphTile inventing a commerce/licensing policy.

Store/payment/download systems can wrap this library later. MorphTile itself only preserves the declared metadata and verifies the bytes/data it received.

## Remix Bench

The bench takes:

1. a target tile;
2. library item choices;
3. optional replacement slots.

It builds a disposable `tile.replace` candidate from existing objects. MorphTile's existing diff machinery then reduces that whole draft to the actual fine-grained merge units, validates the graph, and gives normal plan/receipt/rollback behavior.

Supported v0.1 slots are facets, capability, parameter, view, presentation, form hints and whole body. A raw tile may also donate its body.

Target identity, history and spatial placement remain the target's. The donor contributes reusable matter only.

No remix is automatically canon and no incompatible mix is silently repaired. It HOLDs for the normal candidate/graph rules.

## UI direction

A future small Library/Remix screen can expose:

- Import pack / export pack;
- Finished products;
- Forms;
- Skins/materials;
- Behaviors;
- Logic;
- Capabilities;
- Interfaces;
- Parameters;
- Definitions/words;
- "Use on…" / "Replace…" choices;
- preview → candidate → plan → commit.

That screen does not need a generative model to operate. It is deterministic recombination of already owned/available Lego.
