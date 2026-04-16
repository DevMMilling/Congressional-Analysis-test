import { NavLink, Route, Routes } from "react-router-dom";
import AdminPage from "./pages/AdminPage";
import BacktestPage from "./pages/BacktestPage";
import DashboardPage from "./pages/DashboardPage";
import ModelPerformancePage from "./pages/ModelPerformancePage";
import PoliticiansPage from "./pages/PoliticiansPage";
import SectorAnalysisPage from "./pages/SectorAnalysisPage";
import SignalsPage from "./pages/SignalsPage";
import StocksPage from "./pages/StocksPage";
import TradesPage from "./pages/TradesPage";

const NAV = [
  { to: "/", label: "Dashboard", icon: "▦", exact: true },
  { to: "/stocks", label: "Stocks", icon: "↗" },
  { to: "/politicians", label: "Politicians", icon: "⬡" },
  { to: "/sectors", label: "Sectors", icon: "◈" },
  { to: "/signals", label: "Signals", icon: "◉" },
  { to: "/trades", label: "Trades", icon: "≡" },
  { to: "/backtest", label: "Backtest", icon: "⌬" },
  { to: "/model-performance", label: "Model", icon: "⊞" },
  { to: "/admin", label: "Admin", icon: "⚙" },
];

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow" style={{ color: "rgba(248,221,203,0.6)", marginBottom: "0.25rem" }}>Research Console</p>
          <h1 style={{ fontSize: "1.1rem", lineHeight: 1.3, margin: 0 }}>Congressional<br />Intelligence</h1>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(({ to, label, icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: "0.5rem 0", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <p className="eyebrow" style={{ color: "rgba(248,221,203,0.4)", fontSize: "0.65rem" }}>
            Congressional Trading Intelligence
          </p>
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/stocks" element={<StocksPage />} />
          <Route path="/politicians" element={<PoliticiansPage />} />
          <Route path="/sectors" element={<SectorAnalysisPage />} />
          <Route path="/signals" element={<SignalsPage />} />
          <Route path="/trades" element={<TradesPage />} />
          <Route path="/backtest" element={<BacktestPage />} />
          <Route path="/model-performance" element={<ModelPerformancePage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}