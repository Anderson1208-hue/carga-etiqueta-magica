import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Registro do headless task é defensivo e assíncrono — nunca pode
// impedir o React de montar. Por isso fica num try/catch separado.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  import("./lib/registerGpsHeadlessTask")
    .then((m) => m.registerGpsHeadlessTask())
    .catch((err) => console.warn("[main] registerGpsHeadlessTask import falhou", err));
} catch (err) {
  console.warn("[main] registerGpsHeadlessTask falhou", err);
}

createRoot(document.getElementById("root")!).render(<App />);
