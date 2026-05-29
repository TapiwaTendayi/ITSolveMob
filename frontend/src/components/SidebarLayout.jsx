import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import NotificationPermissionButton from "./NotificationPermissionButton";
import { disconnectSocket } from "../utils/socket";

// ── Role metadata ────────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  supervisor: {
    label: "System Administrator",
    color: "from-violet-600 to-indigo-600",
    accent: "bg-violet-500",
    ring: "ring-violet-400",
    badge: "bg-violet-100 text-violet-700",
    nav: [
      { to: "/dashboard/supervisor", icon: GridIcon,   label: "Dashboard" },
      { to: "/supervisor/users",     icon: UsersIcon,  label: "Manage Users" },
    ],
  },
  student: {
    label: "Technician",
    color: "from-sky-600 to-cyan-600",
    accent: "bg-sky-500",
    ring: "ring-sky-400",
    badge: "bg-sky-100 text-sky-700",
    nav: [
      { to: "/dashboard/student", icon: GridIcon,  label: "Dashboard" },
    ],
  },
  office: {
    label: "Office User",
    color: "from-emerald-600 to-teal-600",
    accent: "bg-emerald-500",
    ring: "ring-emerald-400",
    badge: "bg-emerald-100 text-emerald-700",
    nav: [
      { to: "/dashboard/office", icon: GridIcon,      label: "Dashboard" },
      { to: "/create-request",   icon: PlusCircleIcon, label: "New Request" },
    ],
  },
};

export default function SidebarLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useContext(AuthContext);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const config = ROLE_CONFIG[user?.role] ?? ROLE_CONFIG.office;
  const initials = user?.name
    ? user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const handleLogout = () => {
    disconnectSocket();
    logout();
    navigate("/login");
  };

  const isActive = (to) => location.pathname === to;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* ── Mobile overlay ──────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={[
          "fixed lg:sticky top-0 left-0 z-50",
          "w-64 h-screen flex flex-col flex-shrink-0",
          "bg-white border-r border-slate-200 shadow-xl lg:shadow-md",
          "transform transition-transform duration-300 ease-in-out",
          "lg:transform-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        {/* ── Brand header ──────────────────────────────────────────────── */}
        <div className={`bg-gradient-to-br ${config.color} p-5 flex-shrink-0`}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
              <span className="text-white font-black text-sm tracking-tight">IT</span>
            </div>
            <div>
              <span className="text-white font-bold text-lg leading-none">ITSolve</span>
              <p className="text-white/60 text-xs">Support Portal</p>
            </div>
          </div>

          {/* User card */}
          <div className="bg-white/10 rounded-xl p-3 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ring-2 ${config.ring} ring-offset-1 ring-offset-transparent flex items-center justify-center bg-white/20 flex-shrink-0`}>
              <span className="text-white font-bold text-sm">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{user?.name ?? "—"}</p>
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-white/20 text-white/90 mt-0.5`}>
                {config.label}
              </span>
            </div>
          </div>
        </div>

        {/* ── Nav ───────────────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2 mt-1">
            Navigation
          </p>

          {config.nav.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={[
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                isActive(to)
                  ? `${config.accent} text-white shadow-sm`
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              ].join(" ")}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          ))}

          <div className="my-3 border-t border-slate-100" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
            Account
          </p>

          <Link
            to="/change-password"
            onClick={() => setSidebarOpen(false)}
            className={[
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
              isActive("/change-password")
                ? `${config.accent} text-white shadow-sm`
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            ].join(" ")}
          >
            <KeyIcon className="w-4 h-4 flex-shrink-0" />
            Change Password
          </Link>
        </nav>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="p-3 border-t border-slate-100 flex-shrink-0 space-y-2">
          

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 font-medium text-sm transition-all duration-150 border border-red-100"
          >
            <LogOutIcon className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto h-screen w-full">
        {/* Mobile top bar */}
        <div className={`lg:hidden bg-gradient-to-r ${config.color} px-4 py-3 flex items-center gap-3 sticky top-0 z-30 shadow-md`}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white/80 hover:text-white p-1 rounded"
          >
            <MenuIcon className="w-5 h-5" />
          </button>
          <span className="text-white font-bold text-base">ITSolve</span>
          <span className="ml-auto text-white/70 text-xs">{config.label}</span>
        </div>

        {children}
      </main>
    </div>
  );
}

// ── Inline SVG icon components (no extra deps) ───────────────────────────────
function GridIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function UsersIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4a4 4 0 11-8 0 4 4 0 018 0zm6 0a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function PlusCircleIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 8v8M8 12h8" />
    </svg>
  );
}
function KeyIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}
function LogOutIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-9A2.25 2.25 0 002.25 5.25v13.5A2.25 2.25 0 004.5 21h9a2.25 2.25 0 002.25-2.25V15M18 15l3-3m0 0l-3-3m3 3H9" />
    </svg>
  );
}
function MenuIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
