import { DEFAULT_CONFIG, Puzzle, generateChallenge, legalCells, validateConfig } from "./engine.mjs";

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
  root.append(element("p", { className: "cb-eyebrow", text: t("houseRule") }));
  root.append(element("p", { text: t("rules") }));
  const status = element("p", { className: "cb-status", attributes: { role: "status", "aria-live": "polite" } });
  const time = element("strong", { className: "cb-time" });
  const axis = element("span");
  root.append(element("div", { className: "cb-telemetry" }, [time, axis]));
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
    grid.append(cell);
    return cell;
  }));
  const buffer = element("ol", { className: "cb-buffer", attributes: { "aria-label": t("buffer") } });
  const targets = element("ol", { className: "cb-targets" });
  const targetNodes = puzzle.challenge.targets.map(sequence => {
    const node = element("li");
    node.append(element("code", { text: sequence.join(" / ") }), element("span"));
    targets.append(node);
    return node;
  });
  root.append(element("div", { className: "cb-workspace" }, [
    element("section", {}, [element("h3", { text: t("matrix") }), grid]),
    element("section", { className: "cb-objectives" }, [
      element("h3", { text: t("targets") }), targets,
      element("h3", { text: t("buffer") }), buffer
    ])
  ]));
  const errorNode = element("p", { className: "cb-error", attributes: { role: "alert" } });
  const jack = button(t("jackOut"), () => {
    try { puzzle.jackOut(); refresh(); } catch (error) { fail(error); }
  });
  const submit = button(t("submit"), async () => {
    if (submitted || submitting) return;
    submitting = true;
    submit.disabled = true;
    try {
      await onSubmit(puzzle.result());
      submit.textContent = t("submitted");
      submitted = true;
    } catch (error) {
      fail(error);
    } finally {
      submitting = false;
      refresh();
    }
  }, "cb-primary");
  submit.hidden = !onSubmit;
  root.append(status, errorNode, element("footer", {}, [jack, submit]));
  if (onSubmit) root.append(element("p", { className: "cb-note", text: t("untrusted") }));
  root.append(element("p", { className: "cb-note", text: t("closeWarning") }));
  let submitted = false;
  let submitting = false;
  function fail(error) {
    errorNode.textContent = t("error");
    onError(error);
  }
  function refresh() {
    const currentStatus = puzzle.tick();
    const ended = !["ready", "running"].includes(currentStatus);
    const remaining = Math.ceil((puzzle.challenge.config.seconds * 1000 - puzzle.elapsed()) / 1000);
    time.textContent = `${remaining}s`;
    time.setAttribute("aria-label", `${t("time")}: ${remaining}s`);
    axis.textContent = ended ? t("ended") : t(puzzle.moves.length % 2 === 0 ? "activeRow" : "activeColumn");
    if (status.textContent !== t(currentStatus)) status.textContent = t(currentStatus);
    const legal = new Set(legalCells(puzzle.challenge.config.size, puzzle.moves).map(cell => `${cell.row}:${cell.col}`));
    for (let row = 0; row < cells.length; row++) {
      for (let col = 0; col < cells[row].length; col++) {
        const cell = cells[row][col];
        const visited = puzzle.moves.some(move => move.row === row && move.col === col);
        cell.disabled = ended || !legal.has(`${row}:${col}`);
        cell.classList.toggle("cb-visited", visited);
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
      node.lastChild.textContent = puzzle.matched[index] ? t("matched") : t("pending");
    });
    jack.disabled = ended;
    submit.disabled = !ended || submitted || submitting;
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
  root.append(element("p", { text: t("houseRule") }));
  const form = element("form", { className: "cb-config" });
  const controls = {};
  const limits = {
    size: [4, 8], buffer: [4, 14], targetCount: [1, 3], sequenceLength: [2, 4], seconds: [15, 300]
  };
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    const input = element("input", { attributes: {
      type: "number", min: limits[key][0], max: limits[key][1], step: 1, required: "", value
    } });
    controls[key] = input;
    form.append(element("label", {}, [element("span", { text: t(key) }), input]));
  }
  const participant = element("select");
  participant.append(element("option", { text: t("local"), attributes: { value: "" } }));
  if (isGM) {
    for (const user of users) {
      participant.append(element("option", { text: user.name, attributes: { value: user.id } }));
    }
  }
  form.append(element("label", {}, [element("span", { text: t("participant") }), participant]));
  const visibility = element("select", {}, [
    element("option", { text: t("private"), attributes: { value: "private" } }),
    element("option", { text: t("public"), attributes: { value: "public" } })
  ]);
  if (isGM) form.append(element("label", {}, [element("span", { text: t("visibility") }), visibility]));
  form.append(element("p", { className: "cb-note", text: t("configHint") }));
  const errorNode = element("p", { className: "cb-error", attributes: { role: "alert" } });
  const launch = element("button", { text: t("launch"), className: "cb-primary", attributes: { type: "submit" } });
  form.append(errorNode, launch);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    launch.disabled = true;
    try {
      const config = validateConfig(Object.fromEntries(Object.entries(controls).map(([key, input]) => [key, Number(input.value)])));
      if (participant.value) await onLaunch(config, participant.value, visibility.value === "public");
      else openBoard(generateChallenge(config).challenge, { t, onError });
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
