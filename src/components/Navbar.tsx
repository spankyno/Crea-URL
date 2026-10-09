import React from 'react';
import { UserSession } from '../types';
import { 
  Globe, 
  FileCode, 
  FolderKanban, 
  LayoutDashboard, 
  ShieldCheck, 
  Sparkles, 
  Moon,
  Sun,
  Plus
} from 'lucide-react';
import { SignInButton, UserButton, SignedIn, SignedOut } from '@clerk/clerk-react';

interface NavbarProps {
  currentTab: 'editor' | 'dashboard' | 'collections' | 'admin';
  setCurrentTab: (tab: 'editor' | 'dashboard' | 'collections' | 'admin') => void;
  currentUser: UserSession;
  setCurrentUser: (user: UserSession) => void;
  onOpenTemplates: () => void;
  onNewPage: () => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
}

const IS_CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  currentUser,
  setCurrentUser,
  onOpenTemplates,
  onNewPage,
  darkMode,
  setDarkMode,
}) => {
  const switchUserRole = (role: 'anon' | 'user' | 'admin') => {
    if (role === 'anon') {
      setCurrentUser({
        id: 'anon_' + Math.random().toString(36).substring(2, 9),
        name: 'Invitado Anónimo',
        role: 'anon',
        isRegistered: false,
      });
    } else if (role === 'user') {
      setCurrentUser({
        id: 'usr_pro_01',
        name: 'Alex Sánchez',
        email: 'asanchezgu@gmail.com',
        role: 'user',
        isRegistered: true,
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
      });
    } else {
      setCurrentUser({
        id: 'usr_admin_01',
        name: 'Admin Master',
        email: 'admin@host-html.com',
        role: 'admin',
        isRegistered: true,
      });
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-app/90 backdrop-blur-md px-4 lg:px-8 py-3 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentTab('editor')}
            className="flex items-center gap-2.5 text-left group focus:outline-none"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 group-hover:border-emerald-500/50 transition-colors">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <span className="text-base font-semibold tracking-tight text-strong flex items-center gap-1.5">
                Crea URL
              </span>
            </div>
          </button>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/60 p-1 rounded-lg border border-slate-800/80">
          <button
            onClick={() => setCurrentTab('editor')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              currentTab === 'editor'
                ? 'bg-slate-800 text-emerald-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            Editor & Subir
          </button>

          <button
            onClick={() => setCurrentTab('collections')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              currentTab === 'collections'
                ? 'bg-slate-800 text-emerald-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            Colecciones
          </button>

          <button
            onClick={() => setCurrentTab('dashboard')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              currentTab === 'dashboard'
                ? 'bg-slate-800 text-emerald-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Mi Dashboard
          </button>

          {currentUser.role === 'admin' && (
          <button
            onClick={() => setCurrentTab('admin')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              currentTab === 'admin'
                ? 'bg-slate-800 text-emerald-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Admin
          </button>
          )}
        </nav>

        {/* Zone 3: Actions & Auth / Role Switcher */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenTemplates}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-strong bg-slate-800/80 hover:bg-slate-800 rounded-md border border-slate-700/60 transition-colors whitespace-nowrap"
            title="Explorar plantillas pre-diseñadas"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Plantillas
          </button>

          {/* Real Clerk Auth Buttons if Key configured */}
          {IS_CLERK_ENABLED ? (
            <div className="flex items-center gap-2">
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-950/60 border border-emerald-800/60 hover:bg-emerald-900/60 rounded-lg transition-colors">
                    Iniciar Sesión (Clerk)
                  </button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <UserButton afterSignOutUrl="/" />
              </SignedIn>
            </div>
          ) : null}

          {/* User Role Switcher Dropdown */}
          <div className="relative group">
            <button
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors whitespace-nowrap"
              title={import.meta.env.DEV ? 'Cambiar estado de sesión (solo desarrollo)' : 'Estado de sesión'}
            >
              <div className={`w-2 h-2 rounded-full ${currentUser.role === 'admin' ? 'bg-amber-400' : currentUser.role === 'user' ? 'bg-sky-400' : 'bg-emerald-500'} animate-pulse`} />
              <span className="max-w-[120px] truncate text-slate-200">{currentUser.name}</span>
              <span className="text-[10px] text-slate-400 uppercase font-mono">
                {currentUser.role === 'anon' ? '15d' : '3m'}
              </span>
            </button>

            {/* Menu Dropdown: selector de roles simulados, solo en desarrollo */}
            {import.meta.env.DEV && (
            <div className="absolute right-0 mt-1 w-56 p-1.5 bg-app-card border border-slate-800 rounded-xl shadow-xl opacity-0 translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-150 z-50">
              <div className="px-2.5 py-1.5 text-[11px] text-slate-400 border-b border-slate-800/80 mb-1">
                {IS_CLERK_ENABLED ? 'Roles y Simulación' : 'Modo Demostración / Simulación'}
              </div>
              <button
                onClick={() => switchUserRole('anon')}
                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-md flex items-center justify-between ${
                  currentUser.role === 'anon' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <span>Anónimo (Sin cuenta)</span>
                <span className="text-[10px] text-slate-500">1MB / 15d</span>
              </button>
              <button
                onClick={() => switchUserRole('user')}
                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-md flex items-center justify-between ${
                  currentUser.role === 'user' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <span>Registrado (Pro Free)</span>
                <span className="text-[10px] text-slate-500">10MB / 3m</span>
              </button>
              <button
                onClick={() => switchUserRole('admin')}
                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-md flex items-center justify-between ${
                  currentUser.role === 'admin' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <span>Administrador</span>
                <span className="text-[10px] text-slate-500">Ilimitado</span>
              </button>
            </div>
            )}
          </div>

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-md border border-slate-800 hover:bg-slate-800/60 transition-colors"
            title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={onNewPage}
            className="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nuevo HTML</span>
          </button>
        </div>
      </div>
    </header>
  );
};
