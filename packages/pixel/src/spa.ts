export type SpaCleanup = () => void;

function trackingHref(windowRef: Window): string {
  return `${windowRef.location.origin}${windowRef.location.pathname}${windowRef.location.search}`;
}

export function installSpaTracking(
  windowRef: Window,
  onNavigate: () => void,
): SpaCleanup {
  const history = windowRef.history;
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  let lastHref = trackingHref(windowRef);

  const emitIfChanged = () => {
    const nextHref = trackingHref(windowRef);

    if (nextHref === lastHref) {
      return;
    }

    lastHref = nextHref;
    onNavigate();
  };

  history.pushState = function pushState(...args) {
    originalPushState(...args);
    queueMicrotask(emitIfChanged);
  };

  history.replaceState = function replaceState(...args) {
    originalReplaceState(...args);
    queueMicrotask(emitIfChanged);
  };

  const onPopState = () => emitIfChanged();
  windowRef.addEventListener('popstate', onPopState);

  return () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    windowRef.removeEventListener('popstate', onPopState);
  };
}
