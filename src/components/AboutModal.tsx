import React from 'react';
import { X, Globe, ShieldCheck, Sparkles, Layers, Zap, Heart, ExternalLink } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#0f172a] border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          title="Cerrar ventana"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>Acerca de Crea URL</span>
              <span className="text-[11px] font-mono font-normal px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                v1.0
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Plataforma de alojamiento y publicación instantánea de páginas HTML estáticas.
            </p>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-6 text-xs text-slate-300 leading-relaxed">
          {/* Mission */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
            <p className="text-slate-200 text-sm font-medium mb-1">
              Publica y comparte tus creaciones web en segundos, sin complicaciones.
            </p>
            <p className="text-slate-400">
              Inspirado en servicios como <em>host-html.com</em>, <strong>Crea URL</strong> permite a diseñadores, desarrolladores y creadores subir archivos <code className="text-emerald-400 font-mono">.html</code> o pegar código directamente, previsualizarlo en un entorno seguro y publicarlo bajo URLs limpias y compartibles.
            </p>
          </div>

          {/* Key Features Grid */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Características Principales
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2 text-white font-medium mb-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Sandbox Seguro</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Previsualización y renderizado aislado mediante atributos estrictos de sandbox para máxima seguridad.
                </p>
              </div>

              <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2 text-white font-medium mb-1">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Códigos QR & Exportación</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Generación de códigos QR descargables y exportación completa a paquete <code className="font-mono">.ZIP</code>.
                </p>
              </div>

              <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2 text-white font-medium mb-1">
                  <Layers className="w-4 h-4 text-sky-400" />
                  <span>Colecciones de Páginas</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Agrupa diferentes páginas o prototipos bajo una sola URL limpia <code className="font-mono">/c/{'{slug}'}</code>.
                </p>
              </div>

              <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2 text-white font-medium mb-1">
                  <Zap className="w-4 h-4 text-purple-400" />
                  <span>Optimización & Efímero</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Minificación automática de código, validador de marcado y modo efímero de autodestrucción.
                </p>
              </div>
            </div>
          </div>

          {/* Author note */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-400">
            <h4 className="text-xs font-semibold text-slate-200 mb-1">Desarrollado por</h4>
            <p className="text-slate-300 font-medium">Aitor Sánchez Gutiérrez</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Desarrollador de software y creador de herramientas web de alto rendimiento.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-800/80 text-[11px]">
              <a
                href="https://aitorsanchez.pages.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
              >
                <span>Blog personal</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-slate-700">·</span>
              <a
                href="https://aitorsanchez.pages.dev/contacto"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
              >
                <span>Contacto directo</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-slate-700">·</span>
              <a
                href="https://aitorhub.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
              >
                <span>Más aplicaciones</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Crea URL © 2026
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
