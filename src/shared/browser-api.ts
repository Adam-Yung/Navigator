export function getAPI(): any {
  return (globalThis as any).browser || (globalThis as any).chrome;
}
