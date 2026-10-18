const FILES = [
  "airports", "carriers", "tankers", "ranges", "farps",
  "outbases", "groups", "comms", "waypoints"
];

export async function loadDatabase() {
  const entries = await Promise.all(FILES.map(async (name) => {
    const response = await fetch(`./${name}.json`, { cache: "no-store" });
    if (!response.ok) throw new Error(`No se pudo cargar ${name}.json (${response.status})`);
    return [name, await response.json()];
  }));
  return Object.fromEntries(entries);
}
