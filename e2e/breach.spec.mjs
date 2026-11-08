import { test, expect } from "@playwright/test";

async function startPreview(page) {
  await page.locator('[type="submit"]').click();
  await page.locator("#results button").click();
}

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
  await expect(page.locator(".cb-config .cb-metadata")).toContainText("Puffer: 4 / 10.2s");
  await expect(page.locator(".cb-config .cb-metadata")).toContainText("4, 4, 4");
  await page.locator('[name="participant"]').selectOption("no-role");
  await expect(page.locator('[name="rank"]')).toHaveValue("0");
  await expect(page.locator(".cb-config")).toContainText("Keine Netrunner-Rolle gefunden");
  await page.locator('[name="rank"]').fill("3");
  await expect(page.locator('[name="rank"]')).toHaveValue("3");
  await page.locator('[name="dv"]').selectOption("6");
  await expect(page.locator('[name="targetCount"] option')).toHaveCount(2);
  await expect(page.locator('[name="objective3"]')).toBeHidden();
  await page.locator('[name="objective1"]').fill("<img src=x onerror=alert(1)>");
  await startPreview(page);
  await expect(page.locator(".cb-board")).toBeVisible();
  await expect(page.locator(".cb-targets strong").first()).toHaveText("<img src=x onerror=alert(1)>");
  await expect(page.locator(".cb-board img")).toHaveCount(0);
  await expect(page.locator(".cb-targets li")).toHaveCount(2);
});

test("three short-buffer objectives never display identical sequences", async ({ page }) => {
  await page.goto("/preview/?lang=en");
  await page.locator("#open").click();
  await page.locator('[name="dv"]').selectOption("12");
  await page.locator('[name="participant"]').selectOption("demo0");
  await page.locator('[name="targetCount"]').selectOption("3");
  await startPreview(page);
  const sequences = await page.locator(".cb-targets li").evaluateAll(items =>
    items.map(item => [...item.querySelectorAll("code")].map(code => code.textContent).join("-")));
  expect(sequences).toHaveLength(3);
  expect(new Set(sequences).size).toBe(3);
});

test("countdown starts on opening, includes time before the first code and reports once", async ({ page }) => {
  await page.clock.install();
  await page.goto("/preview/");
  await page.locator("#open").click();
  await page.locator('[type="submit"]').click();
  await page.clock.runFor(60000);
  await expect(page.locator(".cb-board")).toHaveCount(0);
  await expect(page.locator("#results .cb-report")).toHaveCount(0);
  await page.locator("#results button").click();
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
  await expect(page.locator(".cb-jack")).toBeEnabled();
  await page.clock.runFor(2000);
  await expect(page.locator("#results .cb-report")).toHaveCount(1);
  await page.locator(".cb-jack").click();
  await expect(page.locator(".cb-board")).toHaveCount(0);
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
  await expect(page.locator(".cb-signal-lost")).toBeVisible();
  await expect(page.locator(".cb-signal-lost")).toContainText("Connection closed");
  await expect(page.locator(".cb-board")).not.toHaveClass(/cb-timeout/);
  await expect(page.locator(".cb-matched")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => window.sent.length)).toBe(1);
  expect(await page.evaluate(() => window.sent[0].outcome)).toBe("won");
  expect(await page.evaluate(() => window.sent[0].moves.length)).toBe(4);
  await expect(page.locator(".cb-jack")).toBeEnabled();
  await page.locator(".cb-jack").click();
  await expect(page.locator(".cb-board")).toHaveCount(0);
  expect(await page.evaluate(() => window.sent.length)).toBe(1);
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
  await page.clock.runFor(39000);
  await expect(page.locator(".cb-error")).toContainText("could not complete");
  await expect(page.getByRole("button", { name: "Jack out", exact: true })).toBeEnabled();
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.attempts)).toBe(1);
  await page.getByRole("button", { name: "Jack out", exact: true }).click();
  await expect(page.locator(".cb-board")).toHaveCount(0);
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
      settings: { registerMenu: (namespace, key, options) => { window.registeredMenu = { namespace, key, options }; } },
      i18n: { localize: key => strings[key.slice(3)] }
    };
    window.FormApplication = class FormApplication {};
    window.notices = [];
    window.ui = { notifications: { error: text => window.notices.push(text) } };
    window.foundry = { utils: { randomID: () => `id${game.messages.size}` } };
    window.ChatMessage = {
      create: async data => {
        if (typeof data.author !== "string" || "user" in data) throw new Error("Expected Foundry v12 author field");
        const message = {
          ...data, id: `msg${game.messages.size}`, author: users.get(data.author), visible: true,
          getFlag: (scope, flag) => data.flags?.[scope]?.[flag]
        };
        game.messages.set(message.id, message);
        Hooks.call("createChatMessage", message);
        return message;
      }
    };
    await import("/scripts/foundry.mjs");
    Hooks.call("init");
    Hooks.call("ready");
  });
}

test("Foundry v12 settings menu and token control open the configuration", async ({ page }) => {
  await mockFoundry(page);
  const menu = await page.evaluate(() => ({
    namespace: window.registeredMenu.namespace,
    key: window.registeredMenu.key,
    isForm: window.registeredMenu.options.type.prototype instanceof FormApplication,
    restricted: window.registeredMenu.options.restricted
  }));
  expect(menu).toEqual({ namespace: "foundry-cipher-breach", key: "launcher", isForm: true, restricted: false });
  await page.evaluate(() => new window.registeredMenu.options.type().render(true));
  await expect(page.locator(".cb-config")).toBeVisible();
  await page.locator(".cb-config").locator("..").locator(".cb-close").click();
  await expect(page.locator(".cb-config")).toHaveCount(0);
  await page.evaluate(() => {
    const controls = [{ name: "token", tools: [] }];
    Hooks.call("getSceneControlButtons", controls);
    controls[0].tools[0].onClick();
  });
  await expect(page.locator(".cb-config")).toBeVisible();
  await expect(page.locator('[name="rank"]')).toHaveValue("7");
});

test("GM can open the breach directly from the primary scene toolbar", async ({ page }) => {
  await mockFoundry(page);
  await page.evaluate(() => {
    const root = document.createElement("nav");
    root.id = "test-scene-controls";
    root.innerHTML = '<ol class="main-controls"><li class="scene-control">Tokens</li></ol>';
    window.sceneControlClicks = 0;
    root.addEventListener("click", () => window.sceneControlClicks++);
    document.body.append(root);
    Hooks.call("renderSceneControls", {}, [root]);
    Hooks.call("renderSceneControls", {}, [root]);
  });
  const button = page.locator(".main-controls .cb-scene-launch");
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAttribute("aria-label", "Open Cipher Breach");
  await button.click();
  await expect(page.locator(".cb-config")).toBeVisible();
  expect(await page.evaluate(() => window.sceneControlClicks)).toBe(0);
  await page.locator(".cb-config").locator("..").locator(".cb-close").click();
  await expect(page.locator(".cb-config")).toHaveCount(0);
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cb-config")).toBeVisible();
  await page.locator(".cb-config").locator("..").locator(".cb-close").click();
  await page.evaluate(() => {
    game.user = game.users.get("runner");
    Hooks.call("renderSceneControls", {}, [document.querySelector("#test-scene-controls")]);
  });
  await expect(button).toHaveCount(0);
});

test("Foundry adapter restricts launch and interaction and uses core chat for automatic reports", async ({ page }) => {
  await page.clock.install();
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
    const root = document.createElement("div");
    root.className = "message-content";
    document.body.append(root);
    Hooks.call("renderChatMessage", window.challengeMessage, root);
  });
  await page.clock.runFor(60000);
  await expect(page.locator(".cb-board")).toHaveCount(0);
  expect(await page.evaluate(() => game.messages.size)).toBe(1);
  await page.getByRole("button", { name: "Jack in", exact: true }).click();
  await expect(page.locator(".cb-board")).toHaveCount(1);
  await expect(page.locator(".cb-time")).toHaveText("49.0s");
  await page.evaluate(() => document.querySelector(".message-content button").click());
  await expect(page.locator(".cb-board")).toHaveCount(1);
  await page.clock.runFor(1000);
  await expect(page.locator(".cb-time")).toHaveText("48.0s");
  await page.getByRole("button", { name: "Jack out", exact: true }).click();
  await expect.poll(() => page.evaluate(() => game.messages.size)).toBe(2);
  const report = await page.evaluate(() => {
    const message = [...game.messages.values()].at(-1);
    const root = document.createElement("div");
    root.className = "message-content";
    Hooks.call("renderChatMessage", message, root);
    return { author: message.author.id, whisper: message.whisper, text: root.textContent };
  });
  expect(report.author).toBe("runner");
  expect(report.whisper).toEqual(["runner", "gm", "gm2"]);
  expect(report.text).toContain("Not reached: Password");
  expect(report.text).toContain("0/3");
  expect(report.text).not.toContain("Player report");
  expect(report.text).not.toContain("adjudication");
  expect(report.text).not.toContain("Interface");
  expect(report.text).not.toContain("Enemy runner");
  const forged = await page.evaluate(() => {
    const message = [...game.messages.values()].at(-1);
    const root = document.createElement("div");
    root.className = "message-content";
    Hooks.call("renderChatMessage", { ...message, author: game.users.get("other") }, root);
    return root.textContent;
  });
  expect(forged).toContain("Invalid or unavailable Cipher Breach data");
  expect(forged).not.toContain("Not reached: Password");
});

test("invitations render as short GM and runner messages, including older chat content", async ({ page }) => {
  await mockFoundry(page);
  const messages = await page.evaluate(async () => {
    const message = await game.modules.get("foundry-cipher-breach").api.start({ user: "runner" });
    const render = () => {
      const root = document.createElement("div");
      root.className = "message-content";
      root.textContent = "Old verbose invitation text";
      Hooks.call("renderChatMessage", message, [root]);
      return root.textContent;
    };
    const gm = render();
    game.user = game.users.get("runner");
    const runner = render();
    return { gm, runner };
  });
  expect(messages.gm).toContain("Breach invitation for: Runner");
  expect(messages.runner).toContain("Hey, choom");
  expect(messages.runner).toContain("Jack in");
  expect(messages.gm).not.toContain("Old verbose");
  expect(messages.runner).not.toContain("Old verbose");
});

test("missing character role defaults to Interface 0 and the GM can override it", async ({ page }) => {
  await mockFoundry(page);
  const ranks = await page.evaluate(async () => {
    const api = game.modules.get("foundry-cipher-breach").api;
    const fallback = await api.start({ user: "other", targetCount: 1 });
    const overridden = await api.start({ user: "other", rank: 6, targetCount: 1 });
    return [fallback, overridden].map(message => message.getFlag("foundry-cipher-breach", "challenge").config.rank);
  });
  expect(ranks).toEqual([0, 6]);
  await page.evaluate(() => game.modules.get("foundry-cipher-breach").api.open());
  await page.locator('[name="participant"]').selectOption("other");
  await expect(page.locator('[name="rank"]')).toHaveValue("0");
  await expect(page.locator(".cb-config")).toContainText("No Netrunner role found");
  await page.locator('[name="rank"]').fill("6");
  await page.locator('[type="submit"]').click();
  await expect.poll(() => page.evaluate(() => [...game.messages.values()].at(-1)
    .getFlag("foundry-cipher-breach", "challenge").config.rank)).toBe(6);
});

for (const lang of ["de", "en"]) {
  test(`compact results show only objectives and actual trace outcome in ${lang}`, async ({ page }) => {
    await page.goto(`/preview/?lang=${lang}`);
    const reports = await page.evaluate(async language => {
      const { resultCard } = await import("/scripts/ui.mjs");
      const { generateChallenge } = await import("/scripts/engine.mjs");
      const { breachConfig } = await import("/scripts/mechanics.mjs");
      const strings = (await (await fetch(`/lang/${language}.json`)).json()).CB;
      const t = key => strings[key];
      const challenge = generateChallenge(breachConfig({ enemyRunners: 1 }), { names: ["A", "B", "C"] }).challenge;
      const result = { outcome: "jacked-out", matched: [true, false, false] };
      return {
        escaped: resultCard(challenge, result, { t }).textContent,
        detected: resultCard(challenge, { ...result, outcome: "timeout" }, { t }).textContent,
        noRunner: resultCard({ ...challenge, config: { ...challenge.config, enemyRunners: 0 } }, {
          ...result, outcome: "timeout", matched: [false, false, false]
        }, { t }).textContent
      };
    }, lang);
    expect(reports.escaped).toContain(lang === "de" ? "Hack nicht erkannt" : "hack not detected");
    expect(reports.detected).toContain(lang === "de" ? "Hack erkannt" : "hack detected");
    expect(reports.noRunner).not.toContain(lang === "de" ? "Gegnerischer Runner" : "Enemy runner");
    expect(reports.noRunner).not.toContain("ICE");
    expect(reports.escaped).not.toContain("DV");
    expect(reports.escaped).not.toContain("Interface");
    expect(reports.escaped).toContain("A");
    expect(reports.escaped).toContain("B");
    expect(reports.escaped).toContain("C");
  });
}

test("Foundry report fails closed if the source is removed, and forged invitations do not open", async ({ page }) => {
  await mockFoundry(page);
  await page.evaluate(async () => {
    const message = await game.modules.get("foundry-cipher-breach").api.start({ user: "runner" });
    game.user = game.users.get("runner");
    const root = document.createElement("div");
    root.className = "message-content";
    document.body.append(root);
    Hooks.call("renderChatMessage", { ...message, author: game.users.get("other") }, root);
    window.forgedInvitation = root.textContent;
    Hooks.call("renderChatMessage", message, root);
    window.challengeMessage = message;
  });
  expect(await page.evaluate(() => window.forgedInvitation)).toContain("Invalid or unavailable");
  await page.getByRole("button", { name: "Jack in", exact: true }).click();
  await page.evaluate(() => game.messages.delete(window.challengeMessage.id));
  await page.getByRole("button", { name: "Jack out", exact: true }).click();
  await expect(page.locator(".cb-board")).toHaveCount(0);
  expect(await page.evaluate(() => game.messages.size)).toBe(0);
  expect(await page.evaluate(() => window.notices.length)).toBe(1);
});

test("mobile layout remains within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/");
  await page.locator("#open").click();
  await page.locator('[name="dv"]').selectOption("20");
  await startPreview(page);
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
  await expect(page.locator(".cb-config .cb-metadata")).toContainText("4.1s");
  await startPreview(page);
  await expect(page.locator(".cb-cell")).toHaveCount(64);
  await page.clock.runFor(4200);
  await expect(page.locator("#results .cb-report")).toContainText("Nicht erreicht");
  await expect(page.locator("#results .cb-report")).not.toContainText("Puffer");
  await expect(page.locator("#results .cb-report")).toHaveCount(1);
  await expect(page.locator(".cb-jack")).toBeEnabled();
});

test("compact hack monitor omits helper controls and keeps noise active, respecting reduced motion", async ({ page }) => {
  await page.clock.install();
  await page.goto("/preview/?lang=en");
  await page.locator("#open").click();
  await startPreview(page);
  const board = page.locator(".cb-board");
  const animation = () => page.locator(".cb-matrix").evaluate(node => getComputedStyle(node, "::after").animationName);
  await expect(board.locator("button:not(.cb-cell)")).toHaveCount(1);
  await expect(board.locator(".cb-close, .cb-board-meta")).toHaveCount(0);
  await expect(board.locator("header")).not.toContainText("Interface");
  await expect(board.locator("header")).not.toContainText("DV");
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
  expect(await animation()).toBe("cb-signal-tear");
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
  await page.locator(".cb-jack").click();
  await page.evaluate(() => window.openTestBoard());
  const solution = await page.evaluate(() => window.generated.solutions[0]);
  for (const cell of solution) await page.locator(".cb-cell").nth(cell.row * 8 + cell.col).click();
  await expect.poll(() => page.evaluate(() => window.reports.length)).toBe(2);
  expect(await page.evaluate(() => window.reports[1].matched.filter(Boolean).length)).toBe(1);
  await expect(page.locator(".cb-matched")).toHaveCount(1);
  await expect(page.locator(".cb-status")).toContainText("Buffer full");
});

for (const [dv, seconds] of [[18, 5], [20, 4.1]]) {
  test(`single-objective DV${dv} Interface zero has a short clock and a three-code trap`, async ({ page }) => {
    await page.clock.install();
    await page.goto("/preview/?lang=en");
    await page.locator("#open").click();
    await page.locator('[name="dv"]').selectOption(String(dv));
    await page.locator('[name="participant"]').selectOption("demo0");
    await page.locator('[name="targetCount"]').selectOption("1");
    await expect(page.locator(".cb-config .cb-metadata")).toContainText(`${seconds}s`);
    await page.locator(".cb-close").click();
    await page.evaluate(async difficulty => {
      const { generateChallenge, replayResult } = await import("/scripts/engine.mjs");
      const { breachConfig } = await import("/scripts/mechanics.mjs");
      const { openBoard } = await import("/scripts/ui.mjs");
      const strings = (await (await fetch("/lang/en.json")).json()).CB;
      window.generated = generateChallenge(breachConfig({ dv: difficulty, rank: 0, targetCount: 1 }));
      window.reports = [];
      window.openTestBoard = () => openBoard(window.generated.challenge, {
        t: key => strings[key],
        onSubmit: async result => window.reports.push(replayResult(window.generated.challenge, result))
      });
      window.openTestBoard();
    }, dv);
    await expect(page.locator(".cb-time")).toHaveText(`${seconds.toFixed(1)}s`);
    await expect(page.locator(".cb-targets li")).toHaveCount(1);
    const trap = await page.evaluate(() => window.generated.decoyPaths[0]);
    for (const cell of trap) await page.locator(".cb-cell").nth(cell.row * 8 + cell.col).click();
    await expect(page.locator(".cb-progress")).toHaveCount(3);
    await page.locator(".cb-cell:enabled").first().click();
    await expect(page.locator(".cb-status")).toContainText("Buffer full");
    expect(await page.evaluate(() => window.reports[0].matched)).toEqual([false]);
    await page.locator(".cb-jack").click();
    await page.evaluate(() => window.openTestBoard());
    const solution = await page.evaluate(() => window.generated.solutions[0]);
    for (const cell of solution) await page.locator(".cb-cell").nth(cell.row * 8 + cell.col).click();
    expect(await page.evaluate(() => window.reports[1].outcome)).toBe("won");
    await page.locator(".cb-jack").click();
    await page.evaluate(() => window.openTestBoard());
    await page.clock.runFor(Math.ceil(seconds * 1000 / 200) * 200);
    await expect(page.locator(".cb-status")).toContainText("Time limit reached");
    expect(await page.evaluate(() => window.reports[2].elapsedMs)).toBe(seconds * 1000);
  });
}

test("red terminal arranges timer and buffer above matrix and upload targets", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/preview/");
  await page.locator("#open").click();
  await page.locator('[name="dv"]').selectOption("20");
  await expect(page.locator(".cb-config")).toContainText("höchstens eines von drei Vierer-Zielen");
  await startPreview(page);
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

for (const lang of ["de", "en"]) {
  test(`GM modifiers stack exactly, persist in reports and show a timed hostile trace in ${lang}`, async ({ page }) => {
    await page.clock.install();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/preview/?lang=${lang}`);
    await page.locator("#open").click();
    expect(await page.locator('[name="dv"] option').evaluateAll(nodes => nodes.map(node => node.value))).toEqual(
      ["6", "8", "10", "12", "14", "16", "18", "20"]);
    for (const key of ["repeatedFailures", "pressureConditions", "enemyRunners"]) {
      await expect(page.locator(`[name="${key}"]`)).toHaveValue("0");
    }
    await page.locator('[name="dv"]').selectOption("12");
    await page.locator('[name="repeatedFailures"]').fill("2");
    await page.locator('[name="pressureConditions"]').fill("2");
    await page.locator('[name="enemyRunners"]').fill("1");
    await expect(page.locator(".cb-config .cb-metadata")).toContainText("12 + 9 = 21");
    const seconds = await page.evaluate(async () => {
      const { breachConfig } = await import("/scripts/mechanics.mjs");
      return breachConfig({ dv: 12, rank: 4, repeatedFailures: 2, pressureConditions: 2, enemyRunners: 1 }).seconds;
    });
    await expect(page.locator(".cb-config .cb-metadata")).toContainText(`${seconds}s`);
    await startPreview(page);
    await expect(page.locator(".cb-counterhack")).toBeVisible();
    await expect(page.locator(".cb-board-meta")).toHaveCount(0);
    const matrix = await page.locator(".cb-cell").allTextContents();
    await page.clock.runFor(Math.ceil(seconds * 500 / 200) * 200);
    await expect(page.locator(".cb-traced")).toHaveCount(2);
    expect(await page.locator(".cb-cell").allTextContents()).toEqual(matrix);
    const bounds = await page.locator(".cb-board").evaluate(node => node.scrollWidth <= node.clientWidth);
    expect(bounds).toBe(true);
    await page.clock.runFor(Math.ceil(seconds * 1000 / 200) * 200);
    await expect(page.locator(".cb-traced")).toHaveCount(4);
    await expect(page.locator(".cb-signal-lost")).toBeVisible();
    await expect(page.locator("#results .cb-report")).toHaveCount(1);
    await expect(page.locator("#results .cb-report")).toContainText(lang === "de" ? "Hack erkannt" : "hack detected");
    await expect(page.locator("#results .cb-report")).not.toContainText("DV");
    await page.locator(".cb-jack").click();
    await page.locator("#open").click();
    await expect(page.locator('[name="repeatedFailures"]')).toHaveValue("0");
    await page.locator('[name="repeatedFailures"]').fill("1.5");
    await expect(page.locator(".cb-config .cb-error")).not.toBeEmpty();
    await page.locator('[name="repeatedFailures"]').fill("0");
    await expect(page.locator(".cb-config .cb-error")).toBeEmpty();
    await startPreview(page);
    await expect(page.locator(".cb-counterhack")).toHaveCount(0);
  });
}

test("Foundry API applies manual retry, pressure and opponent modifiers without changing old invitations", async ({ page }) => {
  await mockFoundry(page);
  const configs = await page.evaluate(async () => {
    const api = game.modules.get("foundry-cipher-breach").api;
    const first = await api.start({ user: "runner", dv: 14, targetCount: 1 });
    const retry = await api.start({
      user: "runner", dv: 14, targetCount: 1, repeatedFailures: 1, pressureConditions: 2, enemyRunners: 1
    });
    return [first.getFlag("foundry-cipher-breach", "challenge"), retry.getFlag("foundry-cipher-breach", "challenge")];
  });
  expect(configs[0].config.effectiveDV).toBe(14);
  expect(configs[1].config.effectiveDV).toBe(22);
  expect(configs[1].config.repeatedFailures).toBe(1);
  expect(configs[1].config.pressureConditions).toBe(2);
  expect(configs[1].config.enemyRunners).toBe(1);
  expect(configs[1].config.seconds).toBeLessThan(configs[0].config.seconds);
  expect(configs[0].names).toHaveLength(1);
  expect(configs[1].names).toHaveLength(1);
  expect(configs[1].id).not.toBe(configs[0].id);
  expect(configs[1].matrix).not.toEqual(configs[0].matrix);
});

test("winning stops the hostile trace without losing the achieved objective later", async ({ page }) => {
  await page.clock.install();
  await page.goto("/preview/?lang=en");
  await page.evaluate(async () => {
    const { breachConfig } = await import("/scripts/mechanics.mjs");
    const { generateChallenge } = await import("/scripts/engine.mjs");
    const { openBoard } = await import("/scripts/ui.mjs");
    const strings = (await (await fetch("/lang/en.json")).json()).CB;
    window.generated = generateChallenge(breachConfig({ dv: 6, rank: 4, targetCount: 1, enemyRunners: 1 }));
    window.reports = [];
    openBoard(window.generated.challenge, { t: key => strings[key], onSubmit: async result => window.reports.push(result) });
  });
  await page.clock.runFor(10000);
  const solution = await page.evaluate(() => window.generated.solution);
  for (const cell of solution) {
    if (await page.locator(".cb-board.cb-ended").count()) break;
    await page.locator(".cb-cell").nth(cell.row * 6 + cell.col).click();
  }
  await expect(page.locator(".cb-status")).toContainText("All targets matched");
  const trace = await page.locator(".cb-counterhack progress").evaluate(node => node.value);
  await page.clock.runFor(60000);
  expect(await page.locator(".cb-counterhack progress").evaluate(node => node.value)).toBe(trace);
  expect(await page.evaluate(() => window.reports.map(result => result.outcome))).toEqual(["won"]);
});

for (const lang of ["de", "en"]) {
  test(`timeout disrupts only the matrix signal in ${lang}, including reduced motion`, async ({ page }) => {
    await page.clock.install();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/preview/?lang=${lang}`);
    await page.locator("#open").click();
    await startPreview(page);
    const signal = page.locator(".cb-signal-lost");
    await expect(signal).toBeHidden();
    await page.clock.runFor(39000);
    await expect(page.locator(".cb-board")).toHaveClass(/cb-timeout/);
    await expect(signal).toBeVisible();
    await expect(signal).toContainText(lang === "de" ? "Vom System getrennt" : "Ejected from system");
    await expect(signal).toHaveAttribute("aria-hidden", "true");
    expect(await signal.evaluate(node => getComputedStyle(node).pointerEvents)).toBe("none");
    const effects = () => page.locator(".cb-matrix").evaluate(node => ({
      noise: getComputedStyle(node, "::before").animationName,
      tear: getComputedStyle(node, "::after").animationName,
      bounded: node.scrollWidth <= node.clientWidth
    }));
    expect(await effects()).toEqual({ noise: "cb-signal-noise", tear: "cb-signal-tear", bounded: true });
    await expect(page.locator(".cb-cell:enabled")).toHaveCount(0);
    await expect(page.locator("#results .cb-report")).toHaveCount(1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await effects()).toEqual({ noise: "none", tear: "none", bounded: true });
    await expect(signal).toBeVisible();
    await expect(page.locator(".cb-jack")).toBeEnabled();
    await page.locator(".cb-jack").click();
    await expect(page.locator(".cb-board")).toHaveCount(0);
  });

  test(`objective symbols follow ${lang} names and custom names remain safe`, async ({ page }) => {
    await page.goto(`/preview/?lang=${lang}`);
    await page.locator("#open").click();
    await startPreview(page);
    const icons = page.locator(".cb-target-icon");
    await expect(icons).toHaveCount(3);
    for (const [index, type] of ["password", "data", "control"].entries()) {
      await expect(icons.nth(index)).toHaveAttribute("data-objective", type);
      await expect(icons.nth(index)).toHaveAttribute("aria-hidden", "true");
      await expect(icons.nth(index)).toHaveAttribute("focusable", "false");
      expect(await icons.nth(index).evaluate(node => node.getBoundingClientRect().width)).toBe(26);
    }
    await page.locator(".cb-jack").click();
    await page.locator("#open").click();
    await page.locator('[name="objective1"]').fill("<img src=x onerror=alert(1)>");
    await startPreview(page);
    await expect(icons.first()).toHaveAttribute("data-objective", "target");
    await expect(page.locator(".cb-targets strong").first()).toHaveText("<img src=x onerror=alert(1)>");
    await expect(page.locator(".cb-board img")).toHaveCount(0);
  });
}

test("GM symbol preview follows edited target text, prioritizes devices and never lacks an icon", async ({ page }) => {
  await page.goto("/preview/");
  await page.locator("#open").click();
  const name = page.locator('[name="objective1"]');
  const icon = page.locator(".cb-objective-preview .cb-target-icon").first();
  for (const [type, labels] of [
    ["camera", ["Control / Kameras ausschalten", "Surveillance feed"]],
    ["drone", ["Backdoor / Drohne übernehmen", "Drone uplink"]],
    ["turret", ["Geschütz deaktivieren", "Turret targeting"]],
    ["vehicle", ["Fahrzeug übernehmen", "Vehicle ignition"]],
    ["power", ["Stromversorgung abschalten", "Power generator"]],
    ["comms", ["Funk stören", "Satellite communications"]],
    ["implant", ["Cyberware manipulieren", "Neural implant"]],
    ["finance", ["Konto leeren", "Credit transfer"]],
    ["security", ["ICE umgehen", "Firewall disable"]],
    ["sensor", ["Ortung abschalten", "Radar scanner"]],
    ["password", ["Passwort entschlüsseln", "Decrypt encryption"]],
    ["door", ["Tür öffnen", "Access gate"]],
    ["data", ["Archiv auslesen", "Data storage"]],
    ["control", ["Netzwerk übernehmen", "Control node"]],
    ["target", ["Unbekanntes Ziel", "Unknown objective", ""]]
  ]) {
    for (const label of labels) {
      await name.fill(label);
      await expect(icon).toHaveAttribute("data-objective", type);
      await expect(icon.locator("path")).toHaveAttribute("d", /.+/);
    }
  }
  await name.fill("Control / Kameras ausschalten");
  await startPreview(page);
  await expect(page.locator(".cb-target-icon").first()).toHaveAttribute("data-objective", "camera");
});

for (const outcome of ["won", "full-buffer", "dead-end", "jacked-out"]) {
  test(`${outcome} shows the same terminal interference without claiming a forced ejection`, async ({ page }) => {
    await page.goto("/preview/?lang=en");
    await page.evaluate(async ending => {
      const { generateChallenge } = await import("/scripts/engine.mjs");
      const { openBoard } = await import("/scripts/ui.mjs");
      const strings = (await (await fetch("/lang/en.json")).json()).CB;
      const challenge = generateChallenge({
        size: 4, buffer: ending === "full-buffer" ? 8 : 14, targetCount: 1, sequenceLength: 2, seconds: 60
      }).challenge;
      challenge.matrix = challenge.matrix.map(row => row.map(() => "0A"));
      challenge.targets = [ending === "won" ? ["0A", "0A"] : ["5D", "5D"]];
      window.reports = [];
      const board = openBoard(challenge, { t: key => strings[key], onSubmit: async result => window.reports.push(result) });
      if (ending === "jacked-out") {
        // Inspect the finished frame immediately before its normal close removes it.
        const close = board.close.bind(board);
        board.close = () => {
          window.finalSignal = {
            visible: getComputedStyle(board.querySelector(".cb-signal-lost")).display,
            animation: getComputedStyle(board.querySelector(".cb-matrix"), "::after").animationName
          };
          close();
        };
      }
    }, outcome);
    if (outcome === "jacked-out") {
      await page.locator(".cb-jack").click();
      expect(await page.evaluate(() => window.finalSignal)).toEqual({ visible: "grid", animation: "cb-signal-tear" });
      await expect(page.locator(".cb-board")).toHaveCount(0);
    } else {
      const moves = outcome === "won" ? [[0, 0], [1, 0]] :
        [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2], [1, 2], [1, 3], [0, 3]];
      for (const [row, col] of moves) await page.locator(".cb-cell").nth(row * 4 + col).click();
      await expect(page.locator(".cb-signal-lost")).toBeVisible();
      await expect(page.locator(".cb-signal-lost")).toContainText("Connection closed");
      await expect(page.locator(".cb-signal-lost")).not.toContainText("Ejected");
      expect(await page.locator(".cb-matrix").evaluate(node => getComputedStyle(node, "::after").animationName)).toBe("cb-signal-tear");
      await expect(page.locator(".cb-jack")).toBeEnabled();
    }
    expect(await page.evaluate(() => window.reports.map(result => result.outcome))).toEqual([outcome]);
  });
}

for (const action of ["jack", "escape"]) {
  test(`${action} closes a running board and reports the partial run once`, async ({ page }) => {
    await page.clock.install();
    await page.goto("/preview/");
    await page.locator("#open").click();
    await startPreview(page);
    await page.locator(".cb-cell:enabled").first().click();
    await page.clock.runFor(1000);
    if (action === "jack") await page.locator(".cb-jack").click();
    else await page.keyboard.press("Escape");
    await expect(page.locator(".cb-board")).toHaveCount(0);
    await expect(page.locator("#results .cb-report")).toHaveCount(1);
    await expect(page.locator("#results .cb-report")).toContainText("Nicht erreicht");
    await expect(page.locator("#results .cb-report")).not.toContainText("Puffer");
    await page.clock.runFor(40000);
    await expect(page.locator("#results .cb-report")).toHaveCount(1);
  });
}

test("jack out closes during a pending timeout report without changing or duplicating it", async ({ page }) => {
  await page.clock.install();
  await page.goto("/preview/?lang=en");
  await page.evaluate(async () => {
    const { generateChallenge } = await import("/scripts/engine.mjs");
    const { breachConfig } = await import("/scripts/mechanics.mjs");
    const { openBoard } = await import("/scripts/ui.mjs");
    const strings = (await (await fetch("/lang/en.json")).json()).CB;
    window.reports = [];
    openBoard(generateChallenge(breachConfig()).challenge, {
      t: key => strings[key],
      onSubmit: async result => {
        window.reports.push(result);
        await new Promise(resolve => { window.finishReport = resolve; });
      }
    });
  });
  await page.clock.runFor(39000);
  await expect(page.locator(".cb-jack")).toBeEnabled();
  await page.locator(".cb-jack").click();
  await expect(page.locator(".cb-board")).toHaveCount(0);
  await page.evaluate(() => window.finishReport());
  await page.clock.runFor(2000);
  expect(await page.evaluate(() => window.reports.map(result => result.outcome))).toEqual(["timeout"]);
});

test("virtual data landscape is decorative, bounded and respects reduced motion", async ({ page }) => {
  await page.goto("/preview/");
  await page.locator("#open").click();
  await startPreview(page);
  await expect(page.locator(".cb-datafield")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".cb-datastream")).toHaveCount(7);
  await expect(page.locator(".cb-datastream").first()).toContainText("hash[");
  const decoration = await page.locator(".cb-datafield").evaluate(node => ({
    events: getComputedStyle(node).pointerEvents,
    overflow: getComputedStyle(node).overflow,
    focusable: node.querySelectorAll("button, input, a, [tabindex]").length,
    animation: getComputedStyle(node.querySelector(".cb-datastream")).animationName
  }));
  expect(decoration).toEqual({ events: "none", overflow: "hidden", focusable: 0, animation: "cb-data-drift" });
  await page.locator(".cb-cell:enabled").first().click();
  await expect(page.locator(".cb-buffer .cb-filled")).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.locator(".cb-datastream").first().evaluate(node => getComputedStyle(node).animationName)).toBe("none");
});
