import { generateChallenge, replayResult, validateChallenge } from "./engine.mjs";
import { breachConfig, interfaceRank } from "./mechanics.mjs";
import { element, openBoard, openConfiguration, resultCard } from "./ui.mjs";

const ID = "foundry-cipher-breach";
const t = key => game.i18n.localize(`CB.${key}`);

function report(error) {
  console.error("Cipher Breach |", error);
  ui.notifications.error(t("error"));
}

function note(key) {
  return element("p", { text: t(key) }).outerHTML;
}

function challengeFrom(message) {
  if (!message?.author?.isGM) throw new Error("Challenge must be a GM-authored chat document.");
  return validateChallenge(message.getFlag(ID, "challenge"));
}

async function launch(config, participantId, publicResult, names) {
  if (!game.user.isGM) throw new Error("Only a GM can share a challenge.");
  const participant = game.users.get(participantId);
  if (!participant) throw new Error("Participant no longer exists.");
  const { challenge } = generateChallenge(config, { id: foundry.utils.randomID(), participantId, names });
  const whisper = publicResult ? [] : [...new Set([
    participantId, ...game.users.filter(user => user.isGM).map(user => user.id)
  ])];
  return ChatMessage.create({
    author: game.user.id,
    content: note("challengeCard"),
    whisper,
    flags: { [ID]: { challenge } }
  });
}

function open() {
  return openConfiguration({
    t, isGM: game.user.isGM,
    users: game.user.isGM ? game.users.contents.filter(user => !user.isGM).map(user => ({
      id: user.id, name: `${user.name}${user.character ? ` / ${user.character.name}` : ""}`,
      active: user.active, rank: interfaceRank(user.character)
    })) : [],
    onLaunch: launch, onError: report
  });
}

async function start({
  user, dv = 8, rank, targetCount, names, publicResult = false,
  repeatedFailures = 0, pressureConditions = 0, enemyRunners = 0
} = {}) {
  if (!game.user.isGM) throw new Error("Only a GM can launch a breach.");
  const participant = game.users.get(user);
  if (!participant) throw new Error("Select an existing participant.");
  const actorRank = rank ?? interfaceRank(participant.character) ?? 0;
  const config = breachConfig({ dv, rank: actorRank, targetCount, repeatedFailures, pressureConditions, enemyRunners });
  return launch(config, participant.id, publicResult,
    names ?? ["backdoor", "data", "control"].slice(0, config.targetCount).map(t));
}

const starting = new Set();

function wasStarted(messageId, participantId) {
  return game.messages.some(message => message.author?.id === participantId &&
    (message.getFlag(ID, "started")?.challengeMessageId === messageId ||
     message.getFlag(ID, "result")?.challengeMessageId === messageId));
}

function refreshInvitation(messageId) {
  for (const root of document.querySelectorAll(".message[data-message-id]")) {
    if (root.dataset.messageId !== messageId) continue;
    const message = game.messages.get(messageId);
    if (message) renderChat(message, root);
  }
}

async function play(messageId) {
  const current = game.messages.get(messageId);
  const live = challengeFrom(current);
  if (live.participantId !== game.user.id) throw new Error("Challenge participant changed.");
  if (starting.has(messageId) || wasStarted(messageId, live.participantId)) {
    refreshInvitation(messageId);
    return;
  }
  starting.add(messageId);
  try {
    await ChatMessage.create({
      author: game.user.id,
      content: note("started"),
      whisper: [...current.whisper.map(user => typeof user === "string" ? user : user.id)],
      flags: { [ID]: { started: { challengeMessageId: messageId } } }
    });
    refreshInvitation(messageId);
    return openBoard(live, {
      t, onError: report,
      onSubmit: async data => {
        const source = game.messages.get(messageId);
        const canonical = challengeFrom(source);
        if (canonical.participantId !== game.user.id) throw new Error("Participant mismatch.");
        replayResult(canonical, data);
        await ChatMessage.create({
          author: game.user.id,
          content: note("resultCard"),
          whisper: [...source.whisper.map(user => typeof user === "string" ? user : user.id)],
          flags: { [ID]: { result: { challengeMessageId: source.id, data } } }
        });
      }
    });
  } finally {
    starting.delete(messageId);
  }
}

function chatButton(label, action) {
  const node = element("button", { text: t(label), attributes: { type: "button" } });
  node.addEventListener("click", async () => {
    node.disabled = true;
    try { await action(); } catch (error) { report(error); }
    finally { node.disabled = false; }
  });
  return node;
}

Hooks.once("init", () => {
  // A v12 FormApplication menu is just an entry point; all puzzle DOM is created safely.
  class CipherBreachMenu extends FormApplication {
    render() {
      try { open(); } catch (error) { report(error); }
      return this;
    }
  }
  game.settings.registerMenu(ID, "launcher", {
    name: "CB.menuName", label: "CB.menuLabel", hint: "CB.menuHint",
    icon: "fas fa-terminal", type: CipherBreachMenu, restricted: false
  });
});

Hooks.once("ready", () => {
  game.modules.get(ID).api = Object.freeze({ open, start });
});

Hooks.on("renderSceneControls", (_app, html) => {
  const root = html?.[0] ?? html;
  const list = root?.querySelector?.("ol.main-controls");
  if (!list) {
    console.warn("Cipher Breach | Scene controls toolbar not found; use the settings menu.");
    return;
  }
  list.querySelector(".cb-scene-launch")?.remove();
  if (!game.user.isGM) return;
  const button = element("li", {
    className: "scene-control cb-scene-launch",
    attributes: { role: "button", tabindex: "0", title: t("menuLabel"), "aria-label": t("menuLabel"), "data-tooltip": t("menuLabel") }
  }, [element("i", { className: "fas fa-terminal", attributes: { "aria-hidden": "true" } })]);
  const activate = () => { try { open(); } catch (error) { report(error); } };
  button.addEventListener("click", event => {
    event.stopPropagation();
    activate();
  });
  button.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      activate();
    }
  });
  list.append(button);
});

function renderChat(message, html) {
  const root = html?.[0] ?? html;
  if (!root?.querySelector || !message.visible) return;
  root.querySelector(".cb-chat")?.remove();
  const challengeFlag = message.getFlag(ID, "challenge");
  const resultFlag = message.getFlag(ID, "result");
  const startedFlag = message.getFlag(ID, "started");
  if (!challengeFlag && !resultFlag && !startedFlag) return;
  const container = element("div", { className: "cb-chat" });
  try {
    if (startedFlag) {
      root.hidden = true;
      root.classList.add("cb-start-marker");
      return;
    }
    if (challengeFlag) {
      const challenge = challengeFrom(message);
      if (challenge.participantId === game.user.id) {
        const used = wasStarted(message.id, challenge.participantId);
        container.append(element("p", { text: t(used ? "alreadyStarted" : "challengeCard") }));
        if (!used) container.append(chatButton("play", () => play(message.id)));
      }
      if (game.user.isGM) {
        container.append(element("p", {
          text: `${t("invitationGM")}: ${game.users.get(challenge.participantId)?.name ?? t("missingParticipant")}`
        }));
      } else if (challenge.participantId !== game.user.id) {
        container.append(element("p", { text: t("invitationPublic") }));
      }
    }
    if (resultFlag) {
      const review = () => {
        if (typeof resultFlag.challengeMessageId !== "string" ||
            !/^[A-Za-z0-9_-]{1,64}$/.test(resultFlag.challengeMessageId)) {
          throw new Error("Invalid source document ID.");
        }
        const source = game.messages.get(resultFlag.challengeMessageId);
        const challenge = challengeFrom(source);
        if (message.author?.id !== challenge.participantId) throw new Error("Result author does not match participant.");
        return { challenge, result: replayResult(challenge, resultFlag.data) };
      };
      const checked = review();
      const participant = game.users.get(checked.challenge.participantId);
      container.append(element("p", { text: `${t("participant")}: ${participant?.character?.name ?? participant?.name ?? t("missingParticipant")}` }));
      container.append(resultCard(checked.challenge, checked.result, { t }));
    }
  } catch (error) {
    console.warn("Cipher Breach | Invalid chat payload", error);
    container.append(element("p", { text: t("invalidPayload") }));
  }
  const content = root.matches?.(".message-content") ? root : root.querySelector(".message-content") ?? root;
  content.replaceChildren(container);
}
Hooks.on("renderChatMessage", renderChat);
Hooks.on("renderChatMessageHTML", renderChat);
Hooks.on("createChatMessage", message => {
  const started = message.getFlag(ID, "started");
  if (started?.challengeMessageId) refreshInvitation(started.challengeMessageId);
});
