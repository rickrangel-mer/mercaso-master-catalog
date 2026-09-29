// Entry for the single-file build (`pnpm web:html`): renders the same page the Next.js site uses.
import { createRoot } from "react-dom/client";
import Page from "../app/page";

createRoot(document.getElementById("root")!).render(<Page />);
