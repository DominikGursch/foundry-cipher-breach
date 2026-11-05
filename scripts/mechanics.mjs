export const DV_PRESETS = Object.freeze({
  6: Object.freeze({ size: 5, lengths: Object.freeze([2, 3]) }),
  8: Object.freeze({ size: 5, lengths: Object.freeze([2, 3, 3]) }),
  10: Object.freeze({ size: 6, lengths: Object.freeze([3, 3, 4]) }),
  12: Object.freeze({ size: 6, lengths: Object.freeze([3, 4, 4]) }),
  14: Object.freeze({ size: 7, lengths: Object.freeze([4, 4, 5]) })
});

export function breachConfig({ dv = 8, rank = 4, targetCount = DV_PRESETS[dv]?.lengths.length } = {}) {
  if (!Object.hasOwn(DV_PRESETS, dv) || !Number.isInteger(dv)) throw new Error("Unsupported DV.");
  if (!Number.isInteger(rank) || rank < 0 || rank > 10) throw new Error("Interface rank must be 0-10.");
  if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > DV_PRESETS[dv].lengths.length) {
    throw new Error("Target count exceeds the DV preset.");
  }
  const buffer = 4 + Math.ceil(rank / 2);
  return {
    mode: "netrun", dv, rank, size: DV_PRESETS[dv].size, buffer, targetCount,
    sequenceLengths: DV_PRESETS[dv].lengths.slice(0, targetCount).map(length => Math.min(length, buffer)),
    seconds: Math.max(15, 25 + 4 * rank - (dv - 6))
  };
}

// Cyberpunk RED stores Interface on the embedded Netrunner role, not actor attributes.
export function interfaceRank(actor) {
  if (!actor) return null;
  const roles = Array.from(actor.items ?? []).filter(item => item.type === "role");
  const role = roles.find(item =>
    /netrunner|netr[uü]nner|нетраннер/i.test(item.name ?? "") ||
    /interface|интерфейс/i.test(String(item.system?.mainRoleAbility ?? "")));
  if (!role || role.system?.rank === null || role.system?.rank === undefined || role.system.rank === "") return null;
  if (!["number", "string"].includes(typeof role.system.rank)) throw new Error("Invalid character Interface rank.");
  const rank = Number(role.system.rank);
  if (!Number.isInteger(rank) || rank < 0 || rank > 10) throw new Error("Invalid character Interface rank.");
  return rank;
}
