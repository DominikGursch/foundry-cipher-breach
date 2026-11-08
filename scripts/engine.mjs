import { breachConfig } from "./mechanics.mjs";

export const SYMBOLS = Object.freeze(["0A", "1C", "2E", "3F", "4B", "5D"]);
export const HARD_SYMBOLS = Object.freeze([...SYMBOLS, "6A", "7C", "8E", "9F", "AB", "CD"]);
export const DEFAULT_CONFIG = Object.freeze({
  size: 5, buffer: 8, targetCount: 2, sequenceLength: 3, seconds: 60
});
const TERMINAL = new Set(["won", "timeout", "full-buffer", "jacked-out", "dead-end"]);

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function identifier(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

export function validateConfig(input) {
  record(input, "configuration");
  if (input.mode === "netrun") {
    integer(input.dv, 6, 20, "DV");
    integer(input.rank, 0, 10, "Interface rank");
    integer(input.targetCount, 1, 3, "Target count");
    const config = breachConfig({ ...input, balance: input.balance ?? 1 });
    if (config.balance === 3) {
      for (const key of ["effectiveDV", "repeatedFailures", "pressureConditions", "enemyRunners"]) {
        if (input[key] !== config[key]) throw new Error(`Inconsistent ${key}.`);
      }
    }
    for (const key of ["size", "buffer", "seconds"]) {
      if (input[key] !== config[key]) throw new Error(`Inconsistent ${key}.`);
    }
    if (!Array.isArray(input.sequenceLengths) ||
        input.sequenceLengths.length !== config.targetCount ||
        Array.from(input.sequenceLengths).some((length, index) => length !== config.sequenceLengths[index])) {
      throw new Error("Inconsistent sequence lengths.");
    }
    return config;
  }
  if (input.mode !== undefined) throw new Error("Unsupported configuration mode.");
  const config = {
    size: integer(input.size, 4, 8, "Matrix size"),
    buffer: integer(input.buffer, 4, 14, "Buffer"),
    targetCount: integer(input.targetCount, 1, 3, "Target count"),
    sequenceLength: integer(input.sequenceLength, 2, 4, "Sequence length"),
    seconds: integer(input.seconds, 15, 300, "Time limit")
  };
  if (config.targetCount * config.sequenceLength > config.buffer) {
    throw new Error("Buffer must hold all target sequences (count times length).");
  }
  return config;
}

export function validateChallenge(input) {
  record(input, "challenge");
  if (![1, 2].includes(input.schema)) throw new Error("Unsupported challenge schema.");
  const config = validateConfig(input.config);
  const symbols = config.mode === "netrun" && (config.effectiveDV ?? config.dv) >= 16 ? HARD_SYMBOLS : SYMBOLS;
  if ((input.schema === 2) !== (config.mode === "netrun")) throw new Error("Challenge schema/config mismatch.");
  if (!Array.isArray(input.matrix) || input.matrix.length !== config.size) {
    throw new Error("Invalid matrix.");
  }
  const matrix = Array.from(input.matrix, row => {
    if (!Array.isArray(row) || row.length !== config.size ||
        Array.from(row).some(symbol => !symbols.includes(symbol))) throw new Error("Invalid matrix row.");
    return [...row];
  });
  if (!Array.isArray(input.targets) || input.targets.length !== config.targetCount) {
    throw new Error("Invalid targets.");
  }
  const targets = Array.from(input.targets, (sequence, index) => {
    if (!Array.isArray(sequence) || sequence.length !== (config.sequenceLengths?.[index] ?? config.sequenceLength) ||
        Array.from(sequence).some(symbol => !symbols.includes(symbol))) throw new Error("Invalid target.");
    return [...sequence];
  });
  const normalized = {
    schema: input.schema,
    id: identifier(input.id, "challenge ID"),
    participantId: input.participantId === null ? null : identifier(input.participantId, "participant ID"),
    config, matrix, targets
  };
  if (input.schema === 2) {
    if (!Array.isArray(input.names) || input.names.length !== config.targetCount ||
        Array.from(input.names).some(name => typeof name !== "string" || !name.trim() || name.length > 120)) {
      throw new Error("Invalid objective names.");
    }
    normalized.names = input.names.map(name => name.trim());
  }
  return normalized;
}

function randomIndex(length, rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("RNG must return [0, 1).");
  return Math.floor(value * length);
}

function shuffle(values, rng) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, rng);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function legalCells(size, moves) {
  const visited = new Set(moves.map(move => `${move.row}:${move.col}`));
  const last = moves.at(-1);
  const cells = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const allowed = !last ? row === 0 : moves.length % 2 === 1 ? col === last.col : row === last.row;
      if (allowed && !visited.has(`${row}:${col}`)) cells.push({ row, col });
    }
  }
  return cells;
}

function witness(size, length, rng, start = null, excludedColumns = new Set()) {
  const path = start ? [{ ...start }] : [];
  function extend() {
    if (path.length === length) return true;
    for (const cell of shuffle(legalCells(size, path), rng)) {
      if (excludedColumns.has(cell.col)) continue;
      path.push(cell);
      if (extend()) return true;
      path.pop();
    }
    return false;
  }
  if (!extend()) throw new Error("Could not construct a legal puzzle path.");
  return path;
}

function lowInterfaceRoutes(config, rng) {
  const columns = shuffle(Array.from({ length: config.size }, (_, col) => col), rng);
  const rows = shuffle(Array.from({ length: config.size - 1 }, (_, row) => row + 1), rng);
  const codes = shuffle(HARD_SYMBOLS, rng);
  const targets = Array.from({ length: config.targetCount }, (_, index) => codes.slice(index * 4, index * 4 + 4));
  const noise = HARD_SYMBOLS.filter(code => !targets.some(sequence => sequence.slice(1).includes(code)));
  const matrix = Array.from({ length: config.size }, () =>
    Array.from({ length: config.size }, () => noise[randomIndex(noise.length, rng)]));
  const starts = columns.slice(0, config.targetCount);
  const available = columns.slice(config.targetCount);
  const trapCount = config.targetCount === 1 ? ((config.effectiveDV ?? config.dv) >= 20 ? 5 : 4) : Math.floor(available.length / config.targetCount);
  const solutions = [], decoys = [], decoyPaths = [];
  targets.forEach((sequence, index) => {
    const start = starts[index];
    const exit = columns[(index + 1) % config.size];
    const realRow = rows[index], trapRow = rows[config.targetCount + index], exitRow = rows.at(-1);
    const path = [{ row: 0, col: start }, { row: realRow, col: start },
      { row: realRow, col: exit }, { row: exitRow, col: exit }];
    path.forEach(({ row, col }, step) => { matrix[row][col] = sequence[step]; });
    solutions.push(path);
    const traps = available.slice(index * trapCount, (index + 1) * trapCount);
    const falseExits = columns.filter(col => col !== exit && !traps.includes(col));
    traps.forEach(col => {
      matrix[0][col] = sequence[0];
      matrix[trapRow][col] = sequence[1];
      falseExits.forEach(falseExit => {
        matrix[trapRow][falseExit] = sequence[2];
        decoyPaths.push([{ row: 0, col }, { row: trapRow, col }, { row: trapRow, col: falseExit }]);
      });
    });
    decoys.push({ row: 0, col: traps[0] });
  });
  return { matrix, targets, solutions, decoys, decoyPaths };
}

function distinctTargets(matrix, solution, lengths, symbols) {
  const targets = [], protectedCells = new Set(), paths = [];
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let offset = 0;
  const key = cell => `${cell.row}:${cell.col}`;
  const codes = path => path.map(({ row, col }) => matrix[row][col]);
  const unique = sequence => !targets.some(target =>
    target.length === sequence.length && target.every((code, index) => code === sequence[index]));
  function adjust(path) {
    const sequence = codes(path);
    if (unique(sequence)) return true;
    for (let index = 0; index < path.length; index++) {
      const { row, col } = path[index];
      if (protectedCells.has(key(path[index]))) continue;
      const previous = matrix[row][col];
      for (const symbol of symbols) {
        sequence[index] = symbol;
        if (unique(sequence)) {
          matrix[row][col] = symbol;
          return true;
        }
      }
      sequence[index] = previous;
    }
    return false;
  }
  function alternate(length, path = []) {
    if (path.length === length) return adjust(path) ? [...path] : null;
    for (const cell of legalCells(matrix.length, path)) {
      path.push(cell);
      const found = alternate(length, path);
      if (found) return found;
      path.pop();
    }
    return null;
  }
  lengths.forEach((length, index) => {
    const start = total <= solution.length ? offset :
      Math.round(index * (solution.length - length) / Math.max(1, lengths.length - 1));
    offset += length;
    let path = solution.slice(start, start + length);
    let witnessPath = solution;
    if (!adjust(path)) {
      path = null;
      for (let candidate = 0; candidate <= solution.length - length; candidate++) {
        const segment = solution.slice(candidate, candidate + length);
        if (adjust(segment)) {
          path = segment;
          break;
        }
      }
      if (!path) {
        path = alternate(length);
        if (!path) throw new Error("Could not construct distinct solvable objectives.");
        witnessPath = path;
      }
    }
    targets.push(codes(path));
    path.forEach(cell => protectedCells.add(key(cell)));
    paths.push(witnessPath);
  });
  return { targets, solutions: paths };
}

export function generateChallenge(configInput = DEFAULT_CONFIG, {
  rng = Math.random, id = "local", participantId = null, names
} = {}) {
  const config = validateConfig(configInput);
  const effectiveDV = config.effectiveDV ?? config.dv;
  const hard = config.mode === "netrun" && effectiveDV >= 16;
  const symbols = hard ? HARD_SYMBOLS : SYMBOLS;
  let matrix = Array.from({ length: config.size }, () =>
    Array.from({ length: config.size }, () => symbols[randomIndex(symbols.length, rng)]));
  const lengths = config.sequenceLengths ?? Array(config.targetCount).fill(config.sequenceLength);
  let solution, targets, solutions, decoys, decoyPaths;
  if (hard && config.rank === 0 &&
      ((config.balance === 2 && effectiveDV >= 18) || (config.balance === 3 && effectiveDV >= 17))) {
    ({ matrix, targets, solutions, decoys, decoyPaths } = lowInterfaceRoutes(config, rng));
    solution = solutions[0];
  } else if (hard) {
    const columns = shuffle(Array.from({ length: config.size }, (_, col) => col), rng);
    const starts = columns.slice(0, config.targetCount);
    const traps = columns.slice(config.targetCount, config.targetCount * 2);
    const firstCodes = shuffle(symbols, rng).slice(0, config.targetCount);
    starts.forEach((col, index) => { matrix[0][col] = firstCodes[index]; });
    // Reserve decoy columns before building routes so planting traps never breaks a witness.
    solutions = lengths.map((length, index) =>
      witness(config.size, length, rng, { row: 0, col: starts[index] }, new Set(traps)));
    targets = solutions.map(path => path.map(({ row, col }) => matrix[row][col]));
    const secondCodes = new Set(targets.map(sequence => sequence[1]));
    const noise = symbols.filter(code => !secondCodes.has(code));
    decoys = traps.map((col, index) => {
      matrix[0][col] = firstCodes[index];
      for (let row = 1; row < config.size; row++) matrix[row][col] = noise[randomIndex(noise.length, rng)];
      return { row: 0, col };
    });
    solution = solutions[0];
  } else {
    // Lower DVs retain the reference's jointly solvable, overlapping witness.
    solution = witness(config.size, config.buffer, rng);
    ({ targets, solutions } = distinctTargets(matrix, solution, lengths, symbols));
  }
  const challenge = validateChallenge({
    schema: config.mode === "netrun" ? 2 : 1, id, participantId, config, matrix, targets,
    names: names ?? lengths.map((_, index) => `Objective ${index + 1}`)
  });
  return { challenge, solution, solutions, ...(hard ? { decoys } : {}), ...(decoyPaths ? { decoyPaths } : {}) };
}

export function validateResult(input, challengeInput) {
  const challenge = validateChallenge(challengeInput);
  record(input, "result");
  if (![1, 2].includes(input.schema) || input.challengeId !== challenge.id || !TERMINAL.has(input.outcome)) {
    throw new Error("Invalid result identity or outcome.");
  }
  if (!Array.isArray(input.moves) || input.moves.length > challenge.config.buffer) {
    throw new Error("Invalid move count.");
  }
  const moves = Array.from(input.moves, move => {
    record(move, "move");
    return {
      row: integer(move.row, 0, challenge.config.size - 1, "Row"),
      col: integer(move.col, 0, challenge.config.size - 1, "Column")
    };
  });
  const elapsedMs = integer(input.elapsedMs, 0, challenge.config.seconds * 1000, "Elapsed time");
  return { schema: input.schema, challengeId: challenge.id, moves, elapsedMs, outcome: input.outcome };
}

export class Puzzle {
  constructor(challenge, { now = () => performance.now(), startOnOpen = true } = {}) {
    this.challenge = validateChallenge(challenge);
    this.now = now;
    this.moves = [];
    this.matched = this.challenge.targets.map(() => false);
    this.status = "ready";
    this.startedAt = null;
    this.finishedElapsed = null;
    this.lastTime = null;
    this.resultSchema = startOnOpen ? 2 : 1;
    if (startOnOpen) this.start();
  }

  start() {
    if (this.startedAt !== null) return;
    const time = this.now();
    if (!Number.isFinite(time)) throw new Error("Invalid clock.");
    this.startedAt = this.lastTime = time;
    this.status = "running";
  }

  elapsed() {
    if (this.finishedElapsed !== null) return this.finishedElapsed;
    if (this.startedAt === null) return 0;
    const time = this.now();
    if (!Number.isFinite(time) || time < this.lastTime) throw new Error("Invalid monotonic clock.");
    this.lastTime = time;
    return Math.min(Math.floor(time - this.startedAt), this.challenge.config.seconds * 1000);
  }

  finish(status, elapsed = this.elapsed()) {
    this.finishedElapsed = elapsed;
    this.status = status;
  }

  tick() {
    const elapsed = this.elapsed();
    if (this.status === "running" && elapsed >= this.challenge.config.seconds * 1000) {
      this.finish("timeout", elapsed);
    }
    return this.status;
  }

  select(row, col) {
    const elapsed = this.elapsed();
    if (this.status === "running" && elapsed >= this.challenge.config.seconds * 1000) {
      this.finish("timeout", elapsed);
    }
    if (TERMINAL.has(this.status)) throw new Error("Puzzle has ended.");
    integer(row, 0, this.challenge.config.size - 1, "Row");
    integer(col, 0, this.challenge.config.size - 1, "Column");
    if (!legalCells(this.challenge.config.size, this.moves).some(cell => cell.row === row && cell.col === col)) {
      throw new Error("Choose an unused cell on the active row or column.");
    }
    this.start();
    this.moves.push({ row, col });
    const codes = this.moves.map(cell => this.challenge.matrix[cell.row][cell.col]);
    this.matched = this.challenge.targets.map(sequence =>
      codes.some((_, index) => sequence.every((symbol, offset) => codes[index + offset] === symbol)));
    if (this.matched.every(Boolean)) this.finish("won", elapsed);
    else if (this.moves.length === this.challenge.config.buffer) this.finish("full-buffer", elapsed);
    else if (!legalCells(this.challenge.config.size, this.moves).length) this.finish("dead-end", elapsed);
    return this.status;
  }

  jackOut() {
    const elapsed = this.elapsed();
    if (!TERMINAL.has(this.status)) {
      this.finish(this.status === "running" && elapsed >= this.challenge.config.seconds * 1000 ? "timeout" : "jacked-out", elapsed);
    }
    return this.status;
  }

  result() {
    this.tick();
    if (!TERMINAL.has(this.status)) throw new Error("Puzzle has not ended.");
    return {
      schema: this.resultSchema,
      challengeId: this.challenge.id,
      moves: this.moves.map(cell => ({ ...cell })),
      elapsedMs: this.elapsed(),
      outcome: this.status
    };
  }
}

// This validates logical consistency, never proves a remote player's elapsed time or honesty.
export function replayResult(challengeInput, resultInput) {
  const challenge = validateChallenge(challengeInput);
  const result = validateResult(resultInput, challenge);
  let time = 0;
  // Retained schema-1 reports measured from the first move; new reports start on open.
  const puzzle = new Puzzle(challenge, { now: () => time, startOnOpen: result.schema === 2 });
  for (const cell of result.moves) puzzle.select(cell.row, cell.col);
  if (result.outcome === "timeout") {
    if ((result.schema === 1 && !result.moves.length) || result.elapsedMs !== challenge.config.seconds * 1000) {
      throw new Error("Timeout requires a started timer at its limit.");
    }
    time = result.elapsedMs;
    puzzle.tick();
  } else {
    if (result.elapsedMs >= challenge.config.seconds * 1000 ||
        (result.schema === 1 && !result.moves.length && result.elapsedMs !== 0)) throw new Error("Inconsistent elapsed time.");
    if (result.outcome === "jacked-out") puzzle.jackOut();
  }
  if (puzzle.status !== result.outcome) throw new Error("Outcome does not match legal move history.");
  return { ...result, matched: [...puzzle.matched], timingVerified: false };
}
