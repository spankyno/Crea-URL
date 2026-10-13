import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  ExternalLink, 
  QrCode, 
  Download, 
  Copy, 
  Check, 
  Lock, 
  Eye, 
  ShieldCheck, 
  Maximize2, 
  Minimize2, 
  X,
  Monitor,
  Tablet,
  Smartphone,
  Sparkles,
  Flag
} from 'lucide-react';
import { PageItem, ReportReason, REPORT_REASON_LABELS } from '../types';
import { SandboxedFrame } from './SandboxedFrame';
import { api } from '../services/api';
import { generateQrDataUrl, downloadQrImage } from '../utils/qr';
import { downloadHtmlFile, downloadZipBundle } from '../utils/exporter';

interface PublicPageViewProps {
  slug: string;
  onBack: () => void;
}

export const PublicPageView: React.FC<PublicPageViewProps> = ({ slug, onBack }) => {
  const [page, setPage] = useState<PageItem | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [showBar, setShowBar] = useState(true);
  // Denuncia de abuso
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | ''>('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportContact, setReportContact] = useState('');
  const [reportStatus, setReportStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [reportError, setReportError] = useState('');

  const handleSendReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportReason || !page) return;
    setReportStatus('sending');
    setReportError('');
    try {
      await api.reportPage(page.slug, { reason: reportReason, details: reportDetails, contact: reportContact });
      setReportStatus('sent');
    } catch (err: any) {
      setReportError(err.message || 'No se pudo enviar la denuncia');
      setReportStatus('error');
    }
  };

  const closeReport = () => {
    setShowReport(false);
    setReportStatus('idle');
    setReportReason('');
    setReportDetails('');
    setReportContact('');
    setReportError('');
  };
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getPage(slug)
      .then((data) => {
        setPage(data.page);
        if (data.hasPassword && !data.html) {
          setIsLocked(true);
        } else {
          setIsLocked(false);
          setHtmlContent(data.html || '');
        }
      })
      .catch((err) => {
        setError(err.message || 'Página no encontrada');
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setIsUnlocking(true);
    try {
      const res = await api.unlockPage(slug, password);
      setHtmlContent(res.html);
      setIsLocked(false);
    } catch (err: any) {
      alert(err.message || 'Contraseña incorrecta');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenQr = async () => {
    setShowQrModal(true);
    try {
      const url = `${window.location.origin}/p/${slug}`;
      const qr = await generateQrDataUrl(url);
      setQrDataUrl(qr);
    } catch (e) {
      console.error(e);
    }
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

  if (loading) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center text-slate-400 font-mono text-xs">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          <span>Cargando página alojada...</span>
        </div>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-4">
          <h2 className="text-xl font-bold text-strong">Página no disponible</h2>
          <p className="text-xs text-slate-400">
            {error || 'La URL solicitada no existe, ha sido eliminada o su tiempo de retención ha expirado.'}
          </p>
          <button
            onClick={onBack}
            className="px-4 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors"
          >
            Volver a Crea URL
          </button>
        </div>
      </div>
    );
  }

  // Password Unlock Screen
  if (isLocked) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-2xl space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-strong">{page.title}</h2>
            <p className="text-xs text-slate-400 mt-1">
              Esta página está protegida con contraseña por su creador.
            </p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-3 pt-2">
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Introduce la contraseña..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-strong outline-none text-center"
            />
            <button
              type="submit"
              disabled={isUnlocking}
              className="w-full py-2.5 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors shadow-sm"
            >
              {isUnlocking ? 'Verificando...' : 'Desbloquear y Ver'}
            </button>
          </form>

          <button
            onClick={onBack}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors pt-2 block mx-auto"
          >
            ← Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-app overflow-hidden">
      {/* Top Floating / Sticky Host Bar */}
      {showBar ? (
        <div className="h-12 bg-slate-950/95 border-b border-slate-800/90 px-4 flex items-center justify-between gap-3 text-xs shrink-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-slate-400 hover:text-strong transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="font-semibold text-slate-200">Crea URL</span>
            </button>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-400">
              <span className="max-w-[140px] sm:max-w-[200px] truncate text-slate-300 font-sans font-medium">
                {page.title}
              </span>
              <span className="text-slate-600">(/p/{page.slug})</span>
            </div>
          </div>

          {/* Device Switcher */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setDevice('desktop')}
              className={`p-1 rounded ${device === 'desktop' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'}`}
              title="Escritorio"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDevice('tablet')}
              className={`p-1 rounded ${device === 'tablet' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'}`}
              title="Tablet"
            >
              <Tablet className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDevice('mobile')}
              className={`p-1 rounded ${device === 'mobile' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'}`}
              title="Móvil"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="p-1.5 text-slate-400 hover:text-strong bg-slate-900 hover:bg-slate-800 rounded border border-slate-800 transition-colors"
              title="Copiar URL"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={handleOpenQr}
              className="p-1.5 text-slate-400 hover:text-emerald-400 bg-slate-900 hover:bg-slate-800 rounded border border-slate-800 transition-colors"
              title="Código QR"
            >
              <QrCode className="w-3.5 h-3.5" />
            </button>

            <a
              href={`/raw/${page.slug}`}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 text-slate-400 hover:text-strong bg-slate-900 hover:bg-slate-800 rounded border border-slate-800 transition-colors"
              title="Abrir vista directa Raw"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              onClick={() => setShowBar(false)}
              className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 rounded border border-slate-800 transition-colors flex items-center gap-1"
              title="Ocultar barra superior para vista completa"
            >
              <Maximize2 className="w-3 h-3" />
              <span className="hidden md:inline">Ocultar barra</span>
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowBar(true)}
          className="fixed top-2 right-2 z-40 bg-slate-900/90 text-slate-300 hover:text-strong px-2.5 py-1 rounded-md text-xs font-mono border border-slate-800 shadow-lg flex items-center gap-1 backdrop-blur"
        >
          <Minimize2 className="w-3 h-3" />
          <span>Mostrar barra</span>
        </button>
      )}

      {/* Frame Container */}
      <div className="flex-1 bg-app-deep overflow-auto flex items-center justify-center p-0 sm:p-2">
        <div className={`h-full transition-all duration-300 flex flex-col bg-white overflow-hidden shadow-2xl ${getContainerWidth()}`}>
          <SandboxedFrame
            html={htmlContent}
            title={page.title}
            className="w-full h-full border-0 bg-white"
          />
        </div>
      </div>

      {/* Aviso de contenido de usuario (siempre visible, aunque se oculte la barra superior) */}
      <div className="h-8 shrink-0 bg-slate-950/95 border-t border-slate-800/90 px-3 flex items-center justify-between gap-3 text-[11px] text-slate-400 z-30">
        <span className="truncate">Contenido creado por un usuario; no se revisa antes de publicarse.</span>
        <button
          onClick={() => setShowReport(true)}
          className="shrink-0 inline-flex items-center gap-1 text-slate-300 hover:text-rose-400 transition-colors underline-offset-2 hover:underline"
        >
          <Flag className="w-3 h-3" />
          Denunciar esta página
        </button>
      </div>

      {/* Report Modal */}
      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="report-title">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 max-w-md w-full space-y-4">
            {reportStatus === 'sent' ? (
              <div className="text-center space-y-3 py-2">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 mx-auto">
                  <Check className="w-5 h-5" />
                </div>
                <h3 id="report-title" className="text-base font-bold text-strong">Denuncia enviada</h3>
                <p className="text-xs text-slate-400">Gracias. Revisaremos la página y, si incumple las normas de uso, la retiraremos.</p>
                <button onClick={closeReport} className="px-3.5 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors">
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendReport} className="space-y-3">
                <div>
                  <h3 id="report-title" className="text-base font-bold text-strong flex items-center gap-2">
                    <Flag className="w-4 h-4 text-rose-400" /> Denunciar esta página
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Cuéntanos por qué incumple las <a href="/privacidad#normas" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">normas de uso</a>.
                  </p>
                </div>
                <label className="block text-xs text-slate-300">
                  Motivo
                  <select
                    required
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value as ReportReason)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-2.5 py-2 text-xs text-strong outline-none"
                  >
                    <option value="" disabled>Elige un motivo…</option>
                    {(Object.keys(REPORT_REASON_LABELS) as ReportReason[]).map((r) => (
                      <option key={r} value={r}>{REPORT_REASON_LABELS[r]}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-slate-300">
                  Detalles (opcional)
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-2.5 py-2 text-xs text-strong outline-none resize-none"
                  />
                </label>
                <label className="block text-xs text-slate-300">
                  Contacto (opcional, por si necesitamos más información)
                  <input
                    type="text"
                    value={reportContact}
                    onChange={(e) => setReportContact(e.target.value)}
                    maxLength={200}
                    autoComplete="off"
                    className="mt-1 w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-2.5 py-2 text-xs text-strong outline-none"
                  />
                </label>
                {reportStatus === 'error' && <p className="text-xs text-rose-400" role="alert">{reportError}</p>}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button type="button" onClick={closeReport} className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!reportReason || reportStatus === 'sending'}
                    className="px-3.5 py-2 text-xs font-semibold bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {reportStatus === 'sending' ? 'Enviando…' : 'Enviar denuncia'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQrModal && qrDataUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
            <h3 className="text-base font-bold text-strong">Escanear para abrir en móvil</h3>
            <div className="p-3 bg-white rounded-xl mx-auto inline-block shadow-md">
              <img src={qrDataUrl} alt="QR Code" className="w-48 h-48" />
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => downloadQrImage(qrDataUrl, `qr-${page.slug}.png`)}
                className="px-3.5 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors"
              >
                Descargar PNG
              </button>
              <button
                onClick={() => setShowQrModal(false)}
                className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
