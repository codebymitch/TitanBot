/**
 * Version Configuration
 * Gerencia a versão da aplicação
 */

const APP_VERSION = '0.15';

export default {
  version: APP_VERSION,
  getVersionString: () => `v${APP_VERSION}`,
  getFooter: () => `Howl MM ${APP_VERSION} • Sistema de Intermediação`,
  incrementVersion: () => {
    const [major, minor] = APP_VERSION.split('.').map(Number);
    
    if (minor === 99) {
      return `${major + 1}.00`;
    }
    
    return `${major}.${String(minor + 1).padStart(2, '0')}`;
  }
};
