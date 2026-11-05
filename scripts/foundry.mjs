import { generateChallenge, replayResult, validateChallenge } from "./engine.mjs";
import { element, openBoard, openConfiguration, openReview } from "./ui.mjs";

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

async function launch(config, participantId, publicResult) {
  if (!game.user.isGM) throw new Error("Only a GM can share a challenge.");
  const participant = game.users.get(participantId);
  if (!participant) throw new Error("Participant no longer exists.");
  const { challenge } = generateChallenge(config, { id: foundry.utils.randomID(), participantId });
  const whisper = publicResult ? [] : [...new Set([
    participantId, ...game.users.filter(user => user.isGM).map(user => user.id)
  ])];
  await ChatMessage.create({
    user: game.user.id,
    content: note("challengeCard"),
    whisper,
    flags: { [ID]: { challenge } }
  });
}

function open() {
  return openConfiguration({
    t, isGM: game.user.isGM,
    users: game.users.contents.map(user => ({ id: user.id, name: user.name })),
    onLaunch: launch, onError: report
  });
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
    render() { open(); return this; }
  }
  game.settings.registerMenu(ID, "launcher", {
    name: "CB.menuName", label: "CB.menuLabel", hint: "CB.menuHint",
    icon: "fas fa-terminal", type: CipherBreachMenu, restricted: false
  });
});

Hooks.once("ready", () => {
  game.modules.get(ID).api = Object.freeze({ open });
});

Hooks.on("renderChatMessage", (message, html) => {
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
        container.append(chatButton("play", () => {
          // Read the live GM-owned source again, not a stale rendered copy.
          const current = game.messages.get(message.id);
          const live = challengeFrom(current);
          if (live.participantId !== game.user.id) throw new Error("Challenge participant changed.");
          openBoard(live, {
            t, onError: report,
            onSubmit: async data => {
              const source = game.messages.get(message.id);
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
        }));
      }
      if (game.user.isGM) {
        container.append(element("p", {
          text: `${t("participant")}: ${game.users.get(challenge.participantId)?.name ?? t("missingParticipant")}`
        }));
      }
    }
    if (resultFlag && game.user.isGM) {
      container.append(element("p", { text: t("untrusted") }));
      container.append(chatButton("review", () => {
        if (typeof resultFlag.challengeMessageId !== "string" ||
            !/^[A-Za-z0-9_-]{1,64}$/.test(resultFlag.challengeMessageId)) {
          throw new Error("Invalid source document ID.");
        }
        const source = game.messages.get(resultFlag.challengeMessageId);
        const challenge = challengeFrom(source);
        if (message.user?.id !== challenge.participantId) throw new Error("Result author does not match participant.");
        const result = replayResult(challenge, resultFlag.data);
        openReview(result, { t });
      }));
    }
  } catch (error) {
    console.warn("Cipher Breach | Invalid chat payload", error);
    container.append(element("p", { text: t("invalidPayload") }));
  }
  (root.querySelector(".message-content") ?? root).append(container);
});
