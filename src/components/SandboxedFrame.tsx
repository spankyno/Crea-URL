import React, { useEffect, useRef } from 'react';

interface SandboxedFrameProps {
  html: string;
  title: string;
  className?: string;
  /** Cambiar este valor fuerza a recargar el marco (botón «recargar») */
  reloadToken?: number;
}

/**
 * Muestra HTML de usuarios en un iframe AISLADO.
 *
 * No usa `srcDoc`: un iframe con srcDoc hereda la política CSP de la aplicación y comparte su URL base.
 * Aquí se carga /preview-frame (que el Worker sirve con CSP "sandbox", sin allow-same-origin) y se le
 * envía el HTML por postMessage. Cada cambio de contenido crea un iframe nuevo, igual que hacía srcDoc.
 */
export const SandboxedFrame: React.FC<SandboxedFrameProps> = ({ html, title, className, reloadToken = 0 }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const previousHtml = useRef(html);
  const version = useRef(0);
  if (previousHtml.current !== html) {
    previousHtml.current = html;
    version.current += 1;
  }

  useEffect(() => {
    let sent = false;
    const onMessage = (e: MessageEvent) => {
      const win = frameRef.current?.contentWindow;
      // Solo se acepta el aviso de ESTE iframe, y una sola vez (el contenido del usuario no puede forzar reenvíos)
      if (sent || !win || e.source !== win) return;
      if (e.data && e.data.type === 'creaurl-ready') {
        sent = true;
        win.postMessage({ type: 'creaurl-render', html }, '*');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [html, reloadToken]);

  return (
    <iframe
      key={`${reloadToken}-${version.current}`}
      ref={frameRef}
      src="/preview-frame"
      title={title}
      sandbox="allow-scripts allow-forms allow-modals allow-popups"
      className={className}
    />
  );
};
