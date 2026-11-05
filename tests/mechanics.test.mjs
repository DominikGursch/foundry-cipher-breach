import test from "node:test";
import assert from "node:assert/strict";
import { breachConfig, DV_PRESETS, interfaceRank } from "../scripts/mechanics.mjs";
import { HARD_SYMBOLS, Puzzle, generateChallenge, legalCells, replayResult, validateChallenge, validateConfig } from "../scripts/engine.mjs";

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

test("DV resources include versioned low-Interface pressure while retaining reference buffers", () => {
  const expected = [
    [6, 5, [2, 3]], [8, 5, [2, 3, 3]], [10, 6, [3, 3, 4]], [12, 6, [3, 4, 4]],
    [14, 7, [4, 4, 5]], [16, 7, [4, 5, 5]], [18, 8, [5, 5, 6]], [20, 8, [5, 6, 6]]
  ];
  for (const [dv, size, lengths] of expected) {
    for (let rank = 0; rank <= 10; rank++) {
      const config = breachConfig({ dv, rank });
      assert.equal(config.size, size);
      assert.equal(config.buffer, 4 + Math.ceil(rank / 2));
      const reference = Math.max(15, 25 + rank * 4 - (dv - 6));
      const pressure = dv >= 16 ? (dv - 14) * Math.max(0, 4 - rank) / 2 : 0;
      assert.equal(config.seconds, Math.max(6, Math.floor(reference - pressure)));
      assert.equal(breachConfig({ dv, rank, balance: 1 }).seconds, reference);
      assert.deepEqual(config.sequenceLengths, lengths.map(length => Math.min(length, config.buffer)));
      assert.deepEqual(validateConfig(config), config);
    }
  }
  assert.equal(breachConfig({ dv: 14, rank: 0 }).seconds, 17);
  assert.equal(breachConfig({ dv: 18, rank: 0 }).seconds, 7);
  assert.equal(breachConfig({ dv: 20, rank: 0 }).seconds, 6);
  assert.equal(breachConfig({ dv: 8, rank: 7 }).buffer, 8);
});

test("reference DVs retain jointly solvable overlapping targets", () => {
  for (const dv of Object.keys(DV_PRESETS).map(Number).filter(dv => dv <= 14)) {
    for (let rank = 0; rank <= 10; rank++) {
      for (let targetCount = 1; targetCount <= DV_PRESETS[dv].lengths.length; targetCount++) {
        for (let seed = 0; seed < 20; seed++) {
          const config = breachConfig({ dv, rank, targetCount, balance: 1 });
          const names = ["Password", "Data", "Node"].slice(0, targetCount);
          const { challenge, solution } = generateChallenge(config, { rng: seeded(seed), names });
          assert.equal(challenge.schema, 2);
          assert.deepEqual(challenge.names, names);
          assert.equal(solution.length, config.buffer);
          const codes = solution.map(cell => challenge.matrix[cell.row][cell.col]);
          let offset = 0;
          const total = config.sequenceLengths.reduce((sum, length) => sum + length, 0);
          config.sequenceLengths.forEach((length, index) => {
            const start = total <= config.buffer ? offset : Math.round(index * (config.buffer - length) / Math.max(1, targetCount - 1));
            assert.deepEqual(challenge.targets[index], codes.slice(start, start + length));
            offset += length;
          });
          const puzzle = new Puzzle(challenge, { now: () => 0 });
          for (const cell of solution) {
            if (puzzle.status === "won") break;
            puzzle.select(cell.row, cell.col);
          }
          assert.equal(puzzle.status, "won");
          assert.ok(replayResult(challenge, puzzle.result()).matched.every(Boolean));
        }
      }
    }
  }
});

test("high DVs have distinct individually solvable routes and misleading first-code entries", () => {
  for (const dv of [16, 18, 20]) {
    for (let rank = 0; rank <= 10; rank++) {
      for (let targetCount = 1; targetCount <= 3; targetCount++) {
        for (let seed = 0; seed < 20; seed++) {
          const config = breachConfig({ dv, rank, targetCount, balance: 1 });
          const generated = generateChallenge(config, { rng: seeded(seed) });
          const { challenge, solutions, decoys } = generated;
          assert.deepEqual(generated, generateChallenge(config, { rng: seeded(seed) }));
          assert.equal(new Set(challenge.targets.map(sequence => sequence.join("-"))).size, targetCount);
          assert.ok(challenge.matrix.flat().every(code => HARD_SYMBOLS.includes(code)));
          assert.ok(challenge.matrix.flat().some(code => !["0A", "1C", "2E", "3F", "4B", "5D"].includes(code)));
          assert.equal(challenge.solutions, undefined);
          assert.equal(challenge.decoys, undefined);
          solutions.forEach((path, index) => {
            assert.equal(path.length, config.sequenceLengths[index]);
            const puzzle = new Puzzle(challenge, { now: () => 0 });
            for (const cell of path) {
              assert.ok(legalCells(config.size, puzzle.moves).some(move => move.row === cell.row && move.col === cell.col));
              puzzle.select(cell.row, cell.col);
            }
            assert.equal(puzzle.matched[index], true);
            puzzle.jackOut();
            assert.equal(replayResult(challenge, puzzle.result()).matched[index], true);
            const decoy = decoys[index];
            assert.equal(challenge.matrix[decoy.row][decoy.col], challenge.targets[index][0]);
            assert.notEqual(decoy.col, path[0].col);
            const next = legalCells(config.size, [decoy]);
            assert.ok(next.length > 0);
            assert.ok(next.every(cell => !challenge.targets.some(sequence => challenge.matrix[cell.row][cell.col] === sequence[1])));
          });
        }
      }
    }
  }
});

test("new DV18/20 rank-zero puzzles have exactly one route per objective and late dead-end prefixes", () => {
  for (const dv of [18, 20]) {
    for (const targetCount of [1, 2, 3]) {
      for (let seed = 0; seed < 100; seed++) {
        const config = breachConfig({ dv, rank: 0, targetCount });
        const generated = generateChallenge(config, { rng: seeded(seed) });
        const { challenge, solutions, decoyPaths } = generated;
        assert.deepEqual(generated, generateChallenge(config, { rng: seeded(seed) }));
        assert.equal(challenge.config.seconds, dv === 18 ? 7 : 6);
        assert.equal(challenge.config.balance, 2);
        assert.equal(challenge.decoyPaths, undefined);
        for (const [index, sequence] of challenge.targets.entries()) {
          const prefixes = [], completed = [];
          function enumerate(moves = []) {
            if (moves.length === 3) prefixes.push(moves);
            if (moves.length === 4) { completed.push(moves); return; }
            for (const cell of legalCells(config.size, moves)) {
              if (challenge.matrix[cell.row][cell.col] === sequence[moves.length]) enumerate([...moves, cell]);
            }
          }
          enumerate();
          assert.equal(completed.length, 1);
          assert.deepEqual(completed[0], solutions[index]);
          assert.ok(prefixes.length >= (targetCount === 1 ? 9 : 3));
          const puzzle = new Puzzle(challenge, { now: () => 0 });
          for (const cell of solutions[index]) puzzle.select(cell.row, cell.col);
          assert.equal(puzzle.matched[index], true);
          assert.equal(replayResult(challenge, puzzle.result()).matched[index], true);
        }
        for (const path of decoyPaths) {
          const sequence = challenge.targets.find(target => target[0] === challenge.matrix[0][path[0].col]);
          assert.ok(sequence);
          const puzzle = new Puzzle(challenge, { now: () => 0 });
          for (const cell of path) puzzle.select(cell.row, cell.col);
          assert.deepEqual(path.map(({ row, col }) => challenge.matrix[row][col]), sequence.slice(0, 3));
          assert.ok(legalCells(config.size, path).every(cell => challenge.matrix[cell.row][cell.col] !== sequence[3]));
          const next = legalCells(config.size, path)[0];
          puzzle.select(next.row, next.col);
          assert.equal(puzzle.matched.some(Boolean), false);
        }
      }
    }
  }
});

test("saved balance-one challenges retain their original clock and new balance fields cannot be forged", () => {
  const old = generateChallenge(breachConfig({ dv: 20, rank: 0, targetCount: 1, balance: 1 })).challenge;
  assert.equal(old.config.balance, undefined);
  assert.equal(validateChallenge(old).config.seconds, 15);
  const current = generateChallenge(breachConfig({ dv: 20, rank: 0, targetCount: 1 })).challenge;
  assert.throws(() => validateChallenge({ ...current, config: { ...current.config, seconds: 15 } }));
  assert.throws(() => validateChallenge({ ...current, config: { ...current.config, balance: 3 } }));
  assert.throws(() => validateChallenge({ ...current, config: { ...current.config, balance: undefined } }));
});

test("DV20 rank zero cannot win all three objectives; misleading entries cannot complete any objective", () => {
  function reachable(challenge, sequence, moves = []) {
    if (moves.length === sequence.length) return true;
    return legalCells(challenge.config.size, moves).some(cell =>
      challenge.matrix[cell.row][cell.col] === sequence[moves.length] &&
      reachable(challenge, sequence, [...moves, cell]));
  }
  for (let seed = 0; seed < 100; seed++) {
    const { challenge, solutions, decoys } = generateChallenge(breachConfig({ dv: 20, rank: 0, balance: 1 }), { rng: seeded(seed) });
    assert.equal(challenge.config.seconds, 15);
    assert.equal(challenge.config.buffer, 4);
    assert.deepEqual(challenge.targets.map(sequence => sequence.length), [4, 4, 4]);
    assert.equal(new Set(challenge.targets.map(sequence => sequence.join("-"))).size, 3);
    // Four slots hold exactly one length-four sequence, so distinct targets cannot all match.
    for (const path of solutions) {
      const puzzle = new Puzzle(challenge, { now: () => 0 });
      for (const cell of path) puzzle.select(cell.row, cell.col);
      assert.equal(puzzle.status, "full-buffer");
      assert.equal(puzzle.matched.filter(Boolean).length, 1);
    }
    for (const decoy of decoys) {
      assert.ok(challenge.targets.every(sequence =>
        sequence[0] !== challenge.matrix[0][decoy.col] || !reachable(challenge, sequence, [decoy])));
    }
  }
});

test("saved high-DV puzzles with the original alphabet and identical targets still replay unchanged", () => {
  const { challenge: original, solution } = generateChallenge({
    size: 8, buffer: 4, targetCount: 1, sequenceLength: 4, seconds: 15
  }, { rng: seeded(42) });
  const challenge = validateChallenge({
    ...original, schema: 2, config: breachConfig({ dv: 20, rank: 0, balance: 1 }),
    targets: Array.from({ length: 3 }, () => [...original.targets[0]]), names: ["Password", "Data", "Node"]
  });
  const puzzle = new Puzzle(challenge, { now: () => 0 });
  for (const cell of solution) puzzle.select(cell.row, cell.col);
  assert.equal(puzzle.status, "won");
  assert.ok(replayResult(challenge, puzzle.result()).matched.every(Boolean));
  const lower = generateChallenge(breachConfig({ dv: 8 })).challenge;
  lower.matrix[0][0] = "CD";
  assert.throws(() => validateChallenge(lower));
  challenge.matrix[0][0] = "ZZ";
  assert.throws(() => validateChallenge(challenge));
});

test("Interface extraction matches RED role data, preserves zero, distinguishes missing role", () => {
  const actor = (name, rank, ability = "") => ({ items: [{ type: "role", name, system: { rank, mainRoleAbility: ability } }] });
  assert.equal(interfaceRank(actor("Netrunner", "7")), 7);
  assert.equal(interfaceRank(actor("Netrunner", 0)), 0);
  assert.equal(interfaceRank(actor("Custom role", 4, "Interface")), 4);
  assert.equal(interfaceRank(actor("Нетраннер", 6)), 6);
  assert.equal(interfaceRank(actor("Netrünner", 5)), 5);
  assert.equal(interfaceRank(actor("Solo", 7)), null);
  assert.equal(interfaceRank(null), null);
  assert.equal(interfaceRank(actor("Netrunner", null)), null);
  for (const rank of [-1, 11, 2.5, "oops", true, {}]) assert.throws(() => interfaceRank(actor("Netrunner", rank)));
});

test("DV/rank/schema tampering and malformed objective names fail explicitly", () => {
  for (const dv of [0, 7, 19, 21, 22, "8", NaN]) assert.throws(() => breachConfig({ dv }));
  for (const rank of [-1, 11, 1.5, "4", null]) assert.throws(() => breachConfig({ rank }));
  assert.throws(() => breachConfig({ dv: 6, targetCount: 3 }));
  for (const targetCount of [0, 4, "2", null]) assert.throws(() => breachConfig({ targetCount }));
  const config = breachConfig({ dv: 14, rank: 7 });
  const { challenge } = generateChallenge(config);
  for (const key of ["size", "buffer", "seconds", "dv", "rank", "targetCount", "sequenceLengths"]) {
    assert.throws(() => validateConfig({ ...config, [key]: undefined }));
  }
  assert.throws(() => validateConfig({ ...config, buffer: 9 }));
  assert.throws(() => validateConfig({ ...config, sequenceLengths: [4, 4, 4] }));
  assert.throws(() => validateChallenge({ ...challenge, schema: 1 }));
  for (const names of [[], ["", "Data", "Node"], Array(3), ["A".repeat(121), "B", "C"]]) {
    assert.throws(() => validateChallenge({ ...challenge, names }));
  }
  const unsafe = ["<script>alert(1)</script>", "B", "C"];
  assert.deepEqual(validateChallenge({ ...challenge, names: unsafe }).names, unsafe);
});

test("partial achievement, dead ends and the countdown are preserved in reports", () => {
  const { challenge } = generateChallenge(breachConfig({ dv: 8, rank: 4 }));
  challenge.matrix = challenge.matrix.map(row => row.map(() => "0A"));
  challenge.targets = [["0A", "0A"], ["5D", "5D", "5D"], ["1C", "1C", "1C"]];
  let time = 1000;
  const puzzle = new Puzzle(challenge, { now: () => time });
  time += 1000;
  assert.equal(puzzle.elapsed(), 1000);
  puzzle.select(0, 0);
  time += 250;
  puzzle.select(1, 0);
  assert.deepEqual(puzzle.matched, [true, false, false]);
  puzzle.jackOut();
  assert.deepEqual(replayResult(challenge, puzzle.result()).matched, [true, false, false]);
  assert.equal(puzzle.result().elapsedMs, 1250);
  const stuck = generateChallenge(breachConfig({ dv: 6, rank: 10, targetCount: 1 })).challenge;
  stuck.matrix = stuck.matrix.map(row => row.map(() => "0A"));
  stuck.targets = [["5D", "5D"]];
  const deadEnd = new Puzzle(stuck, { now: () => 0 });
  for (const [row, col] of [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2], [1, 2], [1, 3], [0, 3], [0, 4]]) {
    deadEnd.select(row, col);
  }
  // A rank-10 buffer fills before a row can be exhausted on a 5x5 grid.
  assert.equal(deadEnd.status, "full-buffer");
  const legacy = generateChallenge({ size: 4, buffer: 14, targetCount: 1, sequenceLength: 2, seconds: 15 }).challenge;
  legacy.matrix = legacy.matrix.map(row => row.map(() => "0A"));
  legacy.targets = [["5D", "5D"]];
  const trapped = new Puzzle(legacy, { now: () => 0 });
  for (const [row, col] of [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2], [1, 2], [1, 3], [0, 3]]) trapped.select(row, col);
  assert.equal(trapped.status, "dead-end");
  assert.equal(replayResult(legacy, trapped.result()).outcome, "dead-end");
});
