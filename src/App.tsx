import { NavLink, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { ClientsPage } from "./pages/ClientsPage";
import { EventsPage } from "./pages/EventsPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { CalendarPage } from "./pages/CalendarPage";
import { RecipesPage } from "./pages/RecipesPage";
import { IngredientsPage } from "./pages/IngredientsPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { ShoppingPage } from "./pages/ShoppingPage";
import { QuotesPage } from "./pages/QuotesPage";
import { QuotePrintPage } from "./pages/QuotePrintPage";

export default function App() {
  return (
    <Routes>
      <Route path="/cotizaciones/:id/imprimir" element={<QuotePrintPage />} />
      <Route
        path="/*"
        element={
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/clientes" element={<ClientsPage />} />
              <Route path="/eventos" element={<EventsPage />} />
              <Route path="/eventos/nuevo" element={<EventDetailPage />} />
              <Route path="/eventos/:id" element={<EventDetailPage />} />
              <Route path="/calendario" element={<CalendarPage />} />
              <Route path="/recetas" element={<RecipesPage />} />
              <Route path="/ingredientes" element={<IngredientsPage />} />
              <Route path="/proveedores" element={<SuppliersPage />} />
              <Route path="/compras" element={<ShoppingPage />} />
              <Route path="/compras/:eventId" element={<ShoppingPage />} />
              <Route path="/cotizaciones" element={<QuotesPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        }
      />
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="empty">
      <h2>Página no encontrada</h2>
      <p>Usa el menú para volver a una sección.</p>
      <NavLink to="/" className="btn primary">
        Ir al inicio
      </NavLink>
    </div>
  );
}
