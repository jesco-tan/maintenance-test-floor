import { validateReplay, type Replay } from './schema';
export async function loadReplay(file: string, signal?: AbortSignal): Promise<Replay> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${file}.json`, { signal });
  if (!response.ok) throw new Error(`Replay data could not be loaded (${response.status}). Reload to retry.`);
  return validateReplay(await response.json());
}
