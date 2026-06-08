import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerGpsHeadlessTask } from "./lib/registerGpsHeadlessTask";

registerGpsHeadlessTask();

createRoot(document.getElementById("root")!).render(<App />);
