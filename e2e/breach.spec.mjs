import { test, expect } from "@playwright/test";

test("GM configuration derives DV and character values, including zero and missing roles", async ({ page }) => {
  await page.goto("/preview/");
  await page.locator("#open").click();
  await expect(page.locator('[name="rank"]')).toHaveValue("4");
  await expect(page.locator(".cb-config .cb-metadata")).toContainText("Puffer: 6 / 39s");
  await page.locator('[name="dv"]').selectOption("14");
  await page.locator('[name="participant"]').selectOption("demo7");
  await expect(page.locator('[name="rank"]')).toHaveValue("7");
  await expect(page.locator(".cb-config .cb-metadata")).toContainText("7 x 7 / Puffer: 8 / 45s");
  await expect(page.locator(".cb-config .cb-metadata")).toContainText("4, 4, 5");
  await page.locator('[name="participant"]').selectOption("demo0");
  await expect(page.locator('[name="rank"]')).toHaveValue("0");
  await expect(page.locator(".cb-config .cb-metadata")).toContainText("Puffer: 4 / 17s");
  await expect(page.locator(".cb-config .cb-metadata")).toContainText("4, 4, 4");
  await page.locator('[name="participant"]').selectOption("no-role");
  await expect(page.locator('[name="rank"]')).toHaveValue("4");
  await expect(page.locator(".cb-config")).toContainText("Keine Netrunner-Rolle gefunden");
  await page.locator('[name="dv"]').selectOption("6");
  await expect(page.locator('[name="targetCount"] option')).toHaveCount(2);
  await expect(page.locator('[name="objective3"]')).toBeHidden();
  await page.locator('[name="objective1"]').fill("<img src=x onerror=alert(1)>");
  await page.locator('[type="submit"]').click();
  await expect(page.locator(".cb-board")).toBeVisible();
  await expect(page.locator(".cb-targets strong").first()).toHaveText("<img src=x onerror=alert(1)>");
  await expect(page.locator(".cb-board img")).toHaveCount(0);
  await expect(page.locator(".cb-targets li")).toHaveCount(2);
});

test("countdown starts on opening, includes time before the first code and reports once", async ({ page }) => {
  await page.clock.install();
  await page.goto("/preview/");
  await page.locator("#open").click();
  await page.locator('[type="submit"]').click();
  await expect(page.locator(".cb-time")).toHaveText("39.0s");
  await page.clock.runFor(5000);
  await expect(page.locator(".cb-time")).toHaveText("34.0s");
  await expect(page.locator(".cb-cell:enabled")).toHaveCount(5);
  await page.locator(".cb-cell:enabled").first().click();
  await page.clock.runFor(3000);
  await expect(page.locator(".cb-time")).toHaveText("31.0s");
  await expect(page.locator(".cb-cell:enabled")).toHaveCount(4);
  await page.clock.runFor(31000);
  await expect(page.locator(".cb-status")).toContainText("Zeitlimit erreicht");
  await expect(page.locator("#results .cb-report")).toHaveCount(1);
  await expect(page.locator("#results .cb-report")).toContainText("0/3");
  await expect(page.locator(".cb-jack")).toBeDisabled();
  await page.clock.runFor(2000);
  await expect(page.locator("#results .cb-report")).toHaveCount(1);
});

test("sequence prefix, hover feedback and final-slot win work in the actual board", async ({ page }) => {
  await page.goto("/preview/?lang=en");
  await page.evaluate(async () => {
    const { generateChallenge } = await import("/scripts/engine.mjs");
    const { breachConfig } = await import("/scripts/mechanics.mjs");
    const { openBoard } = await import("/scripts/ui.mjs");
    const strings = (await (await fetch("/lang/en.json")).json()).CB;
    const challenge = generateChallenge(breachConfig({ dv: 6, rank: 0 })).challenge;
    challenge.matrix = challenge.matrix.map(row => row.map(() => "5D"));
    [[0, 0, "0A"], [1, 0, "1C"], [1, 1, "2E"], [2, 1, "3F"]].forEach(([r, c, code]) => {
      challenge.matrix[r][c] = code;
    });
    challenge.targets = [["0A", "1C"], ["1C", "2E", "3F"]];
    window.sent = [];
    openBoard(challenge, { t: key => strings[key], onSubmit: async data => window.sent.push(data) });
  });
  const cells = page.locator(".cb-cell");
  await cells.nth(0).hover();
  await expect(page.locator(".cb-highlight")).toHaveCount(1);
  await cells.nth(0).click();
  await expect(page.locator(".cb-progress")).toHaveCount(1);
  await cells.nth(5).click();
  await expect(page.locator(".cb-matched")).toHaveCount(1);
  await cells.nth(6).click();
  await cells.nth(11).click();
  await expect(page.locator(".cb-status")).toContainText("All targets matched.");
  await expect(page.locator(".cb-matched")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => window.sent.length)).toBe(1);
  expect(await page.evaluate(() => window.sent[0].outcome)).toBe("won");
  expect(await page.evaluate(() => window.sent[0].moves.length)).toBe(4);
});

test("report failures remain visible and can be retried without automatic resend loops", async ({ page }) => {
  await page.clock.install();
  await page.goto("/preview/?lang=en");
  await page.evaluate(async () => {
    const { generateChallenge } = await import("/scripts/engine.mjs");
    const { breachConfig } = await import("/scripts/mechanics.mjs");
    const { openBoard } = await import("/scripts/ui.mjs");
    const strings = (await (await fetch("/lang/en.json")).json()).CB;
    window.attempts = 0;
    window.errors = [];
    openBoard(generateChallenge(breachConfig()).challenge, {
      t: key => strings[key],
      onError: error => window.errors.push(error.message),
      onSubmit: async () => {
        window.attempts++;
        if (window.attempts === 1) throw new Error("Chat permission denied");
      }
    });
  });
  await page.getByRole("button", { name: "Jack out", exact: true }).click();
  await expect(page.locator(".cb-error")).toContainText("could not complete");
  await expect(page.getByRole("button", { name: "Retry transmission" })).toBeEnabled();
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.attempts)).toBe(1);
  await page.getByRole("button", { name: "Retry transmission" }).click();
  await expect(page.locator(".cb-jack")).toBeDisabled();
  await expect(page.locator(".cb-error")).toBeEmpty();
  expect(await page.evaluate(() => window.attempts)).toBe(2);
  expect(await page.evaluate(() => window.errors)).toEqual(["Chat permission denied"]);
});

async function mockFoundry(page) {
  await page.goto("/preview/?lang=en");
  await page.evaluate(async () => {
    const callbacks = new Map();
    window.Hooks = {
      on: (name, fn) => callbacks.set(name, fn),
      once: (name, fn) => callbacks.set(name, fn),
      call: (name, ...args) => callbacks.get(name)?.(...args)
    };
    const users = [
      { id: "gm", name: "GM", isGM: true },
      { id: "gm2", name: "GM 2", isGM: true },
      { id: "runner", name: "Runner", isGM: false, active: true, character: {
        name: "Character", items: [{ type: "role", name: "Netrunner", system: { rank: 7 } }]
      } },
      { id: "other", name: "Other player", isGM: false }
    ];
    users.get = id => users.find(user => user.id === id);
    users.contents = users;
    const strings = (await (await fetch("/lang/en.json")).json()).CB;
    const module = {};
    window.game = {
      user: users[0], users, messages: new Map(),
      modules: new Map([["foundry-cipher-breach", module]]),
      i18n: { localize: key => strings[key.slice(3)] }
    };
    window.notices = [];
    window.ui = { notifications: { error: text => window.notices.push(text) } };
    window.foundry = { utils: { randomID: () => `id${game.messages.size}` } };
    window.ChatMessage = {
      create: async data => {
        const message = {
          ...data, id: `msg${game.messages.size}`, user: users.get(data.user), visible: true,
          getFlag: (scope, flag) => data.flags?.[scope]?.[flag]
        };
        game.messages.set(message.id, message);
        Hooks.call("createChatMessage", message);
        return message;
      }
    };
    await import("/scripts/foundry.mjs");
    Hooks.call("ready");
  });
}

test("Foundry adapter restricts launch and interaction and uses core chat for automatic reports", async ({ page }) => {
  await mockFoundry(page);
  const shared = await page.evaluate(async () => {
    const controls = [{ name: "token", tools: [] }];
    Hooks.call("getSceneControlButtons", controls);
    const modern = { tokens: { tools: {} } };
    Hooks.call("getSceneControlButtons", modern);
    const api = game.modules.get("foundry-cipher-breach").api;
    const message = await api.start({ user: "runner", dv: 10, names: ["Password", "Data", "Control"] });
    window.challengeMessage = message;
    return {
      oldButton: controls[0].tools[0].name,
      newButton: typeof modern.tokens.tools.cipherBreach.onChange,
      config: message.flags["foundry-cipher-breach"].challenge.config,
      whisper: message.whisper, boards: document.querySelectorAll(".cb-board").length
    };
  });
  expect(shared.oldButton).toBe("cipherBreach");
  expect(shared.newButton).toBe("function");
  expect(shared.config.rank).toBe(7);
  expect(shared.config.buffer).toBe(8);
  expect(shared.config.seconds).toBe(49);
  expect(shared.whisper).toEqual(["runner", "gm", "gm2"]);
  expect(shared.boards).toBe(0);
  const playerCheck = await page.evaluate(async () => {
    game.user = game.users.get("other");
    Hooks.call("createChatMessage", window.challengeMessage);
    const controls = [{ name: "token", tools: [] }];
    Hooks.call("getSceneControlButtons", controls);
    let refused = false;
    try { await game.modules.get("foundry-cipher-breach").api.start({ user: "other" }); }
    catch { refused = true; }
    return { refused, tools: controls[0].tools.length, boards: document.querySelectorAll(".cb-board").length };
  });
  expect(playerCheck).toEqual({ refused: true, tools: 0, boards: 0 });
  await page.evaluate(() => {
    game.user = game.users.get("runner");
    Hooks.call("createChatMessage", window.challengeMessage);
    Hooks.call("createChatMessage", window.challengeMessage);
  });
  await expect(page.locator(".cb-board")).toHaveCount(1);
  await page.getByRole("button", { name: "Jack out", exact: true }).click();
  await expect.poll(() => page.evaluate(() => game.messages.size)).toBe(2);
  const report = await page.evaluate(() => {
    const message = [...game.messages.values()].at(-1);
    const root = document.createElement("div");
    root.className = "message-content";
    Hooks.call("renderChatMessage", message, root);
    return { author: message.user.id, whisper: message.whisper, text: root.textContent };
  });
  expect(report.author).toBe("runner");
  expect(report.whisper).toEqual(["runner", "gm", "gm2"]);
  expect(report.text).toContain("Not reached: Password");
  expect(report.text).toContain("0/3");
});

test("Foundry report fails closed if the source is removed, and forged invitations do not open", async ({ page }) => {
  await mockFoundry(page);
  await page.evaluate(async () => {
    const message = await game.modules.get("foundry-cipher-breach").api.start({ user: "runner" });
    game.user = game.users.get("runner");
    Hooks.call("createChatMessage", { ...message, user: game.users.get("other") });
    if (document.querySelector(".cb-board")) throw new Error("Forged invitation opened.");
    Hooks.call("createChatMessage", message);
    game.messages.delete(message.id);
  });
  await page.getByRole("button", { name: "Jack out", exact: true }).click();
  await expect(page.locator(".cb-error")).toContainText("could not complete");
  expect(await page.evaluate(() => game.messages.size)).toBe(0);
  expect(await page.evaluate(() => window.notices.length)).toBe(2);
});

test("mobile layout remains within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/");
  await page.locator("#open").click();
  await page.locator('[name="dv"]').selectOption("20");
  await page.locator('[type="submit"]').click();
  const dimensions = await page.locator(".cb-board").evaluate(node => ({
    client: node.clientWidth, scroll: node.scrollWidth, viewport: window.innerWidth, width: node.getBoundingClientRect().width
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  expect(dimensions.width).toBeLessThan(dimensions.viewport);
  await expect(page.locator(".cb-cell")).toHaveCount(64);
});

test("DV 16-20 are available and no-move timeout is automatically reported", async ({ page }) => {
  await page.clock.install();
  await page.goto("/preview/");
  await page.locator("#open").click();
  for (const [dv, matrix, lengths] of [["16", "7 x 7", "4, 5, 5"], ["18", "8 x 8", "5, 5, 6"], ["20", "8 x 8", "5, 6, 6"]]) {
    await page.locator('[name="dv"]').selectOption(dv);
    await page.locator('[name="participant"]').selectOption("demo7");
    await expect(page.locator(".cb-config .cb-metadata")).toContainText(matrix);
    await expect(page.locator(".cb-config .cb-metadata")).toContainText(lengths);
  }
  await page.locator('[name="participant"]').selectOption("demo0");
  await expect(page.locator(".cb-config .cb-metadata")).toContainText("15s");
  await page.locator('[type="submit"]').click();
  await expect(page.locator(".cb-cell")).toHaveCount(64);
  await page.clock.runFor(15000);
  await expect(page.locator("#results .cb-report")).toContainText("Zeitlimit erreicht");
  await expect(page.locator("#results .cb-report")).toContainText("Puffer 0/4");
  await expect(page.locator("#results .cb-report")).toHaveCount(1);
  await expect(page.locator(".cb-jack")).toBeDisabled();
});

test("compact hack monitor omits helper controls and keeps noise active, respecting reduced motion", async ({ page }) => {
  await page.clock.install();
  await page.goto("/preview/?lang=en");
  await page.locator("#open").click();
  await page.locator('[type="submit"]').click();
  const board = page.locator(".cb-board");
  const animation = () => page.locator(".cb-matrix").evaluate(node => getComputedStyle(node, "::after").animationName);
  await expect(board.locator("button:not(.cb-cell)")).toHaveCount(2);
  await expect(board.locator(".cb-effects, .cb-primary, details, .cb-note, .cb-eyebrow")).toHaveCount(0);
  await expect(board).not.toContainText("Optional home rule");
  await expect(page.locator(".cb-status")).toBeHidden();
  await expect(page.locator(".cb-time")).toHaveText("39.0s");
  expect(await animation()).toBe("cb-interference");
  expect(await page.locator(".cb-matrix").evaluate(node => getComputedStyle(node, "::before").animationName)).toBe("cb-noise");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await animation()).toBe("none");
  expect(await page.locator(".cb-matrix").evaluate(node => getComputedStyle(node, "::before").animationName)).toBe("none");
  await page.clock.runFor(39000);
  await expect(board).toHaveClass(/cb-ended/);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await animation()).toBe("cb-interference");
});

test("DV20 rank zero decoy fails while a real route reports exactly one achieved objective", async ({ page }) => {
  await page.goto("/preview/?lang=en");
  await page.evaluate(async () => {
    const { generateChallenge, replayResult } = await import("/scripts/engine.mjs");
    const { breachConfig } = await import("/scripts/mechanics.mjs");
    const { openBoard } = await import("/scripts/ui.mjs");
    const strings = (await (await fetch("/lang/en.json")).json()).CB;
    let seed = 42;
    const rng = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    window.generated = generateChallenge(breachConfig({ dv: 20, rank: 0 }), { rng });
    window.reports = [];
    window.openTestBoard = () => openBoard(window.generated.challenge, {
      t: key => strings[key],
      onSubmit: async data => window.reports.push(replayResult(window.generated.challenge, data))
    });
    window.openTestBoard();
  });
  const decoy = await page.evaluate(() => window.generated.decoys[0]);
  await page.locator(".cb-cell").nth(decoy.col).click();
  await expect(page.locator(".cb-next")).toHaveCount(3);
  for (let step = 1; step < 4; step++) await page.locator(".cb-cell:enabled").first().click();
  await expect.poll(() => page.evaluate(() => window.reports.length)).toBe(1);
  expect(await page.evaluate(() => window.reports[0].matched.filter(Boolean).length)).toBe(0);
  expect(await page.evaluate(() => window.reports[0].outcome)).toBe("full-buffer");
  await page.locator(".cb-close").click();
  await page.evaluate(() => window.openTestBoard());
  const solution = await page.evaluate(() => window.generated.solutions[0]);
  for (const cell of solution) await page.locator(".cb-cell").nth(cell.row * 8 + cell.col).click();
  await expect.poll(() => page.evaluate(() => window.reports.length)).toBe(2);
  expect(await page.evaluate(() => window.reports[1].matched.filter(Boolean).length)).toBe(1);
  await expect(page.locator(".cb-matched")).toHaveCount(1);
  await expect(page.locator(".cb-status")).toContainText("Buffer full");
});

test("red terminal arranges timer and buffer above matrix and upload targets", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/preview/");
  await page.locator("#open").click();
  await page.locator('[name="dv"]').selectOption("20");
  await expect(page.locator(".cb-config")).toContainText("höchstens eines von drei Zielen");
  await page.locator('[type="submit"]').click();
  const color = selector => page.locator(selector).first().evaluate(node => getComputedStyle(node).backgroundColor);
  expect(await color(".cb-board")).toBe("rgb(16, 14, 22)");
  expect(await color(".cb-targets li")).toBe("rgb(25, 18, 27)");
  expect(await color(".cb-matrix-panel h3")).toBe("rgb(255, 75, 85)");
  const layout = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    const timer = rect(".cb-telemetry"), buffer = rect(".cb-buffer-panel");
    const matrix = rect(".cb-matrix-panel"), targets = rect(".cb-objectives");
    return {
      topAligned: Math.abs(timer.top - buffer.top) < 1,
      matrixBelowTimer: matrix.top > timer.bottom,
      targetsBelowBuffer: targets.top > buffer.bottom,
      mainAligned: Math.abs(matrix.top - targets.top) < 1,
      twoColumns: matrix.right < targets.left,
      timerSameColumn: Math.abs(timer.left - matrix.left) < 1,
      bufferSameColumn: Math.abs(buffer.left - targets.left) < 1
    };
  });
  expect(Object.values(layout).every(Boolean)).toBe(true);
});

for (const width of [1280, 390]) {
  test(`DE and EN share DOM, styles, matrix and gameplay at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install();
    const snapshots = [];
    for (const lang of ["de", "en"]) {
      await page.goto(`/preview/?lang=${lang}`);
      await page.locator("#open").click();
      await page.locator('[name="dv"]').selectOption("20");
      await page.locator('[name="participant"]').selectOption("demo0");
      const config = await page.locator(".cb-config").evaluate(node => ({
        structure: Array.from(node.querySelectorAll("*")).map(child => [child.tagName, child.className]),
        values: Array.from(node.querySelectorAll('[type="number"], select')).map(child => child.value),
        styles: ["display", "gridTemplateColumns", "gap", "backgroundColor"].map(key => getComputedStyle(node)[key]),
        overflow: node.scrollWidth > node.clientWidth
      }));
      await page.locator(".cb-close").click();
      await page.evaluate(async language => {
        const { generateChallenge, replayResult } = await import("/scripts/engine.mjs");
        const { breachConfig } = await import("/scripts/mechanics.mjs");
        const { openBoard } = await import("/scripts/ui.mjs");
        const strings = (await (await fetch(`/lang/${language}.json`)).json()).CB;
        let seed = 31;
        const rng = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        window.generated = generateChallenge(breachConfig({ dv: 20, rank: 0 }), {
          rng, names: ["backdoor", "data", "control"].map(key => strings[key])
        });
        window.reports = [];
        openBoard(window.generated.challenge, {
          t: key => {
            if (!strings[key]) throw new Error(`Missing ${language} translation: ${key}`);
            return strings[key];
          },
          onSubmit: async data => window.reports.push(replayResult(window.generated.challenge, data))
        });
      }, lang);
      const board = await page.locator(".cb-board").evaluate(node => ({
        structure: Array.from(node.querySelectorAll("*")).map(child => [child.tagName, child.className]),
        styles: [".cb-metrics", ".cb-workspace", ".cb-matrix", ".cb-targets", ".cb-telemetry"].map(selector => {
          const style = getComputedStyle(node.querySelector(selector));
          return ["display", "gridTemplateColumns", "gap", "backgroundColor", "fontFamily", "fontSize"].map(key => style[key]);
        }),
        matrix: Array.from(node.querySelectorAll(".cb-cell")).map(cell => cell.textContent),
        targets: Array.from(node.querySelectorAll(".cb-sequence")).map(sequence => sequence.textContent),
        bounds: Array.from(node.querySelectorAll(".cb-metrics, .cb-workspace, .cb-matrix, .cb-objectives")).every(child =>
          child.scrollWidth <= child.clientWidth),
        overflow: node.scrollWidth > node.clientWidth
      }));
      const solution = await page.evaluate(() => window.generated.solutions[0]);
      for (const cell of solution) await page.locator(".cb-cell").nth(cell.row * 8 + cell.col).click();
      await expect.poll(() => page.evaluate(() => window.reports.length)).toBe(1);
      const result = await page.evaluate(() => {
        const { moves, matched, outcome } = window.reports[0];
        return { moves, matched, outcome };
      });
      snapshots.push({ config, board, result });
    }
    expect(snapshots[0]).toEqual(snapshots[1]);
    expect(snapshots[0].board.bounds).toBe(true);
    expect(snapshots[0].board.overflow).toBe(false);
    expect(snapshots[0].config.overflow).toBe(false);
    expect(snapshots[0].result.outcome).toBe("full-buffer");
    expect(snapshots[0].result.matched.filter(Boolean).length).toBe(1);
  });
}
