import { playgroundStyles } from "./playground-styles.generated.js";

const STYLE_ID = "archive-playground-styles";

export function installPlaygroundStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");

  style.id = STYLE_ID;

  style.textContent = playgroundStyles;

  document.head.append(style);
}
