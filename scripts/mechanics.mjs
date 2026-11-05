export const DV_PRESETS = Object.freeze({
  6: Object.freeze({ size: 5, lengths: Object.freeze([2, 3]) }),
  8: Object.freeze({ size: 5, lengths: Object.freeze([2, 3, 3]) }),
  10: Object.freeze({ size: 6, lengths: Object.freeze([3, 3, 4]) }),
  12: Object.freeze({ size: 6, lengths: Object.freeze([3, 4, 4]) }),
  14: Object.freeze({ size: 7, lengths: Object.freeze([4, 4, 5]) }),
  16: Object.freeze({ size: 7, lengths: Object.freeze([4, 5, 5]) }),
  18: Object.freeze({ size: 8, lengths: Object.freeze([5, 5, 6]) }),
  20: Object.freeze({ size: 8, lengths: Object.freeze([5, 6, 6]) })
});

export const DIFFICULTIES = Object.freeze({
  6: "simple", 8: "everyday", 10: "difficult", 12: "professional",
  14: "heroic", 16: "advanced", 18: "incredible", 20: "exceptional"
});

export function difficultyPreset(dv) {
  if (!Number.isInteger(dv) || dv < 6 || dv > 80) throw new Error("Effective DV must be an integer from 6 to 80.");
  if (dv <= 6) return DV_PRESETS[6];
  if (dv <= 8) return DV_PRESETS[8];
  if (dv <= 10) return DV_PRESETS[10];
  if (dv <= 12) return DV_PRESETS[12];
  if (dv <= 14) return DV_PRESETS[14];
  if (dv <= 16) return DV_PRESETS[16];
  if (dv <= 19) return DV_PRESETS[18];
  return DV_PRESETS[20];
}

export function breachConfig({
  dv = 8, rank = 4, targetCount, balance = 3,
  repeatedFailures = 0, pressureConditions = 0, enemyRunners = 0
} = {}) {
  if (![1, 2, 3].includes(balance)) throw new Error("Unsupported balance version.");
  if (balance === 3) {
    if (!Number.isInteger(dv) || !Object.hasOwn(DV_PRESETS, dv)) throw new Error("Base DV must be an even integer from 6 to 20.");
    for (const count of [repeatedFailures, pressureConditions, enemyRunners]) {
      if (!Number.isInteger(count) || count < 0 || count > 10) throw new Error("Modifier counts must be integers from 0 to 10.");
    }
    if (!Number.isInteger(rank) || rank < 0 || rank > 10) throw new Error("Interface rank must be 0-10.");
    const effectiveDV = dv + repeatedFailures + 2 * pressureConditions + 3 * enemyRunners;
    const preset = difficultyPreset(effectiveDV);
    if (targetCount === undefined) targetCount = preset.lengths.length;
    if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > preset.lengths.length) {
      throw new Error("Target count exceeds the DV preset.");
    }
    const buffer = 4 + Math.ceil(rank / 2);
    const baseSeconds = Math.max(15, 25 + 4 * rank - (effectiveDV - 6));
    const overload = Math.max(0, effectiveDV - rank - 12);
    const timeBudget = (baseSeconds / (1 + overload / 3) + 20 * Math.max(0, 7 - effectiveDV)) /
      (1 + enemyRunners * 0.2);
    return {
      mode: "netrun", balance, dv, effectiveDV, rank, repeatedFailures, pressureConditions, enemyRunners,
      size: preset.size, buffer, targetCount,
      sequenceLengths: preset.lengths.slice(0, targetCount).map(length => Math.min(length, buffer)),
      seconds: Math.max(3, Math.round(timeBudget * 10) / 10)
    };
  }
  if (!Object.hasOwn(DV_PRESETS, dv) || !Number.isInteger(dv)) throw new Error("Unsupported DV.");
  if (!Number.isInteger(rank) || rank < 0 || rank > 10) throw new Error("Interface rank must be 0-10.");
  if (targetCount === undefined) targetCount = DV_PRESETS[dv].lengths.length;
  if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > DV_PRESETS[dv].lengths.length) {
    throw new Error("Target count exceeds the DV preset.");
  }
  if (repeatedFailures || pressureConditions || enemyRunners) throw new Error("Modifiers require balance version 3.");
  const buffer = 4 + Math.ceil(rank / 2);
  const referenceSeconds = Math.max(15, 25 + 4 * rank - (dv - 6));
  const pressure = balance === 2 && dv >= 16 ? (dv - 14) * Math.max(0, 4 - rank) / 2 : 0;
  return {
    mode: "netrun", dv, rank, size: DV_PRESETS[dv].size, buffer, targetCount,
    sequenceLengths: DV_PRESETS[dv].lengths.slice(0, targetCount).map(length => Math.min(length, buffer)),
    seconds: Math.max(6, Math.floor(referenceSeconds - pressure)),
    ...(balance === 2 ? { balance } : {})
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
