export const SYMBOLS = Object.freeze(["0A", "1C", "2E", "3F", "4B", "5D"]);
export const DEFAULT_CONFIG = Object.freeze({
  size: 5, buffer: 8, targetCount: 2, sequenceLength: 3, seconds: 60
});
const TERMINAL = new Set(["won", "timeout", "full-buffer", "jacked-out"]);

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
  if (input.schema !== 1) throw new Error("Unsupported challenge schema.");
  const config = validateConfig(input.config);
  if (!Array.isArray(input.matrix) || input.matrix.length !== config.size) {
    throw new Error("Invalid matrix.");
  }
  const matrix = Array.from(input.matrix, row => {
    if (!Array.isArray(row) || row.length !== config.size ||
        Array.from(row).some(symbol => !SYMBOLS.includes(symbol))) throw new Error("Invalid matrix row.");
    return [...row];
  });
  if (!Array.isArray(input.targets) || input.targets.length !== config.targetCount) {
    throw new Error("Invalid targets.");
  }
  const targets = Array.from(input.targets, sequence => {
    if (!Array.isArray(sequence) || sequence.length !== config.sequenceLength ||
        Array.from(sequence).some(symbol => !SYMBOLS.includes(symbol))) throw new Error("Invalid target.");
    return [...sequence];
  });
  return {
    schema: 1,
    id: identifier(input.id, "challenge ID"),
    participantId: input.participantId === null ? null : identifier(input.participantId, "participant ID"),
    config, matrix, targets
  };
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

export function generateChallenge(configInput = DEFAULT_CONFIG, {
  rng = Math.random, id = "local", participantId = null
} = {}) {
  const config = validateConfig(configInput);
  const matrix = Array.from({ length: config.size }, () =>
    Array.from({ length: config.size }, () => SYMBOLS[randomIndex(SYMBOLS.length, rng)]));
  // Plant every target along one legal witness; random targets can be impossible.
  const solution = [];
  function extend() {
    if (solution.length === config.buffer) return true;
    for (const cell of shuffle(legalCells(config.size, solution), rng)) {
      solution.push(cell);
      if (extend()) return true;
      solution.pop();
    }
    return false;
  }
  if (!extend()) throw new Error("Could not construct a legal puzzle path.");
  const codes = solution.map(({ row, col }) => matrix[row][col]);
  const targets = Array.from({ length: config.targetCount }, (_, index) =>
    codes.slice(index * config.sequenceLength, (index + 1) * config.sequenceLength));
  const challenge = validateChallenge({ schema: 1, id, participantId, config, matrix, targets });
  return { challenge, solution: solution.map(cell => ({ ...cell })) };
}

export function validateResult(input, challengeInput) {
  const challenge = validateChallenge(challengeInput);
  record(input, "result");
  if (input.schema !== 1 || input.challengeId !== challenge.id || !TERMINAL.has(input.outcome)) {
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
  return { schema: 1, challengeId: challenge.id, moves, elapsedMs, outcome: input.outcome };
}

export class Puzzle {
  constructor(challenge, { now = () => performance.now() } = {}) {
    this.challenge = validateChallenge(challenge);
    this.now = now;
    this.moves = [];
    this.matched = this.challenge.targets.map(() => false);
    this.status = "ready";
    this.startedAt = null;
    this.finishedElapsed = null;
    this.lastTime = null;
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
    if (this.startedAt === null) {
      const time = this.now();
      if (!Number.isFinite(time)) throw new Error("Invalid clock.");
      this.startedAt = this.lastTime = time;
      this.status = "running";
    }
    this.moves.push({ row, col });
    const codes = this.moves.map(cell => this.challenge.matrix[cell.row][cell.col]);
    this.matched = this.challenge.targets.map(sequence =>
      codes.some((_, index) => sequence.every((symbol, offset) => codes[index + offset] === symbol)));
    if (this.matched.every(Boolean)) this.finish("won", elapsed);
    else if (this.moves.length === this.challenge.config.buffer) this.finish("full-buffer", elapsed);
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
      schema: 1,
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
  const puzzle = new Puzzle(challenge, { now: () => time });
  for (const cell of result.moves) puzzle.select(cell.row, cell.col);
  if (result.outcome === "timeout") {
    if (!result.moves.length || result.elapsedMs !== challenge.config.seconds * 1000) {
      throw new Error("Timeout requires a started timer at its limit.");
    }
    time = result.elapsedMs;
    puzzle.tick();
  } else {
    if (result.elapsedMs >= challenge.config.seconds * 1000 ||
        (!result.moves.length && result.elapsedMs !== 0)) throw new Error("Inconsistent elapsed time.");
    if (result.outcome === "jacked-out") puzzle.jackOut();
  }
  if (puzzle.status !== result.outcome) throw new Error("Outcome does not match legal move history.");
  return { ...result, matched: [...puzzle.matched], timingVerified: false };
}
