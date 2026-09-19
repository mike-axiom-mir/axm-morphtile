"use strict";

const clone = (v) => JSON.parse(JSON.stringify(v));

function createWorldSession(rootWorldRef) {
  if (typeof rootWorldRef !== "string" || !rootWorldRef) throw new Error("root world ref is required");
  return { kind: "morphtile-world-session", version: "0.1", root_world_ref: rootWorldRef, active_world_ref: rootWorldRef, stack: [] };
}
function enterChild(session, world, childId) {
  const child = ((world && world.child_worlds) || {})[childId];
  if (!child) return { ok: false, status: "HOLD_CHILD_WORLD_MISSING" };
  const next = clone(session);
  next.stack.push({ world_ref: session.active_world_ref, child_id: childId });
  next.active_world_ref = child.world_ref;
  return { ok: true, status: "READY", session: next, load_world_ref: child.world_ref, child: clone(child) };
}
function enterRoute(session, world, route) {
  route = route || {};
  const matches = Object.values((world && world.child_worlds) || {}).filter((child) => {
    const via = child.via || {};
    return via.tile === route.tile && (via.action || null) === (route.action || null);
  });
  if (!matches.length) return { ok: false, status: "HOLD_CHILD_ROUTE_MISSING" };
  if (matches.length > 1) return { ok: false, status: "HOLD_CHILD_ROUTE_AMBIGUOUS", matches: matches.map((x) => x.id).sort() };
  return enterChild(session, world, matches[0].id);
}
function leaveChild(session) {
  if (!session.stack.length) return { ok: false, status: "HOLD_AT_ROOT_WORLD" };
  const next = clone(session), prior = next.stack.pop();
  next.active_world_ref = prior.world_ref;
  return { ok: true, status: "READY", session: next, load_world_ref: prior.world_ref };
}

module.exports = { createWorldSession, enterChild, enterRoute, leaveChild };
