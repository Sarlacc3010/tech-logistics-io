
  // Punto de entrada de React: monta <App/> dentro de un BrowserRouter. La
  // ruta acepta un :moduleId opcional (/lp, /transport, ...) que App.tsx lee
  // con useParams para saber qué módulo mostrar — así cada módulo tiene URL
  // propia, compartible y recargable.
  import { createRoot } from "react-dom/client";
  import { BrowserRouter, Routes, Route } from "react-router";
  import App from "./app/App.tsx";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/:moduleId" element={<App />} />
      </Routes>
    </BrowserRouter>
  );
