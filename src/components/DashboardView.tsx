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
  KeyRound
} from 'lucide-react';
import { PageItem, CollectionItem, UserSession } from '../types';
import { api } from '../services/api';
import { formatBytes } from '../utils/htmlValidator';
import { generateQrDataUrl, downloadQrImage } from '../utils/qr';

interface DashboardViewProps {
  currentUser: UserSession;
  onViewPage: (slug: string) => void;
  onViewCollection: (slug: string) => void;
  onCreateNewPage: () => void;
  onSwitchToCollections: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  onViewPage,
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
                    const isExpired = p.expiresAt && new Date(p.expiresAt) < new Date();
                    const daysLeft = Math.ceil(
                      (new Date(p.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    );

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
                          {isExpired ? (
                            <span className="text-rose-400 font-semibold">Expirada</span>
                          ) : p.isEphemeral ? (
                            <span className="text-purple-400">Efímera (1h)</span>
                          ) : (
                            <span className={daysLeft <= 3 ? 'text-amber-400 font-medium' : 'text-slate-300'}>
                              {daysLeft} día(s)
                            </span>
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
