import "./App.css";
import Index from "./pages/Index";
import ChatPage from "./pages/ChatPage";

import { BrowserRouter, Routes, Route } from "react-router-dom";

console.log(import.meta.env.VITE_DATABASE_URL);
function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/chatPage" element={<ChatPage />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
