import React from 'react';
import { ExternalLink, Info } from 'lucide-react';

interface FooterProps {
  onOpenAbout: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenAbout }) => {
  return (
    <footer className="w-full border-t border-slate-800/80 bg-[#070b12] py-5 px-4 sm:px-8 mt-auto text-xs text-slate-400">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Copyright notice */}
        <div className="text-center md:text-left text-slate-400 font-normal">
          Copyright: Aitor Sánchez Gutiérrez © 2026 - Reservados todos los derechos
        </div>

        {/* Links */}
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <button
            onClick={onOpenAbout}
            className="text-slate-400 hover:text-emerald-400 transition-colors inline-flex items-center gap-1 cursor-pointer focus:outline-none"
          >
            <Info className="w-3.5 h-3.5" />
            <span>Acerca de...</span>
          </button>

          <span className="text-slate-700 hidden sm:inline" aria-hidden="true">·</span>

          <a
            href="https://aitorsanchez.pages.dev/contacto"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-emerald-400 transition-colors inline-flex items-center gap-1"
          >
            <span>Contacto</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>

          <span className="text-slate-700 hidden sm:inline" aria-hidden="true">·</span>

          <a
            href="https://aitorsanchez.pages.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-emerald-400 transition-colors inline-flex items-center gap-1"
          >
            <span>Blog</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>

          <span className="text-slate-700 hidden sm:inline" aria-hidden="true">·</span>

          <a
            href="https://aitorhub.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-emerald-400 transition-colors inline-flex items-center gap-1"
          >
            <span>Más apps</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>
        </nav>
      </div>
    </footer>
  );
};
