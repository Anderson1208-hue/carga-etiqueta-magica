import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { bootstrapNativePermissions } from "./lib/bootstrapNativePermissions";

// Pede POST_NOTIFICATIONS (Android 13+) logo no primeiro launch do APK.
// Sem isso, a notificação fixa do Foreground Service do GPS não aparece
// e o SO derruba o rastreamento com tela bloqueada.
bootstrapNativePermissions();

createRoot(document.getElementById("root")!).render(<App />);
