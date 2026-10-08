import React, { useState, useRef } from 'react';
import { 
  Monitor, 
  Tablet, 
  Smartphone, 
  RotateCw, 
  ExternalLink, 
  ShieldCheck, 
  Maximize2,
  Code
} from 'lucide-react';

interface PreviewZoneProps {
  html: string;
  onOpenTemplates: () => void;
}

export const PreviewZone: React.FC<PreviewZoneProps> = ({ html, onOpenTemplates }) => {
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [iframeKey, setIframeKey] = useState(0);
  const [isSandboxNoticeOpen, setIsSandboxNoticeOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const reloadIframe = () => {
    setIframeKey((prev) => prev + 1);
  };

  const openInNewTab = () => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const getContainerWidth = () => {
    switch (device) {
      case 'mobile':
        return 'max-w-[375px]';
      case 'tablet':
        return 'max-w-[768px]';
      default:
        return 'w-full';
    }
  };

  return (
    <div className="flex flex-col h-full bg-app-alt rounded-xl border border-slate-800/90 overflow-hidden shadow-2xl">
      {/* Top Preview Controls Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs">
        {/* Left: Device Switcher */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={() => setDevice('desktop')}
            className={`p-1.5 rounded-md transition-colors ${
              device === 'desktop' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Vista de escritorio (100%)"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDevice('tablet')}
            className={`p-1.5 rounded-md transition-colors ${
              device === 'tablet' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Vista tablet (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDevice('mobile')}
            className={`p-1.5 rounded-md transition-colors ${
              device === 'mobile' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Vista móvil (375px)"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Center: Security Badge & Resolution */}
        <div className="flex items-center gap-2 text-slate-400 text-[11px] font-mono">
          <button
            onClick={() => setIsSandboxNoticeOpen(!isSandboxNoticeOpen)}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-emerald-300 transition-colors"
            title="Ver detalles de aislamiento seguro"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sandbox Seguro</span>
          </button>
          <span className="hidden sm:inline text-slate-600">·</span>
          <span className="hidden sm:inline">
            {device === 'desktop' ? '100% Fluido' : device === 'tablet' ? '768 × 1024' : '375 × 667'}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={reloadIframe}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
            title="Recargar vista previa"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={openInNewTab}
            disabled={!html}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Abrir en pestaña nueva"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sandbox Info Overlay Dropdown */}
      {isSandboxNoticeOpen && (
        <div className="bg-emerald-950/40 border-b border-emerald-800/40 px-4 py-2.5 text-xs text-emerald-200/90 flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-emerald-300">Aislamiento Iframe Seguro</p>
            <p className="text-[11px] text-emerald-200/80 leading-relaxed mt-0.5">
              El contenido se ejecuta bajo la directiva <code className="bg-black/30 px-1 py-0.5 rounded font-mono">sandbox="allow-scripts allow-forms allow-modals"</code>. Los scripts no pueden acceder a tu sesión ni a cookies de Crea URL.
            </p>
          </div>
          <button
            onClick={() => setIsSandboxNoticeOpen(false)}
            className="text-xs text-emerald-400 hover:text-emerald-200 underline shrink-0 mt-0.5"
          >
            Entendido
          </button>
        </div>
      )}

      {/* Frame Viewport Container */}
      <div className="flex-1 overflow-auto bg-app-deep p-3 sm:p-5 flex items-center justify-center">
        {html ? (
          <div
            className={`h-full transition-all duration-300 flex flex-col bg-white rounded-lg shadow-xl overflow-hidden border border-slate-800 ${getContainerWidth()}`}
          >
            <iframe
              key={iframeKey}
              ref={iframeRef}
              title="Previsualización HTML Sandboxed"
              srcDoc={html}
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
              className="w-full h-full border-0 bg-white"
            />
          </div>
        ) : (
          <div className="text-center max-w-sm px-6 py-12 rounded-2xl border border-dashed border-slate-800 text-slate-400">
            <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-500">
              <Code className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1">Sin código HTML</h3>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Pega tu código en el editor de la izquierda, arrastra un archivo o prueba una plantilla prediseñada.
            </p>
            <button
              onClick={onOpenTemplates}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/80 rounded-lg transition-colors"
            >
              Cargar Plantilla de Ejemplo
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
