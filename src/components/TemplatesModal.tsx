import React, { useState, useEffect } from 'react';
import { Sparkles, X, Check, Code, ArrowRight } from 'lucide-react';
import { StarterTemplate } from '../types';
import { api } from '../services/api';
import { STARTER_HTML } from '../constants/starterHtml';

// Plantilla local: siempre disponible, aunque falle la carga del resto
const HOLA_MUNDO: StarterTemplate = {
  id: 'hola-mundo',
  name: 'Hola Mundo',
  description: 'Página de bienvenida básica con una tarjeta centrada. Ideal para probar la publicación en segundos.',
  html: STARTER_HTML,
};

interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: StarterTemplate) => void;
}

export const TemplatesModal: React.FC<TemplatesModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
}) => {
  const [templates, setTemplates] = useState<StarterTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      api.getTemplates()
        .then(setTemplates)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-strong rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-bold text-strong tracking-tight">Plantillas Web de Inicio Rápido</h2>
        </div>
        <p className="text-xs text-slate-400 mb-6">
          Selecciona un diseño HTML profesional prediseñado para probar las funciones de publicación de Crea URL.
        </p>

        {loading ? (
          <div className="py-12 text-center text-slate-400 font-mono text-xs">Cargando plantillas...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1">
            {[HOLA_MUNDO, ...templates.filter((t) => t.id !== HOLA_MUNDO.id)].map((tpl) => (
              <div
                key={tpl.id}
                className="bg-slate-900/80 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-4 transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-strong group-hover:text-emerald-300 transition-colors">
                      {tpl.name}
                    </span>
                    <Code className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    {tpl.description}
                  </p>
                </div>

                <button
                  onClick={() => {
                    onSelectTemplate(tpl);
                    onClose();
                  }}
                  className="w-full py-2 px-3 text-xs font-semibold bg-slate-800 group-hover:bg-emerald-400 group-hover:text-slate-950 text-slate-200 rounded-lg transition-all flex items-center justify-center gap-1.5"
                >
                  <span>Cargar plantilla</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-strong transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
