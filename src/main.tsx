import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { MyContextProvider } from "./context/FrontendStructureContext.tsx";
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
import { ClerkProvider } from "@clerk/clerk-react";

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key");
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <MyContextProvider>
        <App />
      </MyContextProvider>
    </ClerkProvider>
  </StrictMode>
);
