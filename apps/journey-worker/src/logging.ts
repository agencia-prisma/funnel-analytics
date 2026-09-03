export type JourneyWorkerLogEvent =
  | 'journey_worker.batch.received'
  | 'journey_worker.recompute.completed'
  | 'journey_worker.retry'
  | 'journey_worker.integrity_violation'
  | 'journey_worker.dlq';

export function logJourneyWorker(
  event: JourneyWorkerLogEvent,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  console.log(
    JSON.stringify({
      event,
      ...Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      ),
    }),
  );
}
