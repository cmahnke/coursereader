import { coreStyles } from "./styles.generated.js";

const STYLE_ID = "archive-scan-core-styles";

export function installStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");

  style.id = STYLE_ID;

  style.textContent = coreStyles;

  document.head.append(style);
}
