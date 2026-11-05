import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG, Puzzle, generateChallenge, legalCells, replayResult,
  validateChallenge, validateConfig, validateResult
} from "../scripts/engine.mjs";

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function fixture(config = DEFAULT_CONFIG) {
  return generateChallenge(config, { rng: seeded(41), id: "test", participantId: "runner" });
}

test("all supported size/buffer/target combinations have a jointly solvable legal witness", () => {
  for (let size = 4; size <= 8; size++) {
    for (let buffer = 4; buffer <= 14; buffer++) {
      for (let targetCount = 1; targetCount <= 3; targetCount++) {
        for (let sequenceLength = 2; sequenceLength <= 4; sequenceLength++) {
          if (targetCount * sequenceLength > buffer) continue;
          const config = { size, buffer, targetCount, sequenceLength, seconds: 15 };
          for (let seed = 0; seed < 4; seed++) {
            const { challenge, solution } = generateChallenge(config, { rng: seeded(seed) });
            assert.equal(new Set(solution.map(cell => `${cell.row}:${cell.col}`)).size, buffer);
            const puzzle = new Puzzle(challenge, { now: () => 0 });
            for (const cell of solution) {
              if (puzzle.status === "won") break;
              puzzle.select(cell.row, cell.col);
            }
            assert.equal(puzzle.status, "won");
            assert.equal(replayResult(challenge, puzzle.result()).timingVerified, false);
          }
        }
      }
    }
  }
});

test("generation is deterministic with injectable RNG and rejects invalid RNG", () => {
  assert.deepEqual(fixture(), fixture());
  for (const value of [-1, 1, NaN, Infinity]) {
    assert.throws(() => generateChallenge(DEFAULT_CONFIG, { rng: () => value }));
  }
});

test("first move top row, alternating column/row, and no cell reuse", () => {
  const { challenge } = fixture();
  const puzzle = new Puzzle(challenge, { now: () => 0 });
  assert.throws(() => puzzle.select(1, 0));
  puzzle.select(0, 1);
  assert.throws(() => puzzle.select(0, 2));
  assert.throws(() => puzzle.select(0, 1));
  puzzle.select(2, 1);
  assert.throws(() => puzzle.select(1, 1));
  puzzle.select(2, 3);
  assert.deepEqual(legalCells(4, puzzle.moves), [
    { row: 0, col: 3 }, { row: 1, col: 3 }, { row: 3, col: 3 }
  ]);
});

test("timer starts only on first legal selection, deadline is exclusive, terminal time is frozen", () => {
  let time = 100;
  const { challenge } = fixture();
  const puzzle = new Puzzle(challenge, { now: () => time });
  time = 10000;
  assert.equal(puzzle.elapsed(), 0);
  assert.throws(() => puzzle.select(1, 0));
  assert.equal(puzzle.startedAt, null);
  puzzle.select(0, 0);
  time += 59999;
  assert.equal(puzzle.tick(), "running");
  time++;
  assert.equal(puzzle.tick(), "timeout");
  assert.throws(() => puzzle.select(1, 0));
  assert.equal(puzzle.result().elapsedMs, 60000);
  time += 1000;
  assert.equal(puzzle.result().elapsedMs, 60000);
  assert.equal(replayResult(challenge, puzzle.result()).outcome, "timeout");
});

test("all-target success takes precedence over a full buffer and detects contiguous sequences", () => {
  const { challenge } = fixture({ ...DEFAULT_CONFIG, buffer: 4, sequenceLength: 2 });
  challenge.matrix = challenge.matrix.map(row => row.map(() => "5D"));
  const solution = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }];
  const codes = ["0A", "1C", "2E", "3F"];
  solution.forEach((cell, index) => { challenge.matrix[cell.row][cell.col] = codes[index]; });
  challenge.targets = [codes.slice(0, 2), codes.slice(2)];
  const puzzle = new Puzzle(challenge, { now: () => 0 });
  for (const [index, cell] of solution.entries()) {
    puzzle.select(cell.row, cell.col);
    if (index < solution.length - 1) assert.equal(puzzle.status, "running");
  }
  assert.equal(puzzle.moves.length, challenge.config.buffer);
  assert.equal(puzzle.status, "won");
  assert.ok(puzzle.matched.every(Boolean));
  assert.throws(() => puzzle.select(0, 0));
  assert.equal(replayResult(challenge, puzzle.result()).outcome, "won");
});

test("full-buffer and target failure are replayable", () => {
  const { challenge, solution } = fixture({ ...DEFAULT_CONFIG, buffer: 4, targetCount: 1 });
  challenge.matrix = challenge.matrix.map(row => row.map(() => "0A"));
  challenge.targets = [["5D", "5D", "5D"]];
  const puzzle = new Puzzle(challenge, { now: () => 0 });
  for (const cell of solution) puzzle.select(cell.row, cell.col);
  assert.equal(puzzle.status, "full-buffer");
  assert.deepEqual(puzzle.matched, [false]);
  assert.equal(replayResult(challenge, puzzle.result()).outcome, "full-buffer");
});

test("jack out before and after the first move; backward clocks fail explicitly", () => {
  const { challenge } = fixture();
  let time = 0;
  const puzzle = new Puzzle(challenge, { now: () => time });
  assert.throws(() => puzzle.result());
  puzzle.jackOut();
  assert.equal(replayResult(challenge, puzzle.result()).elapsedMs, 0);
  const started = new Puzzle(challenge, { now: () => time });
  started.select(0, 0);
  time = 10;
  started.jackOut();
  assert.equal(replayResult(challenge, started.result()).elapsedMs, 10);
  const backwards = new Puzzle(challenge, { now: () => time });
  backwards.select(0, 0);
  time--;
  assert.throws(() => backwards.elapsed(), /clock/);
});

test("matching targets may overlap", () => {
  const { challenge } = fixture({ ...DEFAULT_CONFIG, targetCount: 2, sequenceLength: 2, buffer: 4 });
  challenge.matrix = challenge.matrix.map(row => row.map(() => "0A"));
  challenge.matrix[1][0] = "1C";
  challenge.targets = [["0A", "1C"], ["1C", "0A"]];
  const puzzle = new Puzzle(challenge, { now: () => 0 });
  puzzle.select(0, 0);
  puzzle.select(1, 0);
  assert.deepEqual(puzzle.matched, [true, false]);
  puzzle.select(1, 1);
  assert.equal(puzzle.status, "won");
});

test("non-contiguous target symbols do not match", () => {
  const { challenge } = fixture({ ...DEFAULT_CONFIG, targetCount: 1, sequenceLength: 2, buffer: 4 });
  challenge.matrix = challenge.matrix.map(row => row.map(() => "5D"));
  challenge.matrix[0][0] = "0A";
  challenge.matrix[1][0] = "1C";
  challenge.matrix[1][1] = "2E";
  challenge.targets = [["0A", "2E"]];
  const puzzle = new Puzzle(challenge, { now: () => 0 });
  puzzle.select(0, 0);
  puzzle.select(1, 0);
  puzzle.select(1, 1);
  assert.deepEqual(puzzle.matched, [false]);
  assert.equal(puzzle.status, "running");
});

test("hostile and boundary config/challenge serialization fails closed", () => {
  const { challenge } = fixture();
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    for (const value of [null, "4", NaN, Infinity, -1, 999, 4.5]) {
      assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, [key]: value }));
    }
  }
  assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, buffer: 4 }));
  assert.throws(() => validateChallenge({ ...challenge, schema: 2 }));
  assert.throws(() => validateChallenge({ ...challenge, id: "<img onerror=alert(1)>" }));
  assert.throws(() => validateChallenge({ ...challenge, participantId: {} }));
  assert.throws(() => validateChallenge({ ...challenge, targets: [["<script>"]] }));
  assert.throws(() => validateChallenge({ ...challenge, matrix: [] }));
  assert.throws(() => validateChallenge({ ...challenge, matrix: Array(challenge.config.size) }));
  assert.throws(() => validateChallenge({ ...challenge, targets: Array(challenge.config.targetCount) }));
  const sparseRow = challenge.matrix.map(row => [...row]);
  sparseRow[0] = Array(challenge.config.size);
  assert.throws(() => validateChallenge({ ...challenge, matrix: sparseRow }));
  const polluted = JSON.parse(JSON.stringify(challenge).replace('"schema":1', '"__proto__":{"unsafe":true},"schema":1'));
  assert.equal(validateChallenge(polluted).unsafe, undefined);
  const normalized = validateChallenge(challenge);
  normalized.matrix[0][0] = "5D";
  assert.notEqual(normalized.matrix, challenge.matrix);
});

test("replay rejects forged IDs, illegal/repeated moves, impossible states and elapsed boundaries", () => {
  const { challenge } = fixture();
  const puzzle = new Puzzle(challenge, { now: () => 0 });
  puzzle.select(0, 0);
  puzzle.jackOut();
  const result = puzzle.result();
  assert.throws(() => replayResult(challenge, { ...result, challengeId: "other" }));
  assert.throws(() => replayResult(challenge, { ...result, moves: [{ row: 1, col: 0 }] }));
  assert.throws(() => replayResult(challenge, { ...result, moves: [result.moves[0], result.moves[0]] }));
  assert.throws(() => replayResult(challenge, { ...result, moves: Array(15).fill(result.moves[0]) }));
  assert.throws(() => replayResult(challenge, { ...result, outcome: "won" }));
  assert.throws(() => replayResult(challenge, { ...result, outcome: "timeout", elapsedMs: 59999 }));
  assert.throws(() => replayResult(challenge, { ...result, elapsedMs: 60000 }));
  assert.throws(() => replayResult(challenge, { ...result, moves: [], elapsedMs: 1 }));
  assert.throws(() => validateResult({ ...result, moves: Array(1) }, challenge));
  for (const elapsedMs of [-1, "0", Infinity, 1.5, 60001]) {
    assert.throws(() => validateResult({ ...result, elapsedMs }, challenge));
  }
  assert.throws(() => replayResult(challenge, { ...result, outcome: "<img>" }));
});
