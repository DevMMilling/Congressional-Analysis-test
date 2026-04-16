import { NavLink, Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import PoliticiansPage from "./pages/PoliticiansPage";
import StocksPage from "./pages/StocksPage";
import SignalsPage from "./pages/SignalsPage";
import BacktestPage from "./pages/BacktestPage";
import AdminPage from "./pages/AdminPage";

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Research Console</p>
          <h1>Congressional Trading Intelligence</h1>
          <p className="muted">Scrape, enrich, score, backtest, and monitor congressional trading activity.</p>
        </div>
        <nav>
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/politicians">Politicians</NavLink>
          <NavLink to="/stocks">Stocks</NavLink>
          <NavLink to="/signals">Signals</NavLink>
          <NavLink to="/backtest">Backtest</NavLink>
          <NavLink to="/admin">Admin</NavLink>
        </nav>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/politicians" element={<PoliticiansPage />} />
          <Route path="/stocks" element={<StocksPage />} />
          <Route path="/signals" element={<SignalsPage />} />
          <Route path="/backtest" element={<BacktestPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}
