# Lego Library and Remix Bench

MorphTile already has portable worlds, kits and words. This layer does not replace those formats. It gives them one content-addressed library envelope and adds reusable **part-level Lego**.

## Two ways to grow

**Creation** invents a new atom or product. That remains the job of creation machines/humans.

**Remix** reuses atoms already in the library. Swapping a skin, behavior, capability, view or whole body onto another tile is recorded as a remix with `created_new_atoms: 0`.

A later UI can therefore have a small **Remix Bench** separate from creation.

## Permanence: world first, Vault second

A candidate is temporary only until it is committed.

Once a remix, adjustment or experimental block is committed into a world, it is already permanent MorphTile matter in that world. It does **not** need to be saved into the Vault in order to become real or persistent.

The **Lego Vault** has a different job: reuse beyond the current world.

- **World** — owns the exact Lego currently used there, including locally adjusted or experimental combinations.
- **Vault** — indexes reusable Lego so another place, profile, world or future build can find it again.
- **Vault atoms** — separated reusable pieces such as form/mesh, skin/material, behavior, logic, capability, interface and parameters.
- **Vault finished Lego** — portable kits/products assembled from those pieces.
- **Future blueprints** — reusable build/world arrangements that point at Lego and describe how pieces/worlds are assembled, rather than requiring every use to be rebuilt manually.

Saving something from a world into the Vault is therefore **promotion for reuse**, not the act that makes it permanent.

Nothing is Vaulted automatically — including self-created worlds. A self-created world can instead be **scanned as a source**. The Vault/worktable may show:

- Lego found in this world;
- which objects are already in the Vault by content hash;
- which objects are genuinely new to this Vault;
- dependencies a selected piece needs in order to survive outside the world.

The user then chooses **Pull to Vault** for the pieces or finished Lego worth keeping. Pulling a piece also pulls its referenced definitions/words when needed, so the selected Lego does not become an orphaned pointer back into a world that may later be deleted.

That gives a safe cleanup flow:

`build/experiment in world → scan world → select useful Lego → pull to Vault → verify dependency closure → delete finished source world if desired`

The source world does not need to remain as hidden storage for Vaulted Lego. If nothing from it is worth reusing, delete the world without polluting the Vault. If only three pieces are useful, Vault those three rather than atomizing the entire world.

A useful experimental flow is therefore:

`candidate scratch → adjust/drop/test → commit into world → later scan/pull only reusable discoveries`

If the result stays only in that world, that is valid. If it is promoted, content addressing and dedup decide whether the Vault gained a genuinely new object or merely another reference/name/provenance record for something it already had.

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
