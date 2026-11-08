import { element, openConfiguration, openBoard, resultCard } from "../scripts/ui.mjs";
import { generateChallenge, replayResult } from "../scripts/engine.mjs";
import { interfaceRank } from "../scripts/mechanics.mjs";

const lang = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "de";
document.documentElement.lang = lang;
const button = document.querySelector("#open");
const errorNode = document.querySelector("#error");
try {
  const response = await fetch(`../lang/${lang}.json`);
  if (!response.ok) throw new Error(`Translation load failed: ${response.status}`);
  const strings = (await response.json()).CB;
  const t = key => strings[key] ?? key;
  const onError = error => {
    console.error("Cipher Breach preview |", error);
    errorNode.textContent = t("error");
  };
  button.textContent = t("menuLabel");
  document.querySelector("#hint").textContent = t("previewHint");
  const results = document.querySelector("#results");
  const users = [4, 7, 0].map(rank => ({
    id: `demo${rank}`, name: `${t("previewRunner")} / Interface ${rank}`, active: true,
    rank: interfaceRank({ items: [{ type: "role", name: "Netrunner", system: { rank, mainRoleAbility: "Interface" } }] })
  }));
  users.push({ id: "no-role", name: `${t("previewRunner")} / ${t("missingParticipant")}`, rank: null, active: true });
  button.disabled = false;
  button.addEventListener("click", () => openConfiguration({
    t, onError, isGM: true, users,
    onLaunch: async (config, participantId, publicResult, names) => {
      const { challenge } = generateChallenge(config, { id: `demo-${Date.now()}`, participantId, names });
      let used = false;
      const jackIn = element("button", { text: t("play"), attributes: { type: "button" } });
      jackIn.addEventListener("click", () => {
        if (used) return;
        try {
          openBoard(challenge, {
            t, onError,
            onSubmit: async data => {
              const result = replayResult(challenge, data);
              results.append(resultCard(challenge, result, { t }));
            }
          });
          used = true;
          jackIn.disabled = true;
          jackIn.textContent = t("alreadyStarted");
        } catch (error) { onError(error); }
      });
      results.replaceChildren(
        element("h2", { text: t("previewResult") }),
        element("p", { text: `${users.find(user => user.id === participantId).name} / ${t(publicResult ? "public" : "private")}` }),
        element("p", { text: t("previewLaunched") }),
        element("p", { text: t("challengeCard") }),
        jackIn
      );
    }
  }));
} catch (error) {
  console.error(error);
  errorNode.textContent = "Could not load preview. Serve the repository over HTTP; file:// is not supported.";
}
