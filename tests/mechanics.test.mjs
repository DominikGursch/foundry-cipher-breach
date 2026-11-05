import test from "node:test";
import assert from "node:assert/strict";
import { breachConfig, DV_PRESETS, interfaceRank } from "../scripts/mechanics.mjs";
import { Puzzle, generateChallenge, replayResult, validateChallenge, validateConfig } from "../scripts/engine.mjs";

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

test("exact reference DV presets and rank formulas, including zero and the 15s floor", () => {
  const expected = [[6, 5, [2, 3]], [8, 5, [2, 3, 3]], [10, 6, [3, 3, 4]], [12, 6, [3, 4, 4]], [14, 7, [4, 4, 5]]];
  for (const [dv, size, lengths] of expected) {
    for (let rank = 0; rank <= 10; rank++) {
      const config = breachConfig({ dv, rank });
      assert.equal(config.size, size);
      assert.equal(config.buffer, 4 + Math.ceil(rank / 2));
      assert.equal(config.seconds, Math.max(15, 25 + rank * 4 - (dv - 6)));
      assert.deepEqual(config.sequenceLengths, lengths.map(length => Math.min(length, config.buffer)));
      assert.deepEqual(validateConfig(config), config);
    }
  }
  assert.equal(breachConfig({ dv: 14, rank: 0 }).seconds, 17);
  assert.equal(breachConfig({ dv: 8, rank: 7 }).buffer, 8);
});

test("every DV/rank/objective count has a joint legal solution with overlapping reference placement", () => {
  for (const dv of Object.keys(DV_PRESETS).map(Number)) {
    for (let rank = 0; rank <= 10; rank++) {
      for (let targetCount = 1; targetCount <= DV_PRESETS[dv].lengths.length; targetCount++) {
        for (let seed = 0; seed < 20; seed++) {
          const config = breachConfig({ dv, rank, targetCount });
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
  for (const dv of [0, 7, 16, "8", NaN]) assert.throws(() => breachConfig({ dv }));
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
  time += 100000;
  assert.equal(puzzle.elapsed(), 0);
  puzzle.select(0, 0);
  time += 250;
  puzzle.select(1, 0);
  assert.deepEqual(puzzle.matched, [true, false, false]);
  puzzle.jackOut();
  assert.deepEqual(replayResult(challenge, puzzle.result()).matched, [true, false, false]);
  assert.equal(puzzle.result().elapsedMs, 250);
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
