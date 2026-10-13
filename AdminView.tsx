import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Trash2, 
  RefreshCw, 
  Search, 
  Eye, 
  ExternalLink, 
  HardDrive, 
  Clock, 
  Lock, 
  AlertTriangle, 
  CheckCircle2,
  FileCode,
  FolderKanban
} from 'lucide-react';
import { AdminStats, PageItem, UserSession, ReportItem, REPORT_REASON_LABELS } from '../types';
import { api } from '../services/api';
import { formatBytes } from '../utils/htmlValidator';

interface AdminViewProps {
  currentUser: UserSession;
  onViewPage: (slug: string) => void;
}

export const AdminView: React.FC<AdminViewProps> = ({ currentUser, onViewPage }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [allPages, setAllPages] = useState<PageItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'password' | 'ephemeral'>('all');
  const [isPurging, setIsPurging] = useState(false);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [fetchedStats, fetchedPages, fetchedReports] = await Promise.all([
        api.getAdminStats(currentUser),
        api.getPages(currentUser),
        api.getReports(currentUser).catch(() => [] as ReportItem[]),
      ]);
      setStats(fetchedStats);
      setAllPages(fetchedPages);
      setReports(fetchedReports);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // El acceso lo decide el servidor (token de Clerk verificado); aquí no hay clave que introducir
    if (currentUser.role === 'admin') {
      loadAdminData();
    }
  }, [currentUser]);

  const handlePurgeExpired = async () => {
    if (!window.confirm('¿Seguro que deseas eliminar definitivamente todas las páginas expiradas del almacenamiento?')) return;
    setIsPurging(true);
    try {
      const res = await api.purgeExpiredPages(currentUser);
      alert(`Limpieza completada: se han eliminado ${res.purgedCount} páginas expiradas.`);
      loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Error al purgar páginas');
    } finally {
      setIsPurging(false);
    }
  };

  const handleDismissReport = async (id: string) => {
    try {
      await api.resolveReport(currentUser, id, 'dismissed');
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      alert(err.message || 'No se pudo descartar la denuncia');
    }
  };

  const handleTakedownReported = async (report: ReportItem) => {
    const question = report.pageExists
      ? `¿Eliminar la página «${report.slug}» y dar la denuncia por resuelta?`
      : '¿Dar esta denuncia por resuelta? (la página ya no existe)';
    if (!window.confirm(question)) return;
    try {
      if (report.pageExists) await api.deletePage(report.slug, currentUser);
      await api.resolveReport(currentUser, report.id, 'resolved');
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'No se pudo eliminar la página');
    }
  };

  const handleDeletePage = async (slug: string) => {
    if (!window.confirm(`¿Eliminar la página /p/${slug} y su archivo HTML asociado?`)) return;
    try {
      await api.deletePage(slug, { ...currentUser, role: 'admin' });
      setAllPages(allPages.filter((p) => p.slug !== slug));
      if (stats) {
        setStats({ ...stats, totalPages: stats.totalPages - 1 });
      }
    } catch (err: any) {
      alert(err.message || 'Error al eliminar');
    }
  };

  // Filtered pages
  const now = new Date().toISOString();
  const filteredPages = allPages.filter((page) => {
    const matchesQuery =
      page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (page.userId || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesQuery) return false;

    if (statusFilter === 'active') {
      return !page.expiresAt || page.expiresAt >= now;
    }
    if (statusFilter === 'expired') {
      return page.expiresAt && page.expiresAt < now;
    }
    if (statusFilter === 'password') {
      return page.hasPassword;
    }
    if (statusFilter === 'ephemeral') {
      return page.isEphemeral;
    }

    return true;
  });

  if (currentUser.role !== 'admin') return null; // App.tsx ya muestra «Acceso restringido»

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-strong tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <span>Consola de Administración Global</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Supervisión del almacenamiento de páginas estáticas, cuotas y depuración de archivos expirados.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadAdminData}
            className="p-2 text-slate-400 hover:text-strong bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors"
            title="Actualizar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handlePurgeExpired}
            disabled={isPurging}
            className="px-3.5 py-2 text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isPurging ? 'Purgando...' : 'Purgar Expiradas'}</span>
          </button>
        </div>
      </div>

      {/* Global Metrics Grid */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>Total Páginas</span>
              <FileCode className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-strong tabular-nums">{stats.totalPages}</div>
            <div className="text-[11px] text-slate-500 mt-1">
              {stats.activePages} activas · {stats.expiredPages} expiradas
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>Visitas Totales</span>
              <Eye className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-strong tabular-nums">{stats.totalViews}</div>
            <div className="text-[11px] text-slate-500 mt-1">Tráfico total acumulado</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>Almacenamiento Total</span>
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-strong tabular-nums">
              {formatBytes(stats.totalSizeBytes)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">En almacenamiento Supabase</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>Colecciones Creadas</span>
              <FolderKanban className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-strong tabular-nums">{stats.totalCollections}</div>
            <div className="text-[11px] text-slate-500 mt-1">
              {stats.passwordProtectedPages} con contraseña
            </div>
          </div>
        </div>
      )}

      {/* Denuncias abiertas */}
      {reports.length > 0 && (
        <section className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-4 space-y-3" aria-labelledby="denuncias-titulo">
          <h2 id="denuncias-titulo" className="text-sm font-semibold text-strong flex items-center gap-2">
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold">{reports.length}</span>
            Denuncias abiertas
          </h2>
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono text-emerald-400">/p/{r.slug}</span>
                    <span className="text-slate-500"> · </span>
                    <span className="text-slate-300">{r.pageTitle || (r.pageExists ? 'Sin título' : 'Página ya eliminada')}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-300">{REPORT_REASON_LABELS[r.reason] || r.reason}</span>
                </div>
                {r.details && <p className="text-slate-400 whitespace-pre-wrap break-words">{r.details}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span>
                    {new Date(r.createdAt).toLocaleString('es-ES')}
                    {r.contact && <> · Contacto: <span className="text-slate-300">{r.contact}</span></>}
                  </span>
                  <div className="flex items-center gap-2">
                    {r.pageExists && (
                      <button onClick={() => onViewPage(r.slug)} className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors">Ver página</button>
                    )}
                    <button onClick={() => handleTakedownReported(r)} className="px-2 py-1 rounded bg-rose-500 hover:bg-rose-400 text-white font-semibold transition-colors">
                      {r.pageExists ? 'Eliminar página' : 'Cerrar'}
                    </button>
                    <button onClick={() => handleDismissReport(r.id)} className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors">Descartar</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por título, slug o userId..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-strong outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto text-xs">
          {(['all', 'active', 'expired', 'password', 'ephemeral'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                statusFilter === filter
                  ? 'bg-slate-800 text-emerald-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {filter === 'all'
                ? 'Todas'
                : filter === 'active'
                ? 'Activas'
                : filter === 'expired'
                ? 'Expiradas'
                : filter === 'password'
                ? 'Con Clave'
                : 'Efímeras'}
            </button>
          ))}
        </div>
      </div>

      {/* Pages Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <th className="px-4 py-3">Slug & Título</th>
                <th className="px-4 py-3">Usuario / Rol</th>
                <th className="px-4 py-3">Tamaño</th>
                <th className="px-4 py-3">Visitas</th>
                <th className="px-4 py-3">Expiración</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
              {filteredPages.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    No se encontraron páginas con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredPages.map((p) => {
                  const isExpired = p.expiresAt && new Date(p.expiresAt) < new Date();
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-sans font-medium text-slate-100">{p.title}</div>
                        <div className="text-emerald-400 text-xs">/p/{p.slug}</div>
                      </td>

                      <td className="px-4 py-3.5 text-slate-400">
                        <div className="truncate max-w-[120px]">{p.userId}</div>
                        <span className="text-[10px] text-slate-500 uppercase">{p.userRole}</span>
                      </td>

                      <td className="px-4 py-3.5 tabular-nums text-slate-400">
                        {formatBytes(p.sizeBytes)}
                      </td>

                      <td className="px-4 py-3.5 tabular-nums text-slate-200">
                        {p.viewsCount || 0}
                      </td>

                      <td className="px-4 py-3.5 tabular-nums text-slate-400">
                        {new Date(p.expiresAt).toLocaleDateString('es-ES')}
                      </td>

                      <td className="px-4 py-3.5 font-sans">
                        {isExpired ? (
                          <span className="text-rose-400 text-[11px] font-semibold">Expirada</span>
                        ) : p.isEphemeral ? (
                          <span className="text-purple-400 text-[11px]">Efímera</span>
                        ) : p.hasPassword ? (
                          <span className="text-amber-400 text-[11px] flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Clave
                          </span>
                        ) : (
                          <span className="text-emerald-400 text-[11px]">Activa</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right font-sans">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => onViewPage(p.slug)}
                            className="p-1.5 text-slate-400 hover:text-strong hover:bg-slate-800 rounded transition-colors"
                            title="Previsualizar"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={`/raw/${p.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                            title="Ver HTML Raw"
                          >
                            <FileCode className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={() => handleDeletePage(p.slug)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors"
                            title="Eliminar definitivamente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
