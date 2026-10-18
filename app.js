import { loadDatabase } from "./loader.js";

const state = { db: null, formationSize: 4 };
const $ = (id) => document.getElementById(id);

init();

async function init() {
  try {
    state.db = await loadDatabase();
    $("dataStatus").textContent = "Datos cargados";
    $("dataStatus").classList.add("ok");
    fillWaypointCount();
    bindEvents();
    renderOrigins();
    renderWaypointRows();
    updateWeather();
    updateSummary();
  } catch (error) {
    console.error(error);
    $("dataStatus").textContent = "Error de datos";
    $("dataStatus").classList.add("error");
    document.querySelector("main").insertAdjacentHTML("afterbegin", `<div class="fatal"><strong>No se pudo iniciar:</strong> ${escapeHtml(error.message)}</div>`);
  }
}

function bindEvents() {
  $("originType").addEventListener("change", renderOrigins);
  $("originSelect").addEventListener("change", () => { renderOriginDetails(); renderGroups(); updateSummary(); });
  $("groupSelect").addEventListener("change", () => { renderGroupDetails(); updateSummary(); });
  document.querySelectorAll(".formation-button").forEach((button) => button.addEventListener("click", () => {
    state.formationSize = Number(button.dataset.size);
    document.querySelectorAll(".formation-button").forEach((item) => item.classList.toggle("active", item === button));
    renderGroups();
  }));
  $("waypointCount").addEventListener("change", () => { renderWaypointRows(); updateSummary(); });
  ["windFrom", "windSpeed", "cloud1Type", "cloud1Alt", "cloud2Type", "cloud2Alt", "cloud3Type", "cloud3Alt", "qnhInHg"].forEach((id) => $(id).addEventListener("input", () => { updateWeather(); updateSummary(); }));
  $("updateSummary").addEventListener("click", updateSummary);
}

function originSources() {
  return {
    airport: state.db.airports,
    carrier: state.db.carriers,
    farp: state.db.farps,
    outbase: state.db.outbases
  };
}

function unitId(unit, type) {
  if (type === "airport") return String(unit.id ?? unit.icao ?? unit.name);
  return String(unit.id ?? unit.icao ?? unit.name);
}

function unitName(unit) {
  return unit.name ?? unit.callsign ?? unit.icao ?? unit.id ?? "Sin nombre";
}

function matchingGroups(homeUnit) {
  return state.db.groups.filter((group) => String(group.homeUnit) === String(homeUnit));
}

function renderOrigins() {
  const type = $("originType").value;
  const source = originSources()[type] ?? [];
  const available = source.filter((unit) => matchingGroups(unitId(unit, type)).length > 0);
  $("originSelect").innerHTML = available.length
    ? available.map((unit) => `<option value="${escapeAttr(unitId(unit, type))}">${escapeHtml(unitName(unit))}</option>`).join("")
    : `<option value="">No hay ${type} con grupos definidos</option>`;
  renderOriginDetails();
  renderGroups();
}

function selectedOrigin() {
  const type = $("originType").value;
  return (originSources()[type] ?? []).find((unit) => unitId(unit, type) === $("originSelect").value);
}

function renderOriginDetails() {
  const origin = selectedOrigin();
  if (!origin) return setDetails("originDetails", "No hay un origen disponible.");
  const tacan = formatTacan(origin.tacan);
  const tower = Array.isArray(origin.tower) ? origin.tower.join(" / ") : (origin.radio ?? origin.frequency ?? "-");
  setDetails("originDetails", `<strong>${escapeHtml(unitName(origin))}</strong><span>ID: ${escapeHtml(unitId(origin, $("originType").value))}</span><span>Radio/Torre: ${escapeHtml(String(tower))}</span><span>TACAN: ${escapeHtml(tacan)}</span>`);
}

function groupSize(group) {
  if (Number(group.size)) return Number(group.size);
  return Array.isArray(group.slots) ? group.slots.length : 0;
}

function renderGroups() {
  const homeUnit = $("originSelect").value;
  const groups = matchingGroups(homeUnit).filter((group) => groupSize(group) === state.formationSize);
  $("groupSelect").innerHTML = groups.length
    ? groups.map((group) => `<option value="${escapeAttr(group.id)}">${escapeHtml(group.callsign ?? group.id)}</option>`).join("")
    : `<option value="">No hay ${state.formationSize === 4 ? "grupos" : "binomios"} disponibles</option>`;
  renderGroupDetails();
  updateSummary();
}

function selectedGroup() {
  return state.db.groups.find((group) => String(group.id) === $("groupSelect").value);
}

function renderGroupDetails() {
  const group = selectedGroup();
  if (!group) return setDetails("groupDetails", "No hay una formación disponible para esta combinación.");
  const slots = (group.slots ?? []).map((slot) => `${slot.position}: ${slot.bort ?? slot.modex ?? "-"}`).join(" · ");
  setDetails("groupDetails", `<strong>${escapeHtml(group.callsign)}</strong><span>Frecuencia interna: ${escapeHtml(normalizeFrequency(group.frequency))} MHz</span><span>Formación: ${groupSize(group)} aviones</span><span>${escapeHtml(slots)}</span>`);
}

function fillWaypointCount() {
  $("waypointCount").innerHTML = Array.from({ length: 20 }, (_, index) => `<option value="${index + 1}" ${index === 4 ? "selected" : ""}>${index + 1}</option>`).join("");
}

function waypointCatalog() {
  const items = [];
  const add = (category, array, idFn, nameFn) => (array ?? []).forEach((item) => items.push({ category, id: idFn(item), name: nameFn(item), raw: item }));
  add("DTC", state.db.waypoints, (x) => `dtc:${x.wp ?? x.name}`, (x) => `${x.name ?? `WP${x.wp}`} · ${x.description ?? "Waypoint DTC"}`);
  add("Aeropuerto", state.db.airports, (x) => `airport:${x.icao ?? x.id}`, (x) => `${x.name} (${x.icao ?? x.id ?? ""})`);
  add("Portaaviones", state.db.carriers, (x) => `carrier:${x.id ?? x.name}`, (x) => x.name);
  add("FARP", state.db.farps, (x) => `farp:${x.id ?? x.name}`, (x) => x.name);
  add("Outbase", state.db.outbases, (x) => `outbase:${x.id ?? x.name}`, (x) => x.name);
  add("Polígono", state.db.ranges, (x) => `range:${x.id ?? x.name}`, (x) => `${x.id ?? ""} · ${x.name ?? ""}`);
  add("Tanker", state.db.tankers, (x) => `tanker:${x.id ?? x.callsign}`, (x) => x.callsign ?? x.name);
  return items;
}

function renderWaypointRows() {
  const count = Number($("waypointCount").value || 1);
  const container = $("waypointRows");
  const template = $("waypointTemplate");
  const catalog = waypointCatalog();
  container.innerHTML = "";
  for (let index = 0; index < count; index += 1) {
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector(".waypoint-row");
    row.dataset.index = String(index + 1);
    fragment.querySelector(".waypoint-number").textContent = `WP${index + 1}`;
    const preset = fragment.querySelector(".wp-preset");
    preset.innerHTML = `<option value="">Selecciona un punto</option>` + catalog.map((item) => `<option value="${escapeAttr(item.id)}">[${escapeHtml(item.category)}] ${escapeHtml(item.name)}</option>`).join("");
    fragment.querySelector(".wp-mode").addEventListener("change", (event) => {
      const manual = event.target.value === "manual";
      row.querySelector(".wp-database-fields").classList.toggle("hidden", manual);
      row.querySelector(".wp-manual-fields").classList.toggle("hidden", !manual);
      updateSummary();
    });
    preset.addEventListener("change", () => { renderWaypointInfo(row, catalog); updateSummary(); });
    fragment.querySelectorAll("input").forEach((input) => input.addEventListener("input", updateSummary));
    container.appendChild(fragment);
  }
}

function renderWaypointInfo(row, catalog) {
  const item = catalog.find((entry) => entry.id === row.querySelector(".wp-preset").value);
  const target = row.querySelector(".wp-info");
  if (!item) { target.textContent = ""; return; }
  const coords = extractCoordinates(item.raw);
  const altitude = item.raw.elevation_ft ?? item.raw.altitude_ft ?? item.raw.altitude ?? "-";
  target.textContent = `${coords || "Sin coordenadas registradas"} · Alt: ${altitude}${altitude === "-" ? "" : " ft"}`;
}

function readWaypoints() {
  const catalog = waypointCatalog();
  return [...document.querySelectorAll(".waypoint-row")].map((row, index) => {
    const mode = row.querySelector(".wp-mode").value;
    if (mode === "manual") {
      return { number: index + 1, mode, name: row.querySelector(".wp-name").value.trim() || "MANUAL", lat: row.querySelector(".wp-lat").value.trim(), lon: row.querySelector(".wp-lon").value.trim(), altitude: row.querySelector(".wp-alt").value.trim() };
    }
    const item = catalog.find((entry) => entry.id === row.querySelector(".wp-preset").value);
    return { number: index + 1, mode, name: item?.raw?.name ?? item?.raw?.callsign ?? item?.name ?? "-", coordinates: item ? extractCoordinates(item.raw) : "", altitude: item?.raw?.elevation_ft ?? item?.raw?.altitude_ft ?? item?.raw?.altitude ?? "" };
  });
}

function updateWeather() {
  const from = clamp(Number($("windFrom").value || 0), 0, 359);
  const to = (from + 180) % 360;
  $("windTo").textContent = `${String(to).padStart(3, "0")}°`;
  const speed = clamp(Number($("windSpeed").value || 0), 0, 99);
  const clouds = [1, 2, 3].map((number) => {
    const type = $(`cloud${number}Type`).value;
    const altitude = Number($(`cloud${number}Alt`).value || 0);
    return type ? `${type}${String(Math.round(altitude / 100)).padStart(3, "0")}` : "";
  }).filter(Boolean);
  const hpa = Number($("qnhInHg").value || 29.92) * 33.8638866667;
  $("weatherString").textContent = `${String(from).padStart(3, "0")}º ${String(speed).padStart(2, "0")}KT ${clouds.join(" ")} Q${hpa.toFixed(2).replace(".", ",")}`;
}

function updateSummary() {
  if (!state.db) return;
  const origin = selectedOrigin();
  const group = selectedGroup();
  const waypoints = readWaypoints();
  const wpText = waypoints.map((wp) => {
    const position = wp.mode === "manual" ? [wp.lat, wp.lon].filter(Boolean).join(" ") : wp.coordinates;
    const altitude = wp.altitude ? ` · ${wp.altitude} ft` : "";
    return `WP${String(wp.number).padStart(2, "0")}  ${wp.name}${position ? ` · ${position}` : ""}${altitude}`;
  }).join("\n");
  $("missionSummary").textContent = `ORIGEN\n${origin ? unitName(origin) : "-"}\n\nFORMACIÓN\n${group?.callsign ?? "-"} · ${group ? `${groupSize(group)} aviones` : "-"}\nRADIO INTERNA: ${group ? `${normalizeFrequency(group.frequency)} MHz` : "-"}\n\nWAYPOINTS\n${wpText || "-"}\n\nMETEO\n${$("weatherString").textContent || "-"}`;
}

function extractCoordinates(item) {
  const coords = item.coordinates ?? item.position;
  if (!coords) return "";
  if (typeof coords === "string") return coords;
  return [coords.lat ?? coords.latitude, coords.lon ?? coords.lng ?? coords.longitude].filter(Boolean).join(" ");
}

function formatTacan(tacan) {
  if (!tacan) return "-";
  if (typeof tacan === "string") return tacan;
  return [tacan.channel, tacan.ident].filter(Boolean).join(" ") || "-";
}
function normalizeFrequency(value) { return String(value ?? "-").replace(/\s*MHz/gi, "").trim(); }
function setDetails(id, html) { const node = $(id); node.classList.remove("empty"); node.innerHTML = html; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function escapeAttr(value) { return escapeHtml(value); }
