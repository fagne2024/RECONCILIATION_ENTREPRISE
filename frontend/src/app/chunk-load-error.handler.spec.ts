import { ChunkLoadErrorHandler, isChunkLoadError } from './chunk-load-error.handler';

describe('ChunkLoadErrorHandler', () => {
  it('reconnaît une ChunkLoadError enveloppée par Zone (promesse rejetée)', () => {
    const chunkError = Object.assign(new Error('Loading chunk default-src_app_x_ts failed.'), { name: 'ChunkLoadError' });
    expect(isChunkLoadError({ rejection: chunkError, message: 'Uncaught (in promise): ChunkLoadError' })).toBe(true);
    expect(isChunkLoadError(chunkError)).toBe(true);
  });

  it('ignore les autres erreurs', () => {
    expect(isChunkLoadError(new TypeError('x is undefined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it('ne recharge pas deux fois en moins d\'une minute (pas de boucle)', () => {
    sessionStorage.clear();
    const handler = new ChunkLoadErrorHandler();
    const allowed = (handler as any).reloadAllowed.bind(handler);
    expect(allowed()).toBe(true);
    expect(allowed()).toBe(false);
  });
});
