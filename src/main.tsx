import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import faviconUrl from "./assets/Viet_Ocr.png";

function setFavicon(href: string) {
  const existing =
    document.querySelector<HTMLLinkElement>("link[rel~='icon']") ??
    document.createElement("link");

  existing.rel = "icon";
  existing.type = "image/png";
  existing.href = href;

  if (!existing.parentNode) {
    document.head.appendChild(existing);
  }
}

document.title = "VietOCR";
setFavicon(faviconUrl);

createRoot(document.getElementById("root")!).render(<App />);
