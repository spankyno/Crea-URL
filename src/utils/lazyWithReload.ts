import { lazy, type ComponentType } from 'react';

const RELOAD_FLAG = 'creaurl_chunk_reload';

/**
 * React.lazy con recuperación: si tras un despliegue la pestaña pide un archivo con un
 * nombre que ya no existe (404), recarga la página una sola vez para obtener la versión nueva.
 */
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await factory();
      try {
        sessionStorage.removeItem(RELOAD_FLAG);
      } catch (e) {}
      return mod;
    } catch (err) {
      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
        if (!alreadyReloaded) sessionStorage.setItem(RELOAD_FLAG, '1');
      } catch (e) {}
      if (!alreadyReloaded) {
        window.location.reload();
        // Evita renderizar nada mientras recarga
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
