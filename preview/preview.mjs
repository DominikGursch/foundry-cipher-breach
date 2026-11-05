import { openConfiguration } from "../scripts/ui.mjs";

const lang = new URLSearchParams(location.search).get("lang") === "de" ? "de" : "en";
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
  button.disabled = false;
  button.addEventListener("click", () => openConfiguration({ t, onError }));
} catch (error) {
  console.error(error);
  errorNode.textContent = "Could not load preview. Serve the repository over HTTP; file:// is not supported.";
}
