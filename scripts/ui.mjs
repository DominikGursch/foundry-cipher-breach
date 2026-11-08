import { Puzzle, generateChallenge, legalCells } from "./engine.mjs";
import { breachConfig, DIFFICULTIES, difficultyPreset } from "./mechanics.mjs";

export function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  for (const [key, value] of Object.entries(options.attributes ?? {})) {
    node.setAttribute(key, String(value));
  }
  for (const child of children) node.append(child);
  return node;
}

function button(text, action, className = "") {
  const node = element("button", { text, className, attributes: { type: "button" } });
  node.addEventListener("click", action);
  return node;
}

function dialog(title, t) {
  const root = element("dialog", { className: "cipher-breach", attributes: { "aria-label": title } });
  const heading = element("h2", { text: title });
  const close = button(t("close"), () => root.close(), "cb-close");
  const header = element("header", {}, [
    element("span", { className: "cb-wordmark", text: "CB / 01" }), heading, close
  ]);
  root.append(header);
  root.addEventListener("close", () => root.remove(), { once: true });
  document.body.append(root);
  root.showModal();
  return root;
}

function objectiveIcon(name) {
  const label = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const categories = [
    ["camera", /kamera|camera|cctv|uberwachung|surveillance/],
    ["drone", /drohne|drone|robot|android|bot\b/],
    ["turret", /geschutz|turret|waffe|weapon|munition/],
    ["vehicle", /fahrzeug|vehicle|auto\b|car\b|motorrad|motorcycle/],
    ["power", /strom|power|energie|energy|generator|reaktor|reactor|beleuchtung|light/],
    ["comms", /funk|radio|comm|kommunikation|signal|satellit|satellite|antenne|antenna/],
    ["implant", /implant|cyberware|neural|biometr|biometric|medizin|medical/],
    ["finance", /konto|account|credit|kredit|bank|zahlung|payment|eddies|wallet/],
    ["security", /firewall|\bice\b|alarm|sicherheit|security|schutz|defen[cs]e/],
    ["sensor", /sensor|radar|scanner|scan\b|ortung|tracking/],
    ["password", /backdoor|password|passwort|verschlussel|encrypt|decrypt|chiffre|cipher/],
    ["door", /tur\b|turen|turschloss|door|schleuse|\bgate\b|zugang|\baccess\b(?!\s+(?:node|point))|aufzug|elevator/],
    ["data", /eye-dee|daten|data|datei|file|archiv|archive|speicher|storage|server/],
    ["control", /control|steuer|knoten|node|netzwerk|network|terminal|access point/]
  ];
  const type = categories.find(([, pattern]) => pattern.test(label))?.[0] ?? "target";
  const paths = {
    password: "M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4zM12 14v4",
    data: "M4 3h16v18H4zM8 7h8M8 11h8M8 15h3M14 15h2M8 18h8",
    control: "M9 9h6v6H9zM12 2v7M12 15v7M2 12h7M15 12h7M9 2h6M9 22h6M2 9v6M22 9v6",
    camera: "M3 5h12l3 7H6zM18 7l3-2v8l-3-2M9 12v6H4M7 18v3",
    drone: "M9 9h6v6H9zM9 9L5 5M15 9l4-4M9 15l-4 4M15 15l4 4M2 3h6v4H2zM16 3h6v4h-6zM2 17h6v4H2zM16 17h6v4h-6z",
    turret: "M5 13h12v5H5zM11 13V8h10V5H8v8M8 18l-3 4M14 18l3 4M3 22h16",
    vehicle: "M4 10l3-6h10l3 6M3 10h18v8H3zM5 18v3h3v-3M16 18v3h3v-3M6 13h3M15 13h3",
    power: "M13 2L4 14h7l-1 8 10-13h-7z",
    comms: "M12 9v13M7 22h10M9 9a3 3 0 1 1 6 0a3 3 0 1 1-6 0M6 4a8 8 0 0 0 0 10M18 4a8 8 0 0 1 0 10M3 1a12 12 0 0 0 0 16M21 1a12 12 0 0 1 0 16",
    implant: "M7 3h10v5h4v8h-4v5H7v-5H3V8h4zM7 12h3l2-4 2 8 2-4h2",
    finance: "M3 5h18v14H3zM3 9h18M6 15h4M15 12v5M13 13h4v3h-4",
    security: "M12 2l9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6zM7 12l3 3 7-7",
    sensor: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l8-8M12 10v4M10 12h4",
    door: "M4 22V2h15v20M8 22V5l8-2v19M12 13h1M2 22h20",
    target: "M12 2v4M12 18v4M2 12h4M18 12h4M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12M10 12h4"
  };
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("class", "cb-target-icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  icon.setAttribute("data-objective", type);
  const path = document.createElementNS(icon.namespaceURI, "path");
  path.setAttribute("d", paths[type]);
  icon.append(path);
  return icon;
}

export function openBoard(challenge, { t, onSubmit = null, onError = console.error } = {}) {
  const puzzle = new Puzzle(challenge);
  const root = dialog("Cipher Breach", t);
  root.classList.add("cb-board");
  const datafield = element("div", { className: "cb-datafield", attributes: { "aria-hidden": "true" } });
  for (let index = 0; index < 7; index++) {
    const fragments = Array.from({ length: 22 }, (_, row) => {
      const address = ((index + 1) * 4099 + row * 137).toString(16).toUpperCase().padStart(6, "0");
      return `${address}  ${((row * 31 + index * 17) % 256).toString(2).padStart(8, "0")}\n${row % 2 ? "xor" : "hash"}[${address.slice(-3)}] >> ${row % 7}`;
    }).join("\n");
    datafield.append(element("span", {
      className: "cb-datastream", text: fragments,
      attributes: { style: `--cb-stream:${index}` }
    }));
  }
  datafield.append(element("div", { className: "cb-network" }), element("div", { className: "cb-frame-traces" }));
  root.prepend(datafield);
  const config = puzzle.challenge.config;
  const header = root.querySelector("header");
  header.querySelector(".cb-wordmark").remove();
  header.querySelector("h2").textContent = t("floorBreach");
  header.querySelector(".cb-close").remove();
  const status = element("p", { className: "cb-status", attributes: { role: "status", "aria-live": "polite" } });
  const time = element("strong", { className: "cb-time" });
  const timeBar = element("progress", { attributes: { max: config.seconds, value: config.seconds, "aria-label": t("time") } });
  const buffer = element("ol", { className: "cb-buffer", attributes: { "aria-label": t("buffer") } });
  const bufferCount = element("small");
  root.append(element("div", { className: "cb-metrics" }, [
    element("section", { className: "cb-telemetry" }, [
      element("h3", { text: t("time") }), time, timeBar
    ]),
    element("section", { className: "cb-buffer-panel" }, [
      element("h3", {}, [element("span", { text: t("buffer") }), bufferCount]), buffer
    ])
  ]));
  const rivalTokens = [];
  const rivalProgress = element("progress", { attributes: { max: 100, value: 0, "aria-label": t("counterhack") } });
  if (config.balance === 3 && config.enemyRunners > 0) {
    const trace = element("ol", { className: "cb-rival-buffer", attributes: { "aria-hidden": "true" } },
      Array.from({ length: 4 }, () => {
        const token = element("li", { text: "\u00b7" });
        rivalTokens.push(token);
        return token;
      }));
    root.querySelector(".cb-buffer-panel").append(element("div", { className: "cb-counterhack" }, [
      element("strong", { text: `${t("counterhack")} / ${config.enemyRunners}` }), trace, rivalProgress
    ]));
  }
  const axis = element("p", { className: "cb-axis" });
  const grid = element("div", {
    className: "cb-matrix",
    attributes: { role: "group", "aria-label": t("matrix"), style: `--cb-size:${puzzle.challenge.config.size}` }
  });
  const cells = puzzle.challenge.matrix.map((row, rowIndex) => row.map((code, colIndex) => {
    const cell = button(code, () => {
      try {
        puzzle.select(rowIndex, colIndex);
        refresh();
        const next = cells.flat().find(candidate => !candidate.disabled);
        if (next) next.focus();
        else jack.focus();
      } catch (error) {
        status.textContent = t("invalidMove");
        onError(error);
      }
    }, "cb-cell");
    cell.setAttribute("aria-label", `${t("row")} ${rowIndex + 1}, ${t("column")} ${colIndex + 1}: ${code}`);
    cell.addEventListener("pointerenter", () => highlight(code));
    cell.addEventListener("focus", () => highlight(code));
    cell.addEventListener("pointerleave", () => highlight(null));
    cell.addEventListener("blur", () => highlight(null));
    grid.append(cell);
    return cell;
  }));
  const signalText = element("strong", { text: t("ended") });
  const signalCode = element("small", { text: "NET / LINK_CLOSED" });
  grid.append(element("div", {
    className: "cb-signal-lost", attributes: { "aria-hidden": "true" }
  }, [signalText, signalCode]));
  const targets = element("ol", { className: "cb-targets" });
  const targetNodes = puzzle.challenge.targets.map((sequence, index) => {
    const name = puzzle.challenge.names?.[index] ?? `${t("objective")} ${index + 1}`;
    const node = element("li");
    node.append(
      element("div", { className: "cb-sequence" }, sequence.map(code => element("code", { text: code }))),
      element("div", { className: "cb-target-label" }, [
        objectiveIcon(name),
        element("strong", { text: name })
      ]),
      element("span", { className: "cb-target-status" })
    );
    targets.append(node);
    return node;
  });
  const objectives = element("section", { className: "cb-objectives" }, [
      element("h3", { text: t("uploadTargets") }), targets
  ]);
  root.append(element("div", { className: "cb-workspace" }, [
    element("section", { className: "cb-matrix-panel" }, [element("h3", { text: t("matrix") }), grid, axis]),
    objectives
  ]));
  const errorNode = element("p", { className: "cb-error", attributes: { role: "alert" } });
  const jack = button(t("jackOut"), () => {
    try {
      if (["ready", "running"].includes(puzzle.tick())) {
        puzzle.jackOut();
      } else if (sendFailed) void sendResult();
      refresh();
    } catch (error) {
      fail(error);
    }
    root.close();
  }, "cb-jack");
  async function sendResult() {
    if (submitted || submitting) return;
    submitting = true;
    sendFailed = false;
    errorNode.textContent = "";
    try {
      await onSubmit(puzzle.result());
      submitted = true;
    } catch (error) {
      sendFailed = true;
      fail(error);
    } finally {
      submitting = false;
      refresh();
    }
  }
  objectives.append(status, errorNode, element("footer", {}, [jack]));
  let submitted = false;
  let submitting = false;
  let sendFailed = false;
  let autoAttempted = false;
  let hovered = null;
  function progress(sequence) {
    const codes = puzzle.moves.map(cell => puzzle.challenge.matrix[cell.row][cell.col]);
    for (let length = Math.min(sequence.length, codes.length); length > 0; length--) {
      if (sequence.slice(0, length).every((code, index) => code === codes[codes.length - length + index])) return length;
    }
    return 0;
  }
  function highlight(code) {
    hovered = code;
    targetNodes.forEach(node => node.querySelectorAll("code").forEach(token =>
      token.classList.toggle("cb-highlight", token.classList.contains("cb-next") && token.textContent === hovered)));
  }
  function fail(error) {
    errorNode.textContent = t("error");
    onError(error);
  }
  function refresh() {
    const currentStatus = puzzle.tick();
    const ended = !["ready", "running"].includes(currentStatus);
    const remaining = Math.max(0, (config.seconds * 1000 - puzzle.elapsed()) / 1000);
    time.textContent = `${remaining.toFixed(1)}s`;
    timeBar.value = remaining;
    if (rivalTokens.length) {
      const traceProgress = Math.min(1, puzzle.elapsed() / (config.seconds * 1000));
      rivalProgress.value = traceProgress * 100;
      rivalTokens.forEach((token, index) => {
        const traced = index < Math.floor(traceProgress * rivalTokens.length);
        token.textContent = traced ? ["7C", "AB", "CD", "FF"][index] : "\u00b7";
        token.classList.toggle("cb-traced", traced);
      });
    }
    time.setAttribute("aria-label", `${t("time")}: ${remaining}s`);
    axis.textContent = ended ? t("ended") : t(puzzle.moves.length % 2 === 0 ? "activeRow" : "activeColumn");
    const statusText = ended ? `${t(currentStatus)} ${t("targets")}: ${puzzle.matched.filter(Boolean).length}/${puzzle.matched.length}` : t(currentStatus);
    if (status.textContent !== statusText) status.textContent = statusText;
    status.hidden = !ended;
    root.classList.toggle("cb-ended", ended);
    root.classList.toggle("cb-failed", ended && !puzzle.matched.some(Boolean));
    root.classList.toggle("cb-critical", !ended && remaining <= 10);
    root.classList.toggle("cb-timeout", currentStatus === "timeout");
    signalText.textContent = t(currentStatus === "timeout" ? "systemEjected" : "ended");
    signalCode.textContent = currentStatus === "timeout" ? "ERR / NET_LINK_TERMINATED" : "NET / LINK_CLOSED";
    bufferCount.textContent = `${puzzle.moves.length}/${config.buffer}`;
    const legal = new Set(legalCells(puzzle.challenge.config.size, puzzle.moves).map(cell => `${cell.row}:${cell.col}`));
    for (let row = 0; row < cells.length; row++) {
      for (let col = 0; col < cells[row].length; col++) {
        const cell = cells[row][col];
        const visited = puzzle.moves.some(move => move.row === row && move.col === col);
        cell.disabled = ended || !legal.has(`${row}:${col}`);
        cell.classList.toggle("cb-visited", visited);
        cell.classList.toggle("cb-active", !ended && legal.has(`${row}:${col}`));
        cell.textContent = visited ? "[ ]" : puzzle.challenge.matrix[row][col];
        cell.setAttribute("aria-pressed", String(visited));
      }
    }
    buffer.replaceChildren(...Array.from({ length: puzzle.challenge.config.buffer }, (_, index) => {
      const move = puzzle.moves[index];
      return element("li", {
        text: move ? puzzle.challenge.matrix[move.row][move.col] : "\u00b7",
        className: move ? "cb-filled" : ""
      });
    }));
    targetNodes.forEach((node, index) => {
      node.classList.toggle("cb-matched", puzzle.matched[index]);
      node.classList.toggle("cb-missed", ended && !puzzle.matched[index]);
      const count = puzzle.matched[index] ? puzzle.challenge.targets[index].length : progress(puzzle.challenge.targets[index]);
      node.querySelectorAll("code").forEach((token, tokenIndex) => {
        token.classList.toggle("cb-progress", tokenIndex < count);
        token.classList.toggle("cb-next", !ended && !puzzle.matched[index] && tokenIndex === count);
      });
      node.lastChild.textContent = puzzle.matched[index] ? t("matched") : ended ? t("missed") : "";
    });
    highlight(hovered);
    if (ended && onSubmit && !autoAttempted) {
      autoAttempted = true;
      void sendResult();
    }
  }
  refresh();
  const interval = setInterval(() => {
    try { refresh(); } catch (error) { clearInterval(interval); fail(error); }
  }, 200);
  root.addEventListener("close", () => clearInterval(interval), { once: true });
  root.addEventListener("cancel", event => {
    event.preventDefault();
    jack.click();
  });
  return root;
}

export function openConfiguration({
  t, users = [], isGM = false, onLaunch = null, onError = console.error
}) {
  const root = dialog("Cipher Breach", t);
  const form = element("form", { className: "cb-config" });
  const dv = element("select", { attributes: { name: "dv" } }, Array.from({ length: 8 }, (_, index) => {
    const value = 6 + index * 2;
    return element("option", {
      text: `DV ${value}${DIFFICULTIES[value] ? ` / ${t(DIFFICULTIES[value])}` : ""}`, attributes: { value }
    });
  }));
  dv.value = "8";
  form.append(element("label", {}, [element("span", { text: t("dv") }), dv]));
  const modifiers = Object.fromEntries(["repeatedFailures", "pressureConditions", "enemyRunners"].map(key => {
    const input = element("input", { attributes: { name: key, type: "number", min: 0, max: 10, step: 1, required: "", value: 0 } });
    form.append(element("label", {}, [element("span", { text: t(key) }), input]));
    return [key, input];
  }));
  form.append(element("p", { className: "cb-note", text: t("modifierHint") }));
  const targetCount = element("select", { attributes: { name: "targetCount" } });
  form.append(element("label", {}, [element("span", { text: t("targetCount") }), targetCount]));
  const names = ["backdoor", "data", "control"].map((key, index) => element("input", {
    attributes: { name: `objective${index + 1}`, type: "text", maxlength: 120, value: t(key) }
  }));
  const nameLabels = names.map((input, index) => {
    const preview = element("span", { className: "cb-objective-preview" }, [objectiveIcon(input.value), input]);
    input.addEventListener("input", () => preview.firstChild.replaceWith(objectiveIcon(input.value)));
    return element("label", {}, [
      element("span", { text: `${t("objective")} ${index + 1}` }), preview
    ]);
  });
  form.append(...nameLabels);
  const participant = element("select");
  participant.name = "participant";
  if (isGM) {
    for (const user of users) {
      participant.append(element("option", { text: `${user.name}${user.active === false ? ` (${t("offline")})` : ""}`, attributes: { value: user.id } }));
    }
  }
  participant.append(element("option", { text: t("local"), attributes: { value: "" } }));
  form.append(element("label", {}, [element("span", { text: t("participant") }), participant]));
  const rank = element("input", { attributes: { name: "rank", type: "number", min: 0, max: 10, step: 1, required: "", value: 4 } });
  form.append(element("label", {}, [element("span", { text: t("rank") }), rank]));
  const rankNote = element("p", { className: "cb-note" });
  const derived = element("p", { className: "cb-metadata", attributes: { role: "status" } });
  form.append(rankNote, derived);
  const visibility = element("select", {}, [
    element("option", { text: t("private"), attributes: { value: "private" } }),
    element("option", { text: t("public"), attributes: { value: "public" } })
  ]);
  if (isGM) form.append(element("label", {}, [element("span", { text: t("visibility") }), visibility]));
  form.append(element("p", { className: "cb-note", text: t("configHint") }));
  const hardHint = element("p", { className: "cb-note", text: t("hardHint") });
  form.append(hardHint);
  const errorNode = element("p", { className: "cb-error", attributes: { role: "alert" } });
  function configuration() {
    return breachConfig({
      dv: Number(dv.value), rank: rank.value === "" ? NaN : Number(rank.value), targetCount: Number(targetCount.value),
      ...Object.fromEntries(Object.entries(modifiers).map(([key, input]) => [key, input.value === "" ? NaN : Number(input.value)]))
    });
  }
  function update() {
    try {
      const config = configuration();
      hardHint.hidden = config.effectiveDV < 16;
      nameLabels.forEach((label, index) => {
        label.hidden = index >= config.targetCount;
        names[index].required = index < config.targetCount;
      });
      derived.textContent = `${t("effectiveDV")}: ${config.dv} + ${config.effectiveDV - config.dv} = ${config.effectiveDV} / ${config.size} x ${config.size} / ${t("buffer")}: ${config.buffer} / ${config.seconds}s / ${t("targets")}: ${config.sequenceLengths.join(", ")}`;
      errorNode.textContent = "";
    } catch (error) {
      derived.textContent = "";
      errorNode.textContent = t("configError");
      onError(error);
    }
  }
  function selectDV() {
    const previous = Number(targetCount.value) || 3;
    let max;
    try {
      const effective = Number(dv.value) + Number(modifiers.repeatedFailures.value) +
        2 * Number(modifiers.pressureConditions.value) + 3 * Number(modifiers.enemyRunners.value);
      max = difficultyPreset(effective).lengths.length;
    } catch (error) {
      derived.textContent = "";
      errorNode.textContent = t("configError");
      onError(error);
      return;
    }
    targetCount.replaceChildren(...Array.from({ length: max }, (_, index) => element("option", {
      text: index + 1, attributes: { value: index + 1 }
    })));
    targetCount.value = String(Math.min(previous, max));
    update();
  }
  function selectParticipant() {
    const user = users.find(user => user.id === participant.value);
    rank.value = String(user ? user.rank ?? 0 : 4);
    rankNote.textContent = !user ? t("practiceRank") : user.rank === null || user.rank === undefined ? t("missingRank") : t("characterRank");
    update();
  }
  dv.addEventListener("change", selectDV);
  Object.values(modifiers).forEach(input => input.addEventListener("input", selectDV));
  targetCount.addEventListener("change", update);
  rank.addEventListener("input", update);
  participant.addEventListener("change", selectParticipant);
  selectDV();
  selectParticipant();
  const launch = element("button", { text: t("launch"), className: "cb-primary", attributes: { type: "submit" } });
  form.append(errorNode, launch);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    launch.disabled = true;
    try {
      const config = configuration();
      const objectives = names.slice(0, config.targetCount).map(input => input.value.trim());
      if (participant.value) {
        if (!isGM || !onLaunch) throw new Error("Only a GM can assign a breach.");
        await onLaunch(config, participant.value, visibility.value === "public", objectives);
      } else openBoard(generateChallenge(config, { names: objectives }).challenge, { t, onError });
      root.close();
    } catch (error) {
      errorNode.textContent = t("configError");
      onError(error);
      launch.disabled = false;
    }
  });
  root.append(form);
  return root;
}

export function resultCard(challenge, result, { t }) {
  return element("div", { className: "cb-report" }, [
    element("strong", { text: `${t("reportTitle")} / ${result.matched.filter(Boolean).length}/${result.matched.length}` }),
    element("ul", {}, result.matched.map((matched, index) => element("li", {
      className: matched ? "cb-success" : "cb-failure",
      text: `${matched ? t("matched") : t("missed")}: ${challenge.names?.[index] ?? `${t("objective")} ${index + 1}`}`
    }))),
    ...(challenge.config.enemyRunners > 0 ? [element("p", {
      text: t(result.outcome === "timeout" ? "runnerDetected" : "runnerNotDetected")
    })] : [])
  ]);
}
