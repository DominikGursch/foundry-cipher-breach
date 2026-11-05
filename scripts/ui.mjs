import { Puzzle, generateChallenge, legalCells } from "./engine.mjs";
import { breachConfig, DV_PRESETS } from "./mechanics.mjs";

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

export function openBoard(challenge, { t, onSubmit = null, onError = console.error } = {}) {
  const puzzle = new Puzzle(challenge);
  const root = dialog("Cipher Breach", t);
  root.classList.add("cb-board");
  const config = puzzle.challenge.config;
  const header = root.querySelector("header");
  header.querySelector(".cb-wordmark").remove();
  header.querySelector("h2").textContent = t("floorBreach");
  if (config.mode === "netrun") header.append(element("span", {
    className: "cb-board-meta", text: `DV ${config.dv} / Interface ${config.rank}`
  }));
  const status = element("p", { className: "cb-status", attributes: { role: "status", "aria-live": "polite" } });
  const time = element("strong", { className: "cb-time" });
  const timeBar = element("progress", { attributes: { max: config.seconds, value: config.seconds, "aria-label": t("time") } });
  header.append(element("div", { className: "cb-telemetry" }, [time, timeBar]));
  header.append(header.querySelector(".cb-close"));
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
  const buffer = element("ol", { className: "cb-buffer", attributes: { "aria-label": t("buffer") } });
  const targets = element("ol", { className: "cb-targets" });
  const targetNodes = puzzle.challenge.targets.map((sequence, index) => {
    const node = element("li");
    node.append(
      element("div", { className: "cb-sequence" }, sequence.map(code => element("code", { text: code }))),
      element("strong", { text: puzzle.challenge.names?.[index] ?? `${t("objective")} ${index + 1}` }),
      element("span", { className: "cb-target-status" })
    );
    targets.append(node);
    return node;
  });
  const bufferCount = element("small");
  const objectives = element("section", { className: "cb-objectives" }, [
      element("h3", {}, [element("span", { text: t("buffer") }), bufferCount]), buffer,
      element("h3", { text: t("targets") }), targets
  ]);
  root.append(element("div", { className: "cb-workspace" }, [
    element("section", {}, [element("h3", { text: t("matrix") }), grid, axis]),
    objectives
  ]));
  const errorNode = element("p", { className: "cb-error", attributes: { role: "alert" } });
  const jack = button(t("jackOut"), () => {
    if (sendFailed) void sendResult();
    else {
      try { puzzle.jackOut(); refresh(); } catch (error) { fail(error); }
    }
  }, "cb-jack");
  async function sendResult() {
    if (submitted || submitting) return;
    submitting = true;
    sendFailed = false;
    errorNode.textContent = "";
    jack.disabled = true;
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
    time.setAttribute("aria-label", `${t("time")}: ${remaining}s`);
    axis.textContent = ended ? t("ended") : t(puzzle.moves.length % 2 === 0 ? "activeRow" : "activeColumn");
    const statusText = ended ? `${t(currentStatus)} ${t("targets")}: ${puzzle.matched.filter(Boolean).length}/${puzzle.matched.length}` : t(currentStatus);
    if (status.textContent !== statusText) status.textContent = statusText;
    status.hidden = !ended;
    root.classList.toggle("cb-ended", ended);
    root.classList.toggle("cb-failed", ended && !puzzle.matched.some(Boolean));
    root.classList.toggle("cb-critical", !ended && remaining <= 10);
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
    jack.disabled = submitting || (ended && !sendFailed);
    jack.textContent = t(sendFailed ? "retryReport" : "jackOut");
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
  return root;
}

export function openConfiguration({
  t, users = [], isGM = false, onLaunch = null, onError = console.error
}) {
  const root = dialog("Cipher Breach", t);
  const form = element("form", { className: "cb-config" });
  const dv = element("select", { attributes: { name: "dv" } }, Object.entries(DV_PRESETS).map(([value, preset]) =>
    element("option", { text: `DV ${value} / ${preset.size} x ${preset.size}`, attributes: { value } })));
  dv.value = "8";
  form.append(element("label", {}, [element("span", { text: t("dv") }), dv]));
  const targetCount = element("select", { attributes: { name: "targetCount" } });
  form.append(element("label", {}, [element("span", { text: t("targetCount") }), targetCount]));
  const names = ["backdoor", "data", "control"].map((key, index) => element("input", {
    attributes: { name: `objective${index + 1}`, type: "text", maxlength: 120, value: t(key) }
  }));
  const nameLabels = names.map((input, index) => element("label", {}, [
    element("span", { text: `${t("objective")} ${index + 1}` }), input
  ]));
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
  const errorNode = element("p", { className: "cb-error", attributes: { role: "alert" } });
  function update() {
    try {
      const config = breachConfig({ dv: Number(dv.value), rank: Number(rank.value), targetCount: Number(targetCount.value) });
      nameLabels.forEach((label, index) => {
        label.hidden = index >= config.targetCount;
        names[index].required = index < config.targetCount;
      });
      derived.textContent = `${config.size} x ${config.size} / ${t("buffer")}: ${config.buffer} / ${config.seconds}s / ${t("targets")}: ${config.sequenceLengths.join(", ")}`;
      errorNode.textContent = "";
    } catch (error) {
      derived.textContent = "";
      errorNode.textContent = t("configError");
      onError(error);
    }
  }
  function selectDV() {
    const previous = Number(targetCount.value) || 3;
    const max = DV_PRESETS[dv.value].lengths.length;
    targetCount.replaceChildren(...Array.from({ length: max }, (_, index) => element("option", {
      text: index + 1, attributes: { value: index + 1 }
    })));
    targetCount.value = String(Math.min(previous, max));
    update();
  }
  function selectParticipant() {
    const user = users.find(user => user.id === participant.value);
    rank.value = String(user?.rank ?? 4);
    rankNote.textContent = !user ? t("practiceRank") : user.rank === null || user.rank === undefined ? t("missingRank") : t("characterRank");
    update();
  }
  dv.addEventListener("change", selectDV);
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
      const config = breachConfig({ dv: Number(dv.value), rank: Number(rank.value), targetCount: Number(targetCount.value) });
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

export function openReview(result, { t }) {
  const root = dialog(t("review"), t);
  root.append(
    element("p", { className: "cb-note", text: t("untrusted") }),
    element("p", { text: t("consistent") }),
    element("p", { text: `${t("outcome")}: ${t(result.outcome)}` }),
    element("p", { text: `${t("targets")}: ${result.matched.filter(Boolean).length} / ${result.matched.length}` }),
    element("p", { text: `${t("claimedTime")}: ${(result.elapsedMs / 1000).toFixed(1)}s` }),
    element("p", { text: `${t("moves")}: ${result.moves.map(cell => `${cell.row + 1}:${cell.col + 1}`).join(" / ") || "-"}` })
  );
  return root;
}

export function resultCard(challenge, result, { t }) {
  return element("div", { className: "cb-report" }, [
    element("strong", { text: `${t(result.outcome)} / ${result.matched.filter(Boolean).length}/${result.matched.length}` }),
    element("p", { text: `${challenge.config.mode === "netrun" ? `DV ${challenge.config.dv} / Interface ${challenge.config.rank} / ` : ""}${(result.elapsedMs / 1000).toFixed(1)}s / ${t("buffer")} ${result.moves.length}/${challenge.config.buffer}` }),
    element("ul", {}, result.matched.map((matched, index) => element("li", {
      className: matched ? "cb-success" : "cb-failure",
      text: `${matched ? t("matched") : t("missed")}: ${challenge.names?.[index] ?? `${t("objective")} ${index + 1}`}`
    }))),
    ...(!result.matched.some(Boolean) ? [element("p", { className: "cb-failure", text: t("ice") })] : [])
  ]);
}
