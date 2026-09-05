export function logCommerceWorker(
  event: string,
  fields: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({ event, ...fields }));
}
