import { bootstrapPixel, type PixelGlobalWindow } from './bootstrap';
import { readPixelConfig } from './config';

(function autoBootstrap() {
  const windowRef = window as PixelGlobalWindow;

  if (windowRef.__funnelAnalyticsBootstrapped) {
    return;
  }

  try {
    const config = readPixelConfig();

    if (!config) {
      return;
    }

    windowRef.__funnelAnalyticsBootstrapped = true;
    bootstrapPixel(config, windowRef, document);
  } catch {
    windowRef.__funnelAnalyticsBootstrapped = false;
  }
})();
