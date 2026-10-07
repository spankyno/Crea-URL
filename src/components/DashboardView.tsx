import React, { useState, useEffect } from 'react';
import { 
  FileCode, 
  Eye, 
  Clock, 
  Trash2, 
  RefreshCw, 
  Lock, 
  QrCode, 
  ExternalLink, 
  Plus, 
  HardDrive, 
  FolderKanban, 
  Copy, 
  Check, 
  ShieldAlert,
  Sparkles,
  KeyRound,
  Pencil,
  AlertTriangle,
  BarChart3
} from 'lucide-react';
import { PageItem, CollectionItem, UserSession, PageStats } from '../types';
import { api } from '../services/api';
import { formatBytes } from '../utils/htmlValidator';
import { generateQrDataUrl, downloadQrImage } from '../utils/qr';

interface DashboardViewProps {
  currentUser: UserSession;
  onViewPage: (slug: string) => void;
  onEditPage: (slug: string) => void;
  onViewCollection: (slug: string) => void;
  onCreateNewPage: () => void;
  onSwitchToCollections: () => void;
}

// --- Avisos de caducidad ---
const WARNING_DAYS = 7; // aviso (ámbar)
const CRITICAL_DAYS = 3; // urgente (rojo)

type ExpiryStatus = 'expired' | 'ephemeral' | 'critical' | 'warning' | 'ok';

interface ExpiryInfo {
  status: ExpiryStatus;
  label: string;
  msLeft: number;
}

function getExpiryInfo(p: PageItem): ExpiryInfo {
  const msLeft = p.expiresAt ? new Date(p.expiresAt).getTime() - Date.now() : Infinity;
  const minutes = Math.max(0, Math.floor(msLeft / 60000));
  const hours = Math.floor(msLeft / 3600000);
  const days = Math.ceil(msLeft / 86400000);

  if (msLeft <= 0) return { status: 'expired', label: 'Expirada', msLeft };
  if (p.isEphemeral) return { status: 'ephemeral', label: `Efímera · quedan ${minutes} min`, msLeft };

  const label =
    msLeft < 3600000
      ? `Caduca en ${minutes} min`
      : msLeft < 86400000
        ? `Caduca en ${hours} h`
        : days === 1
          ? 'Caduca mañana'
          : `${days} días`;

  if (msLeft <= CRITICAL_DAYS * 86400000) return { status: 'critical', label, msLeft };
  if (msLeft <= WARNING_DAYS * 86400000) return { status: 'warning', label, msLeft };
  return { status: 'ok', label, msLeft };
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  onViewPage,
  onEditPage,
  onViewCollection,
  onCreateNewPage,
  onSwitchToCollections,
}) => {
  const [pages, setPages] = useState<PageItem[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pages' | 'collections'>('pages');
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // QR Modal State
  const [qrModalPage, setQrModalPage] = useState<PageItem | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Password Edit Modal
  const [passwordModalPage, setPasswordModalPage] = useState<PageItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedPages, fetchedCollections] = await Promise.all([
        api.getPages(currentUser),
        api.getCollections(currentUser),
      ]);
      setPages(fetchedPages);
      setCollections(fetchedCollections);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const handleCopyLink = (slug: string) => {
    const url = `${window.location.origin}/p/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const handleExtend = async (slug: string) => {
    try {
      const updated = await api.extendPage(slug, currentUser);
      setPages((prev) => prev.map((p) => (p.slug === slug ? updated : p)));
      alert(`¡Prorrogada! La página ahora está activa hasta el ${new Date(updated.expiresAt).toLocaleDateString('es-ES')}`);
    } catch (err: any) {
      alert(err.message || 'Error al extender');
    }
  };

  const [isExtendingAll, setIsExtendingAll] = useState(false);

  // Estadísticas de visitas
  const [statsModalPage, setStatsModalPage] = useState<PageItem | null>(null);
  const [stats, setStats] = useState<PageStats | null>(null);
  const [statsDays, setStatsDays] = useState<7 | 30 | 90>(30);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const loadStats = async (page: PageItem, days: 7 | 30 | 90) => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      setStats(await api.getPageStats(page.slug, days, currentUser));
    } catch (err: any) {
      setStats(null);
      setStatsError(err.message || 'No se pudieron cargar las estadísticas');
    } finally {
      setStatsLoading(false);
    }
  };

  const handleOpenStats = (page: PageItem) => {
    setStatsModalPage(page);
    setStats(null);
    loadStats(page, statsDays);
  };

  const handleChangeStatsDays = (days: 7 | 30 | 90) => {
    setStatsDays(days);
    if (statsModalPage) loadStats(statsModalPage, days);
  };

  const formatDay = (day: string) =>
    new Date(day + 'T00:00:00Z').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', timeZone: 'UTC' });

  const handleExtendAll = async (targets: PageItem[]) => {
    if (targets.length === 0) return;
    if (!window.confirm(`¿Prorrogar +90 días ${targets.length} página(s)?`)) return;
    setIsExtendingAll(true);
    let ok = 0;
    let failed = 0;
    for (const t of targets) {
      try {
        const updated = await api.extendPage(t.slug, currentUser);
        setPages((prev) => prev.map((p) => (p.slug === t.slug ? updated : p)));
        ok++;
      } catch (e) {
        failed++;
      }
    }
    setIsExtendingAll(false);
    alert(
      failed === 0
        ? `¡Listo! Se prorrogaron ${ok} página(s).`
        : `Se prorrogaron ${ok} página(s) y ${failed} fallaron. Inténtalo de nuevo.`
    );
  };

  const handleDeletePage = async (slug: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar esta página y todo su contenido?')) return;
    try {
      await api.deletePage(slug, currentUser);
      setPages((prev) => prev.filter((p) => p.slug !== slug));
    } catch (err: any) {
      alert(err.message || 'Error al eliminar');
    }
  };

  const handleOpenQr = async (page: PageItem) => {
    setQrModalPage(page);
    try {
      const url = `${window.location.origin}/p/${page.slug}`;
      const qr = await generateQrDataUrl(url);
      setQrDataUrl(qr);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSavePassword = async () => {
    if (!passwordModalPage) return;
    setIsUpdatingPassword(true);
    try {
      const updated = await api.updatePagePassword(passwordModalPage.slug, newPassword, currentUser);
      setPages((prev) => prev.map((p) => (p.slug === updated.slug ? updated : p)));
      setPasswordModalPage(null);
      setNewPassword('');
    } catch (err: any) {
      alert(err.message || 'Error al cambiar contraseña');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // Páginas que requieren atención (las efímeras se excluyen: están pensadas para desaparecer)
  const expiredPages = pages.filter((p) => getExpiryInfo(p).status === 'expired');
  const criticalPages = pages.filter((p) => getExpiryInfo(p).status === 'critical');
  const warningPages = pages.filter((p) => getExpiryInfo(p).status === 'warning');
  const needAttention = [...expiredPages, ...criticalPages, ...warningPages];

  const totalStorage = pages.reduce((acc, p) => acc + (p.sizeBytes || 0), 0);
  const totalViews = pages.reduce((acc, p) => acc + (p.viewsCount || 0), 0);
  const maxStorage = currentUser.role === 'anon' ? 5 * 1024 * 1024 : 100 * 1024 * 1024;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-200">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Panel de Control</span>
            <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {currentUser.role === 'anon' ? 'Modo Anónimo' : currentUser.role === 'admin' ? 'SuperAdmin' : 'Cuenta Pro Free'}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Gestiona tus páginas publicadas, monitoriza estadísticas de visitas y prorroga tus fechas de caducidad.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors"
            title="Recargar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onCreateNewPage}
            className="px-3.5 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Publicar Nuevo HTML</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0f172a] border border-slate-800/90 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Páginas Publicadas</span>
            <FileCode className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white tabular-nums">{pages.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {currentUser.role === 'anon' ? 'Sin límite de páginas (15 días c/u)' : 'Alojamiento extendido a 3 meses'}
          </div>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/90 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Visitas Totales</span>
            <Eye className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white tabular-nums">{totalViews}</div>
          <div className="text-[11px] text-slate-500 mt-1">Conteo en tiempo real</div>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/90 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Almacenamiento Usado</span>
            <HardDrive className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white tabular-nums">
            {formatBytes(totalStorage)}
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, (totalStorage / maxStorage) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Avisos de caducidad */}
      {!loading && needAttention.length > 0 && (
        <div
          className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            expiredPages.length > 0 || criticalPages.length > 0
              ? 'bg-rose-950/30 border-rose-800/50'
              : 'bg-amber-950/30 border-amber-800/50'
          }`}
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`w-5 h-5 mt-0.5 shrink-0 ${
                expiredPages.length > 0 || criticalPages.length > 0 ? 'text-rose-400' : 'text-amber-400'
              }`}
            />
            <div className="text-sm">
              <p className="font-semibold text-slate-100">
                {needAttention.length === 1
                  ? '1 página necesita atención'
                  : `${needAttention.length} páginas necesitan atención`}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {[
                  expiredPages.length > 0 && `${expiredPages.length} caducada(s) (se eliminarán en breve)`,
                  criticalPages.length > 0 && `${criticalPages.length} caducan en menos de ${CRITICAL_DAYS} días`,
                  warningPages.length > 0 && `${warningPages.length} caducan en menos de ${WARNING_DAYS} días`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                . Prorrógalas para mantenerlas online.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleExtendAll(needAttention)}
            disabled={isExtendingAll}
            className="shrink-0 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isExtendingAll ? 'Prorrogando...' : 'Prorrogar todas +90 días'}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('pages')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'pages' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span>Mis Páginas ({pages.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('collections')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'collections' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          <span>Colecciones ({collections.length})</span>
        </button>
      </div>

      {/* Pages Table */}
      {activeTab === 'pages' && (
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="p-12 text-center text-slate-400 font-mono text-xs">Cargando páginas...</div>
          ) : pages.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <FileCode className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-sm font-medium text-slate-200 mb-1">Aún no has publicado páginas</p>
              <p className="text-xs text-slate-500 mb-4">
                Sube tu primer archivo HTML o utiliza una de las plantillas prediseñadas.
              </p>
              <button
                onClick={onCreateNewPage}
                className="px-4 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors"
              >
                Publicar Ahora
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                    <th className="px-4 py-3">Página & Enlace</th>
                    <th className="px-4 py-3">Tamaño</th>
                    <th className="px-4 py-3">Visitas</th>
                    <th className="px-4 py-3">Expira</th>
                    <th className="px-4 py-3">Seguridad</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                  {pages.map((p) => {
                    const expiry = getExpiryInfo(p);

                    return (
                      <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="font-sans font-medium text-slate-100 text-sm">
                            {p.title || `Página ${p.slug}`}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-emerald-400 text-xs">/p/{p.slug}</span>
                            <button
                              onClick={() => handleCopyLink(p.slug)}
                              className="text-slate-500 hover:text-slate-300 p-0.5"
                              title="Copiar enlace"
                            >
                              {copiedSlug === p.slug ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 tabular-nums text-slate-400">
                          {formatBytes(p.sizeBytes)}
                        </td>

                        <td className="px-4 py-3.5 tabular-nums">
                          <span className="inline-flex items-center gap-1 text-slate-200">
                            <Eye className="w-3 h-3 text-slate-500" /> {p.viewsCount || 0}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 tabular-nums">
                          {expiry.status === 'expired' ? (
                            <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                              <AlertTriangle className="w-3 h-3" /> Expirada
                            </span>
                          ) : expiry.status === 'ephemeral' ? (
                            <span className="text-purple-400">{expiry.label}</span>
                          ) : expiry.status === 'critical' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 font-medium">
                              <Clock className="w-3 h-3" /> {expiry.label}
                            </span>
                          ) : expiry.status === 'warning' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-medium">
                              <Clock className="w-3 h-3" /> {expiry.label}
                            </span>
                          ) : (
                            <span className="text-slate-300">{expiry.label}</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 font-sans">
                          {p.hasPassword ? (
                            <span className="inline-flex items-center gap-1 text-amber-400 text-[11px]">
                              <Lock className="w-3 h-3" /> Con clave
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">Pública</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right font-sans">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => onViewPage(p.slug)}
                              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                              title="Ver página"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleOpenStats(p)}
                              className="p-1.5 text-slate-400 hover:text-violet-400 hover:bg-slate-800 rounded transition-colors"
                              title="Estadísticas de visitas"
                            >
                              <BarChart3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => onEditPage(p.slug)}
                              className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded transition-colors"
                              title="Editar contenido (misma URL)"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleOpenQr(p)}
                              className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                              title="Generar QR"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => {
                                setPasswordModalPage(p);
                                setNewPassword('');
                              }}
                              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition-colors"
                              title="Configurar contraseña"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleExtend(p.slug)}
                              className="px-2 py-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-800/60 rounded transition-colors"
                              title="Prorrogar +90 días"
                            >
                              +90d
                            </button>

                            <button
                              onClick={() => handleDeletePage(p.slug)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors"
                              title="Eliminar página"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Collections Tab */}
      {activeTab === 'collections' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={onSwitchToCollections}
              className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear Nueva Colección</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.length === 0 ? (
              <div className="sm:col-span-3 p-12 text-center text-slate-400 bg-[#0f172a] border border-slate-800 rounded-xl">
                <FolderKanban className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <p className="text-sm font-medium text-slate-200 mb-1">Sin colecciones creadas</p>
                <p className="text-xs text-slate-500 mb-4">
                  Agrupa varias páginas publicadas bajo una sola URL limpia (/c/slug).
                </p>
                <button
                  onClick={onSwitchToCollections}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
                >
                  Ir a Colecciones
                </button>
              </div>
            ) : (
              collections.map((c) => (
                <div
                  key={c.id}
                  className="bg-[#0f172a] border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-colors"
                >
                  <div>
                    <h3 className="font-semibold text-slate-100 text-sm mb-1">{c.title}</h3>
                    <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                      {c.description || 'Sin descripción'}
                    </p>
                    <div className="text-[11px] font-mono text-emerald-400">/c/{c.slug}</div>
                  </div>

                  <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800/80 text-xs">
                    <span className="text-slate-500 font-mono">{c.pageSlugs.length} páginas</span>
                    <button
                      onClick={() => onViewCollection(c.slug)}
                      className="px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors flex items-center gap-1"
                    >
                      <span>Abrir</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {statsModalPage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setStatsModalPage(null)}
        >
          <div
            className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 sm:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-violet-400 shrink-0" />
                  <span className="truncate">Estadísticas · {statsModalPage.title || statsModalPage.slug}</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">/p/{statsModalPage.slug}</p>
              </div>
              <div className="flex items-center gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded-lg shrink-0">
                {([7, 30, 90] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => handleChangeStatsDays(d)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                      statsDays === d ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {d} días
                  </button>
                ))}
              </div>
            </div>

            {statsLoading && <div className="py-12 text-center text-xs text-slate-400">Cargando estadísticas…</div>}

            {statsError && !statsLoading && (
              <div className="py-6 text-center text-xs text-rose-300 bg-rose-950/30 border border-rose-900/50 rounded-lg px-3">
                {statsError}
              </div>
            )}

            {stats && !statsLoading && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { label: 'Visitas totales', value: stats.totalViews },
                    { label: `Últimos ${stats.days} días`, value: stats.viewsInRange },
                    { label: 'Últimos 7 días', value: stats.viewsLast7 },
                    { label: 'Hoy', value: stats.viewsToday },
                  ].map((c) => (
                    <div key={c.label} className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">{c.label}</div>
                      <div className="text-xl font-bold text-white tabular-nums mt-0.5">{c.value}</div>
                    </div>
                  ))}
                </div>

                {(() => {
                  const max = Math.max(1, ...stats.series.map((x) => x.views));
                  return (
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5">
                        <span>Visitas por día</span>
                        <span>máx. {max}</span>
                      </div>
                      <div
                        className="flex items-end gap-[2px] h-36 px-1 border-b border-slate-700"
                        role="img"
                        aria-label={`Gráfico de visitas de los últimos ${stats.days} días`}
                      >
                        {stats.series.map((x) => (
                          <div
                            key={x.day}
                            className="flex-1 flex items-end h-full group"
                            title={`${formatDay(x.day)}: ${x.views} visita(s)`}
                          >
                            <div
                              className={`w-full rounded-t-sm transition-colors ${
                                x.views > 0 ? 'bg-violet-500 group-hover:bg-violet-300' : 'bg-slate-800'
                              }`}
                              style={{ height: x.views > 0 ? `${Math.max(4, (x.views / max) * 100)}%` : '2px' }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-1">
                        <span>{formatDay(stats.series[0].day)}</span>
                        <span>{formatDay(stats.series[Math.floor(stats.series.length / 2)].day)}</span>
                        <span>{formatDay(stats.series[stats.series.length - 1].day)}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="text-[11px] text-slate-400 space-y-1">
                  {stats.bestDay && (
                    <p>
                      Mejor día del periodo: <strong className="text-slate-200">{formatDay(stats.bestDay.day)}</strong>{' '}
                      con {stats.bestDay.views} visita(s).
                    </p>
                  )}
                  {stats.lastViewedAt && (
                    <p>
                      Última visita:{' '}
                      <strong className="text-slate-200">{new Date(stats.lastViewedAt).toLocaleString('es-ES')}</strong>
                    </p>
                  )}
                  {stats.viewsBeforeTracking > 0 && (
                    <p>
                      {stats.viewsBeforeTracking} visita(s) son anteriores al seguimiento diario y solo cuentan en el total.
                    </p>
                  )}
                  <p className="text-slate-500">
                    Los días se cuentan en hora UTC. No se cuentan robots ni las vistas previas de redes sociales.
                  </p>
                </div>
              </>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setStatsModalPage(null)}
                className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {qrModalPage && qrDataUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
            <h3 className="text-base font-bold text-white">Código QR para {qrModalPage.title}</h3>
            <div className="p-3 bg-white rounded-xl mx-auto inline-block shadow-md">
              <img src={qrDataUrl} alt="QR Code" className="w-48 h-48" />
            </div>
            <p className="text-xs text-slate-400 font-mono">
              {window.location.origin}/p/{qrModalPage.slug}
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => downloadQrImage(qrDataUrl, `qr-${qrModalPage.slug}.png`)}
                className="px-3.5 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors"
              >
                Descargar PNG
              </button>
              <button
                onClick={() => setQrModalPage(null)}
                className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {passwordModalPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <span>Contraseña de Acceso</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Introduce una contraseña para proteger la página o déjala vacía para hacerla pública.
            </p>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nueva contraseña (o vacío para quitar)"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setPasswordModalPage(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleSavePassword}
                disabled={isUpdatingPassword}
                className="px-4 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors"
              >
                {isUpdatingPassword ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
