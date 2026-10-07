import React, { useState, useEffect } from 'react';
import { 
  Check, 
  Copy, 
  ExternalLink, 
  QrCode, 
  Download, 
  ShieldAlert, 
  Code, 
  X, 
  Sparkles,
  Lock
} from 'lucide-react';
import { PageItem } from '../types';
import { generateQrDataUrl, downloadQrImage } from '../utils/qr';
import { downloadZipBundle } from '../utils/exporter';

interface PublishModalProps {
  page: PageItem | null;
  isUpdate?: boolean;
  rawHtml: string;
  onClose: () => void;
  onViewPage: (slug: string) => void;
}

export const PublishModal: React.FC<PublishModalProps> = ({
  page,
  isUpdate,
  rawHtml,
  onClose,
  onViewPage,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'url' | 'qr' | 'embed'>('url');

  if (!page) return null;

  const publicUrl = `${window.location.origin}/p/${page.slug}`;
  const rawUrl = `${window.location.origin}/raw/${page.slug}`;
  const embedCode = `<iframe src="${publicUrl}" width="100%" height="600" frameborder="0" sandbox="allow-scripts allow-forms allow-modals"></iframe>`;

  // Generate QR on mount
  useEffect(() => {
    generateQrDataUrl(publicUrl)
      .then(setQrDataUrl)
      .catch((e) => console.error('QR code error', e));
  }, [publicUrl]);

  const copyToClipboard = (text: string, type: 'link' | 'raw' | 'embed') => {
    navigator.clipboard.writeText(text);
    if (type === 'link') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else if (type === 'raw') {
      setCopiedRaw(true);
      setTimeout(() => setCopiedRaw(false), 2000);
    } else {
      setCopiedEmbed(true);
      setTimeout(() => setCopiedEmbed(false), 2000);
    }
  };

  const formattedExpires = new Date(page.expiresAt).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0f172a] border border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header with success badge */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 mx-auto mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">{isUpdate ? '¡Cambios Guardados!' : '¡Página Publicada con Éxito!'}</h2>
          <p className="text-xs text-slate-400 mt-1">
            {isUpdate ? 'Tu página se ha actualizado y mantiene la misma URL.' : 'Tu archivo estático ya está alojado y accesible globalmente.'}
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg mb-5 border border-slate-800">
          <button
            onClick={() => setActiveTab('url')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'url' ? 'bg-slate-800 text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Enlace Limpio
          </button>
          <button
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'qr' ? 'bg-slate-800 text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Código QR
          </button>
          <button
            onClick={() => setActiveTab('embed')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'embed' ? 'bg-slate-800 text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Código Embebido
          </button>
        </div>

        {/* Tab 1: Clean URL */}
        {activeTab === 'url' && (
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                URL Pública Compartible
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={publicUrl}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-emerald-400 select-all outline-none"
                />
                <button
                  onClick={() => copyToClipboard(publicUrl, 'link')}
                  className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? '¡Copiado!' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                URL Directa Raw (Sin interfaz contenedora)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={rawUrl}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 select-all outline-none"
                />
                <button
                  onClick={() => copyToClipboard(rawUrl, 'raw')}
                  className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                >
                  {copiedRaw ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Retention & Security status badge */}
            <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 text-xs text-slate-400 space-y-1.5">
              <div className="flex items-center justify-between">
                <span>Disponible hasta:</span>
                <span className="font-mono text-slate-200 font-semibold">{formattedExpires}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Seguridad:</span>
                <span className="font-medium text-slate-300 flex items-center gap-1">
                  {page.hasPassword ? (
                    <>
                      <Lock className="w-3 h-3 text-amber-400" /> Protegida con clave
                    </>
                  ) : (
                    'Acceso público directo'
                  )}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: QR Code */}
        {activeTab === 'qr' && (
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-white rounded-xl shadow-md">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Código QR de la página" className="w-48 h-48" />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-slate-400 font-mono text-xs">
                  Generando QR...
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Escanea con tu cámara móvil para abrir la página en vivo al instante.
            </p>
            {qrDataUrl && (
              <button
                onClick={() => downloadQrImage(qrDataUrl, `qr-${page.slug}.png`)}
                className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                Descargar Imagen QR (PNG)
              </button>
            )}
          </div>
        )}

        {/* Tab 3: Embed Iframe */}
        {activeTab === 'embed' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Inserta este snippet en tu propio sitio web o documentación para incrustar la página de forma segura:
            </p>
            <div className="relative">
              <textarea
                readOnly
                value={embedCode}
                rows={4}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 outline-none select-all"
              />
              <button
                onClick={() => copyToClipboard(embedCode, 'embed')}
                className="absolute top-2 right-2 px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors flex items-center gap-1"
              >
                {copiedEmbed ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedEmbed ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-800">
          <button
            onClick={() => downloadZipBundle(page, rawHtml)}
            className="px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Descargar ZIP
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={() => {
                onClose();
                onViewPage(page.slug);
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <span>Ver Página</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
