import { generateChallenge, replayResult, validateChallenge } from "./engine.mjs";
import { breachConfig, interfaceRank } from "./mechanics.mjs";
import { element, openBoard, openConfiguration, openReview, resultCard } from "./ui.mjs";

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
  if (!message?.user?.isGM) throw new Error("Challenge must be a GM-authored chat document.");
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
    user: game.user.id,
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
  const actorRank = rank ?? interfaceRank(participant.character);
  if (actorRank === null) throw new Error("No Interface role found; specify rank explicitly.");
  const config = breachConfig({ dv, rank: actorRank, targetCount, repeatedFailures, pressureConditions, enemyRunners });
  return launch(config, participant.id, publicResult,
    names ?? ["backdoor", "data", "control"].slice(0, config.targetCount).map(t));
}

const boards = new Map();
function play(messageId) {
  const current = game.messages.get(messageId);
  const live = challengeFrom(current);
  if (live.participantId !== game.user.id) throw new Error("Challenge participant changed.");
  if (boards.has(messageId)) return boards.get(messageId);
  const board = openBoard(live, {
    t, onError: report,
    onSubmit: async data => {
      const source = game.messages.get(messageId);
      const canonical = challengeFrom(source);
      if (canonical.participantId !== game.user.id) throw new Error("Participant mismatch.");
      replayResult(canonical, data);
      await ChatMessage.create({
        user: game.user.id,
        content: note("resultCard"),
        whisper: [...source.whisper.map(user => typeof user === "string" ? user : user.id)],
        flags: { [ID]: { result: { challengeMessageId: source.id, data } } }
      });
    }
  });
  boards.set(messageId, board);
  board.addEventListener("close", () => boards.delete(messageId), { once: true });
  return board;
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

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM) return;
  const tool = {
    name: "cipherBreach", title: t("menuLabel"), icon: "fas fa-terminal",
    button: true, visible: true,
    onClick: () => { try { open(); } catch (error) { report(error); } }
  };
  if (Array.isArray(controls)) controls.find(control => control.name === "token")?.tools.push(tool);
  else if (controls?.tokens?.tools) controls.tokens.tools.cipherBreach = { ...tool, onChange: tool.onClick, order: 99 };
});

// A core GM-owned document is the invitation; no unauthenticated custom socket commands.
Hooks.on("createChatMessage", message => {
  if (!message.visible || !message.getFlag(ID, "challenge")) return;
  try {
    const challenge = challengeFrom(message);
    if (challenge.participantId === game.user.id) play(message.id);
  } catch (error) { report(error); }
});

function renderChat(message, html) {
  const root = html?.[0] ?? html;
  if (!root?.querySelector || !message.visible) return;
  root.querySelector(".cb-chat")?.remove();
  const challengeFlag = message.getFlag(ID, "challenge");
  const resultFlag = message.getFlag(ID, "result");
  if (!challengeFlag && !resultFlag) return;
  const container = element("div", { className: "cb-chat" });
  try {
    if (challengeFlag) {
      const challenge = challengeFrom(message);
      container.append(element("p", { text: t("untrusted") }));
      if (challenge.participantId === game.user.id) {
        container.append(chatButton("play", () => play(message.id)));
      }
      if (game.user.isGM) {
        container.append(element("p", {
          text: `${t("participant")}: ${game.users.get(challenge.participantId)?.name ?? t("missingParticipant")}`
        }));
      }
    }
    if (resultFlag) {
      container.append(element("p", { text: t("untrusted") }));
      const review = () => {
        if (typeof resultFlag.challengeMessageId !== "string" ||
            !/^[A-Za-z0-9_-]{1,64}$/.test(resultFlag.challengeMessageId)) {
          throw new Error("Invalid source document ID.");
        }
        const source = game.messages.get(resultFlag.challengeMessageId);
        const challenge = challengeFrom(source);
        if (message.user?.id !== challenge.participantId) throw new Error("Result author does not match participant.");
        return { challenge, result: replayResult(challenge, resultFlag.data) };
      };
      const checked = review();
      const participant = game.users.get(checked.challenge.participantId);
      container.append(element("p", { text: `${t("participant")}: ${participant?.character?.name ?? participant?.name ?? t("missingParticipant")}` }));
      container.append(resultCard(checked.challenge, checked.result, { t }));
      if (game.user.isGM) container.append(chatButton("review", () => openReview(review().result, { t })));
    }
  } catch (error) {
    console.warn("Cipher Breach | Invalid chat payload", error);
    container.append(element("p", { text: t("invalidPayload") }));
  }
  (root.querySelector(".message-content") ?? root).append(container);
}
Hooks.on("renderChatMessage", renderChat);
Hooks.on("renderChatMessageHTML", renderChat);
