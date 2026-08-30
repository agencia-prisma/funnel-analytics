import type { EventBatchV1 } from '@funnel/event-contracts';

import {
  captureTouch,
  resolveAttribution,
  type TouchContext,
} from './attribution';
import type { PixelConfig } from './config';
import { SDK_VERSION } from './config';
import { ConsentManager, type ConsentSettings } from './consent';
import { collectPageContext } from './context';
import {
  createCustomEvent,
  createPageViewEvent,
  type EventIdentity,
} from './events';
import { createUuidV7, getOrCreateVisitorId } from './ids';
import { EventQueue } from './queue';
import { BrowserStorageAdapter, clearTrackingStorage } from './storage';
import { getOrCreateSession, touchSession, type SessionState } from './session';
import { installSpaTracking, type SpaCleanup } from './spa';
import { HttpTransport, TestTransport, type Transport } from './transport';

export interface FunnelAnalyticsApi {
  readonly sdkVersion: string;
  track(name: string, properties?: unknown): boolean;
  identify(): EventIdentity | null;
  consent(settings: ConsentSettings): string;
  getVisitorId(): string | null;
  getSessionId(): string | null;
  flush(): Promise<boolean>;
}

export interface PixelGlobalWindow extends Window {
  funnelAnalytics?: FunnelAnalyticsApi;
  __funnelAnalyticsBootstrapped?: boolean;
  __funnelAnalyticsTestBatches?: EventBatchV1[];
}

export class PixelRuntime {
  private readonly storage: BrowserStorageAdapter;
  private readonly consentManager: ConsentManager;
  private readonly queue: EventQueue;

  private visitorId: string | null = null;
  private session: SessionState | null = null;
  private firstTouch: TouchContext | null = null;
  private sessionTouch: TouchContext | null = null;
  private spaCleanup: SpaCleanup | null = null;
  private flushTimer: number | null = null;
  private initialized = false;

  readonly api: FunnelAnalyticsApi;

  constructor(
    private readonly config: PixelConfig,
    private readonly windowRef: PixelGlobalWindow,
    private readonly documentRef: Document,
  ) {
    this.storage = new BrowserStorageAdapter(
      windowRef,
      documentRef,
      config.visitorMaxAgeDays,
    );
    this.consentManager = new ConsentManager(
      this.storage,
      config.requireConsent,
    );

    const transport = this.createTransport();

    this.queue = new EventQueue(transport, {
      maxBatchEvents: config.maxBatchEvents,
      maxQueueEvents: config.maxQueueEvents,
      maxPayloadBytes: config.maxPayloadBytes,
      maxRetries: config.maxRetries,
      storage: this.storage,
      persistenceAllowed: () => this.consentManager.canPersistIdentity(),
      debug: (event, metadata) => this.debug(event, metadata),
    });

    this.api = {
      sdkVersion: SDK_VERSION,
      track: (name, properties) =>
        this.safe(() => this.track(name, properties), false),
      identify: () => this.safe(() => this.identify(), null),
      consent: (settings) =>
        this.safe(
          () => this.setConsent(settings),
          this.consentManager.getState(),
        ),
      getVisitorId: () => this.visitorId,
      getSessionId: () => this.session?.session_id ?? null,
      flush: () => this.safeAsync(() => this.queue.flush(), false),
    };
  }

  initialize(): FunnelAnalyticsApi {
    if (this.initialized) {
      return this.api;
    }

    this.initialized = true;
    this.windowRef.funnelAnalytics = this.api;
    this.installLifecycle();

    if (this.consentManager.canTrack()) {
      this.queuePageView();
    }

    this.debug('pixel.initialized', {
      consent_state: this.consentManager.getState(),
      test_mode: this.config.testMode,
      transport: this.config.testMode
        ? 'test'
        : this.config.endpoint
          ? 'http'
          : 'deferred',
    });

    return this.api;
  }

  destroy(): void {
    this.spaCleanup?.();
    this.spaCleanup = null;

    if (this.flushTimer !== null) {
      this.windowRef.clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private createTransport(): Transport | null {
    if (this.config.testMode) {
      return new TestTransport((batch) => {
        const batches = this.windowRef.__funnelAnalyticsTestBatches ?? [];
        batches.push(batch);
        this.windowRef.__funnelAnalyticsTestBatches = batches;
      });
    }

    if (this.config.endpoint) {
      return new HttpTransport(
        this.config.endpoint,
        this.windowRef.fetch.bind(this.windowRef),
        this.windowRef.navigator,
      );
    }

    return null;
  }

  private installLifecycle(): void {
    this.spaCleanup = installSpaTracking(this.windowRef, () => {
      this.safe(() => {
        if (this.consentManager.canTrack()) {
          this.queuePageView();
        }
      });
    });

    this.documentRef.addEventListener('visibilitychange', () => {
      if (this.documentRef.visibilityState === 'hidden') {
        void this.queue.flush(true);
      }
    });

    this.windowRef.addEventListener('pagehide', () => {
      void this.queue.flush(true);
    });

    this.flushTimer = this.windowRef.setInterval(() => {
      void this.queue.flush();
    }, this.config.flushIntervalMs);
  }

  private identify(): EventIdentity | null {
    if (!this.consentManager.canTrack()) {
      return null;
    }

    return this.refreshIdentity();
  }

  private setConsent(settings: ConsentSettings): string {
    const couldTrack = this.consentManager.canTrack();
    const couldPersist = this.consentManager.canPersistIdentity();
    const state = this.consentManager.update(settings);
    const canTrack = this.consentManager.canTrack();
    const canPersist = this.consentManager.canPersistIdentity();

    if (!canTrack) {
      this.queue.clear();
      clearTrackingStorage(this.storage);
      this.resetIdentity();
      this.debug('pixel.consent.denied');
      return state;
    }

    if (couldPersist && !canPersist) {
      this.queue.clear();
      clearTrackingStorage(this.storage);
      this.resetIdentity();
    }

    if (!couldTrack && canTrack) {
      this.queuePageView();
    }

    this.debug('pixel.consent.updated', { consent_state: state });
    return state;
  }

  private resetIdentity(): void {
    this.visitorId = null;
    this.session = null;
    this.firstTouch = null;
    this.sessionTouch = null;
  }

  private refreshIdentity(): EventIdentity {
    const now = Date.now();
    const persistent = this.consentManager.canPersistIdentity();
    const storage = persistent ? this.storage : null;

    if (persistent) {
      this.visitorId = getOrCreateVisitorId(this.storage, now);

      const sessionResult = getOrCreateSession(
        storage,
        now,
        this.config.sessionTimeoutMs,
      );
      this.session = sessionResult.state;

      const currentTouch = captureTouch(
        this.windowRef.location.href,
        this.documentRef.referrer || null,
        this.windowRef.location.hostname,
        new Date(now).toISOString(),
      );
      const attribution = resolveAttribution(
        storage,
        this.session.session_id,
        sessionResult.isNew,
        currentTouch,
      );

      this.firstTouch = attribution.firstTouch;
      this.sessionTouch = attribution.sessionTouch;
    } else {
      this.visitorId ??= createUuidV7(now);

      let isNewSession = false;

      if (
        !this.session ||
        now - this.session.last_activity_at > this.config.sessionTimeoutMs
      ) {
        const result = getOrCreateSession(
          null,
          now,
          this.config.sessionTimeoutMs,
        );
        this.session = result.state;
        isNewSession = true;
      } else {
        this.session = touchSession(null, this.session, now);
      }

      const currentTouch = captureTouch(
        this.windowRef.location.href,
        this.documentRef.referrer || null,
        this.windowRef.location.hostname,
        new Date(now).toISOString(),
      );

      this.firstTouch ??= currentTouch;

      if (!this.sessionTouch || isNewSession) {
        this.sessionTouch = currentTouch;
      }
    }

    return {
      visitorId: this.visitorId,
      sessionId: this.session.session_id,
    };
  }

  private eventContext() {
    const identity = this.refreshIdentity();
    const page = collectPageContext(this.windowRef, this.documentRef);

    return {
      pixelKey: this.config.pixelKey,
      sdkVersion: SDK_VERSION,
      testMode: this.config.testMode,
      consentState: this.consentManager.getState(),
      identity,
      page,
      attribution:
        this.sessionTouch ??
        captureTouch(
          this.windowRef.location.href,
          this.documentRef.referrer || null,
          this.windowRef.location.hostname,
        ),
      navigatorRef: this.windowRef.navigator,
    };
  }

  private queuePageView(): void {
    if (!this.consentManager.canTrack()) {
      return;
    }

    const event = createPageViewEvent(this.eventContext());
    this.queue.enqueue(event);
    this.debug('pixel.page_view.queued', { queue_size: this.queue.size() });
  }

  private track(name: string, properties?: unknown): boolean {
    if (!this.consentManager.canTrack()) {
      return false;
    }

    const event = createCustomEvent(name, properties, this.eventContext());

    if (!event) {
      this.debug('pixel.custom_event.rejected', { reason: 'invalid_name' });
      return false;
    }

    this.queue.enqueue(event);
    return true;
  }

  private debug(event: string, metadata?: Record<string, unknown>): void {
    if (!this.config.debug) {
      return;
    }

    globalThis.console?.debug('[FunnelAnalytics]', event, metadata ?? {});
  }

  private safe<T>(operation: () => T, fallback?: T): T {
    try {
      return operation();
    } catch {
      this.debug('pixel.internal_error');
      return fallback as T;
    }
  }

  private async safeAsync<T>(
    operation: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await operation();
    } catch {
      this.debug('pixel.internal_error');
      return fallback;
    }
  }
}

export function bootstrapPixel(
  config: PixelConfig,
  windowRef = window as PixelGlobalWindow,
  documentRef = document,
): FunnelAnalyticsApi {
  const runtime = new PixelRuntime(config, windowRef, documentRef);
  return runtime.initialize();
}
