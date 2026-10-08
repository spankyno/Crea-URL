import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Sparkles, 
  Minimize2, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Trash2, 
  FileDown, 
  Archive, 
  Lock, 
  Clock, 
  FolderPlus, 
  Layers, 
  Send,
  Zap
} from 'lucide-react';
import { UserSession, CollectionItem } from '../types';
import { validateHtml, minifyHtml, formatBytes, getByteLength } from '../utils/htmlValidator';
import { downloadHtmlFile, downloadZipBundle } from '../utils/exporter';

interface EditorZoneProps {
  html: string;
  setHtml: (val: string) => void;
  title: string;
  setTitle: (val: string) => void;
  description: string;
  setDescription: (val: string) => void;
  customSlug: string;
  setCustomSlug: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  isEphemeral: boolean;
  setIsEphemeral: (val: boolean) => void;
  collectionId: string;
  setCollectionId: (val: string) => void;
  collections: CollectionItem[];
  currentUser: UserSession;
  onPublish: () => void;
  isPublishing: boolean;
  editingSlug?: string | null;
  onCancelEdit?: () => void;
  onOpenTemplates: () => void;
}

export const EditorZone: React.FC<EditorZoneProps> = ({
  html,
  setHtml,
  title,
  setTitle,
  description,
  setDescription,
  customSlug,
  setCustomSlug,
  password,
  setPassword,
  isEphemeral,
  setIsEphemeral,
  collectionId,
  setCollectionId,
  collections,
  currentUser,
  onPublish,
  isPublishing,
  editingSlug,
  onCancelEdit,
  onOpenTemplates,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const [minifiedNotice, setMinifiedNotice] = useState<string | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate sizes & limits
  const sizeBytes = getByteLength(html);
  const maxSize = currentUser.role === 'anon' ? 1 * 1024 * 1024 : 10 * 1024 * 1024;
  const sizePercent = Math.min(100, (sizeBytes / maxSize) * 100);
  const isOverSize = sizeBytes > maxSize;

  // Validation
  const validation = validateHtml(html);

  // Line count
  const lineCount = html ? html.split('\n').length : 0;

  // Auto-save to localStorage
  useEffect(() => {
    if (!html) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('creaurl_draft_html', html);
        if (title) localStorage.setItem('creaurl_draft_title', title);
        const d = new Date();
        setLastSavedTime(
          `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
        );
      } catch (e) {
        console.error('LocalStorage save error:', e);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [html, title]);

  // Handle file drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      alert('Por favor selecciona un archivo con extensión .html o .htm');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setHtml(content);
      if (!title) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
      }
    };
    reader.readAsText(file);
  };

  // Minify action
  const handleMinify = () => {
    if (!html) return;
    const { minified, savedBytes, savedPercent } = minifyHtml(html);
    setHtml(minified);
    setMinifiedNotice(`Ahorro de ${formatBytes(savedBytes)} (${savedPercent.toFixed(1)}%)`);
    setTimeout(() => setMinifiedNotice(null), 4000);
  };

  // Clear code
  const handleClear = () => {
    if (window.confirm('¿Deseas vaciar el editor?')) {
      setHtml('');
      setTitle('');
      setCustomSlug('');
      setPassword('');
      localStorage.removeItem('creaurl_draft_html');
      localStorage.removeItem('creaurl_draft_title');
    }
  };

  return (
    <div className="flex flex-col h-full bg-app-alt rounded-xl border border-slate-800/90 shadow-2xl overflow-hidden">
      {/* Top Editor Action Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título de la página (ej: Mi Web Estática)..."
            className="bg-slate-950/80 border border-slate-800 focus:border-emerald-500/80 rounded-lg px-2.5 py-1 text-xs text-strong placeholder-slate-500 outline-none w-52 sm:w-64 transition-colors"
          />
          {lastSavedTime && (
            <span className="hidden lg:inline text-[11px] text-slate-500 font-mono">
              Borrador guardado {lastSavedTime}
            </span>
          )}
        </div>

        {/* Toolbar Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleMinify}
            disabled={!html}
            className="px-2 py-1 text-slate-300 hover:text-strong bg-slate-800/60 hover:bg-slate-800 rounded border border-slate-700/60 transition-colors flex items-center gap-1 text-[11px] disabled:opacity-40 disabled:pointer-events-none"
            title="Minificar HTML eliminando comentarios y espacios superfluos"
          >
            <Minimize2 className="w-3 h-3 text-sky-400" />
            <span className="hidden sm:inline">Minificar</span>
          </button>

          <button
            onClick={() => downloadHtmlFile(html, `${customSlug || 'pagina'}.html`)}
            disabled={!html}
            className="p-1.5 text-slate-300 hover:text-strong bg-slate-800/60 hover:bg-slate-800 rounded border border-slate-700/60 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            title="Descargar archivo .html"
          >
            <FileDown className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => downloadZipBundle({ title, slug: customSlug }, html)}
            disabled={!html}
            className="p-1.5 text-slate-300 hover:text-strong bg-slate-800/60 hover:bg-slate-800 rounded border border-slate-700/60 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            title="Exportar como .ZIP con README y metadatos"
          >
            <Archive className="w-3.5 h-3.5 text-amber-400" />
          </button>

          <button
            onClick={handleClear}
            disabled={!html}
            className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800/40 hover:bg-rose-950/40 rounded border border-slate-700/40 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Limpiar editor"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Minification Alert banner */}
      {minifiedNotice && (
        <div className="bg-sky-950/60 border-b border-sky-800/50 px-4 py-1.5 text-xs text-sky-300 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> HTML optimizado: {minifiedNotice}
          </span>
          <button onClick={() => setMinifiedNotice(null)} className="text-sky-400 hover:text-sky-200">
            ×
          </button>
        </div>
      )}

      {/* Dropzone & Drag Handler */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative flex-1 flex flex-col transition-colors ${
          isDragging ? 'bg-emerald-950/20 ring-2 ring-emerald-500/50' : 'bg-app'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".html,.htm"
          className="hidden"
        />

        {/* If completely empty, show friendly upload prompt */}
        {!html && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 pointer-events-none">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 mb-3 shadow-inner">
              <Upload className="w-7 h-7 text-emerald-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1">Arrastra tu archivo HTML aquí</h3>
            <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">
              O haz clic para explorar tu ordenador, pega código directamente o utiliza una plantilla prediseñada.
            </p>
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
              >
                Seleccionar archivo .html
              </button>
              <button
                type="button"
                onClick={onOpenTemplates}
                className="px-3.5 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/80 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Explorar Plantillas
              </button>
            </div>
          </div>
        )}

        {/* Textarea Editor */}
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          placeholder="<!DOCTYPE html>..."
          spellCheck={false}
          className={`w-full flex-1 p-4 bg-transparent text-slate-200 font-mono text-[13px] leading-relaxed resize-none outline-none selection:bg-emerald-500/30 selection:text-emerald-200 ${
            !html ? 'opacity-0' : 'opacity-100'
          }`}
        />
      </div>

      {/* HTML Validation Summary Bar */}
      {html && (
        <div className="px-3.5 py-1.5 bg-slate-900/80 border-t border-slate-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            {validation.isValid && validation.warnings.length === 0 ? (
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> HTML Válido
              </span>
            ) : validation.errors.length > 0 ? (
              <span className="flex items-center gap-1.5 text-rose-400 font-medium">
                <XCircle className="w-3.5 h-3.5" /> {validation.errors.length} error(es) sintácticos
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" /> {validation.warnings.length} advertencia(s)
              </span>
            )}

            <button
              onClick={() => setShowValidationDetails(!showValidationDetails)}
              className="text-[11px] text-slate-400 hover:text-slate-200 underline font-mono"
            >
              {showValidationDetails ? 'Ocultar análisis' : 'Ver análisis'}
            </button>
          </div>

          <div className="flex items-center gap-3 text-slate-500 text-[11px] font-mono">
            <span>{lineCount} líneas</span>
            <span>·</span>
            <span className={isOverSize ? 'text-rose-400 font-bold' : ''}>
              {formatBytes(sizeBytes)} / {currentUser.role === 'anon' ? '1 MB' : '10 MB'}
            </span>
          </div>
        </div>
      )}

      {/* Validation Analysis Drawer */}
      {showValidationDetails && html && (
        <div className="bg-app-card border-t border-slate-800 p-3.5 text-xs max-h-48 overflow-y-auto space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pb-2 border-b border-slate-800 font-mono text-[11px] text-slate-400">
            <div>Scripts: <span className="text-slate-200">{validation.tagStats.scripts}</span></div>
            <div>Estilos: <span className="text-slate-200">{validation.tagStats.styles}</span></div>
            <div>Imágenes: <span className="text-slate-200">{validation.tagStats.images}</span></div>
            <div>Elementos: <span className="text-slate-200">{validation.tagStats.totalElements}</span></div>
          </div>
          {validation.errors.map((err, idx) => (
            <div key={idx} className="flex items-start gap-2 text-rose-400">
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          ))}
          {validation.warnings.map((warn, idx) => (
            <div key={idx} className="flex items-start gap-2 text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{warn}</span>
            </div>
          ))}
          {validation.errors.length === 0 && validation.warnings.length === 0 && (
            <div className="text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>El documento incluye doctype, viewport y estructura estándar recomendada.</span>
            </div>
          )}
        </div>
      )}

      {/* Banner de modo edición */}
      {editingSlug && (
        <div className="px-3.5 py-2.5 bg-amber-500/10 border-t border-amber-500/25 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
          <span>
            Editando <code className="font-mono text-amber-100">/p/{editingSlug}</code>. Al guardar se mantiene la misma URL, la caducidad y la contraseña.
          </span>
          <button
            onClick={onCancelEdit}
            className="px-2 py-1 rounded border border-amber-500/40 text-amber-100 hover:bg-amber-500/15 transition-colors cursor-pointer"
          >
            Dejar de editar (publicar como nueva)
          </button>
        </div>
      )}

      {/* Configuration & Options Accordion */}
      <div className="p-3.5 bg-slate-900/60 border-t border-slate-800">
        {!editingSlug && (
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="text-xs font-semibold text-slate-300 hover:text-strong flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Configuración de URL y Seguridad</span>
            <span className="text-[10px] text-slate-500 font-normal">
              {showOptions ? '(Hacer clic para ocultar)' : '(Slug, contraseña, colecciones...)'}
            </span>
          </button>
        </div>
        )}

        {showOptions && !editingSlug && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 pb-3 border-t border-slate-800/80">
            {/* Custom Slug */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Slug Personalizado (Opcional)
              </label>
              <div className="flex items-center bg-slate-950 border border-slate-800 focus-within:border-emerald-500 rounded-lg px-2.5 py-1 text-xs text-slate-300">
                <span className="text-slate-500 font-mono text-[11px]">/p/</span>
                <input
                  type="text"
                  value={customSlug}
                  onChange={(e) => setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                  placeholder="mi-proyecto-web"
                  className="bg-transparent border-0 outline-none w-full text-strong font-mono text-xs ml-1"
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Si lo dejas vacío se genera un código aleatorio de 6 dígitos.
              </span>
            </div>

            {/* Password Protection */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-400" /> Protección con Contraseña
                </span>
                {currentUser.role === 'anon' && (
                  <span className="text-[10px] text-amber-400/80">Requiere cuenta gratuita</span>
                )}
              </label>
              <input
                type="password"
                value={password}
                disabled={currentUser.role === 'anon'}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  currentUser.role === 'anon'
                    ? 'Inicia sesión para proteger con clave'
                    : 'Introduce contraseña de acceso...'
                }
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-2.5 py-1 text-xs text-strong outline-none"
              />
            </div>

            {/* Ephemeral Mode Toggle */}
            <div className="sm:col-span-2 flex items-center justify-between bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                <div>
                  <div className="text-xs font-medium text-slate-200">Modo Efímero</div>
                  <div className="text-[10px] text-slate-400">
                    Se borra automáticamente al ser visualizada o tras 1 hora.
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isEphemeral}
                onChange={(e) => setIsEphemeral(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-emerald-500 cursor-pointer"
              />
            </div>

            {/* Collection Assign */}
            {currentUser.isRegistered && (
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                  <FolderPlus className="w-3 h-3 text-emerald-400" /> Añadir a Colección (Opcional)
                </label>
                <select
                  value={collectionId}
                  onChange={(e) => setCollectionId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300 outline-none"
                >
                  <option value="">Ninguna colección (página independiente)</option>
                  {collections.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.title} (/c/{col.slug})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Big Publish Button */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
          <button
            onClick={onPublish}
            disabled={!html.trim() || isPublishing || isOverSize}
            className="w-full sm:flex-1 py-3 px-5 rounded-xl font-semibold text-sm bg-emerald-400 hover:bg-emerald-300 active:scale-[0.99] text-slate-950 shadow-lg shadow-emerald-500/15 disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 group cursor-pointer"
          >
            <Send className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            <span>
              {isPublishing
                ? editingSlug ? 'Guardando cambios...' : 'Publicando página...'
                : editingSlug ? 'Guardar cambios' : 'Publicar Página Gratis'}
            </span>
          </button>

          <div className="text-[11px] text-slate-400 text-center sm:text-right shrink-0">
            {isEphemeral ? (
              <span className="text-purple-300 font-medium">Modo efímero (1 hora)</span>
            ) : currentUser.role === 'anon' ? (
              <span>
                Retención: <strong className="text-slate-200">15 días</strong> (Sin registro)
              </span>
            ) : (
              <span>
                Retención: <strong className="text-emerald-400">3 meses</strong> (Prorrogable)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
