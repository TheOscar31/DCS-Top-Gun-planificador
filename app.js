import { loadDatabase } from "./loader.js?v=2.0";

const state = { db: null, formationSize: 4 };
const $ = (id) => document.getElementById(id);
init();

async function init() {
  try {
    state.db = await loadDatabase();
    $("dataStatus").textContent = "Datos cargados";
    $("dataStatus").classList.add("ok");
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
  $("originSelect").addEventListener("change", () => { renderOriginDetails(); renderGroups(); });
  $("groupSelect").addEventListener("change", () => { renderGroupDetails(); renderPilotAssignments(); updateSummary(); });
  document.querySelectorAll(".formation-button").forEach((button) => button.addEventListener("click", () => {
    state.formationSize = Number(button.dataset.size);
    document.querySelectorAll(".formation-button").forEach((item) => item.classList.toggle("active", item === button));
    renderGroups();
  }));
  $("waypointCount").addEventListener("input", () => {
    const valid = Math.max(1, Math.min(20, Number($("waypointCount").value || 1)));
    $("waypointCount").value = valid;
    renderWaypointRows();
  });
  ["windFrom", "windSpeed", "cloud1Type", "cloud1Alt", "cloud2Type", "cloud2Alt", "cloud3Type", "cloud3Alt", "qnhInHg"].forEach((id) => $(id).addEventListener("input", () => { updateWeather(); updateSummary(); }));
  $("updateSummary").addEventListener("click", updateSummary);
  $("exportXlsx").addEventListener("click", exportXlsx);
}

function sources() { return { airport: state.db.airports, carrier: state.db.carriers, farp: state.db.farps, outbase: state.db.outbases }; }
function aliases(unit, type) {
  const values = [unit.id, unit.icao, unit.name, unit.callsign].filter(Boolean).map(String);
  if (type === "carrier") {
    const name = String(unit.name ?? "");
    const cvn = name.match(/CVN-?\d+/i)?.[0];
    if (cvn) values.push(cvn.toUpperCase(), cvn.toUpperCase().replace("-", ""));
  }
  return [...new Set(values)];
}
function groupMatchesUnit(group, unit, type) {
  const home = normalizeKey(group.homeUnit);
  return aliases(unit, type).some((alias) => normalizeKey(alias) === home);
}
function normalizeKey(value) { return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function unitName(unit) { return unit.name ?? unit.callsign ?? unit.icao ?? unit.id ?? "Sin nombre"; }

function renderOrigins() {
  const type = $("originType").value;
  const available = (sources()[type] ?? []).filter((unit) => state.db.groups.some((group) => groupMatchesUnit(group, unit, type)));
  $("originSelect").innerHTML = available.length ? available.map((unit, i) => `<option value="${i}">${escapeHtml(unitName(unit))}</option>`).join("") : `<option value="">No hay ubicaciones con grupos definidos</option>`;
  renderOriginDetails();
  renderGroups();
}
function selectedOrigin() {
  const list = (sources()[$("originType").value] ?? []).filter((unit) => state.db.groups.some((group) => groupMatchesUnit(group, unit, $("originType").value)));
  return list[Number($("originSelect").value)];
}
function renderOriginDetails() {
  const origin = selectedOrigin();
  if (!origin) return showDetails("originDetails", ["No hay un origen disponible."]);
  const radio = Array.isArray(origin.tower) ? origin.tower.join(" / ") : origin.radio ?? origin.frequency ?? "-";
  showDetails("originDetails", [unitName(origin), `Radio / torre: ${radio}`, `TACAN: ${formatTacan(origin.tacan)}`]);
}
function groupSize(group) { return Number(group.size) || (Array.isArray(group.slots) ? group.slots.length : 0); }
function availableGroups() {
  const origin = selectedOrigin();
  if (!origin) return [];
  return state.db.groups.filter((group) => groupMatchesUnit(group, origin, $("originType").value) && groupSize(group) === state.formationSize);
}
function renderGroups() {
  const groups = availableGroups();
  $("groupSelect").innerHTML = groups.length ? groups.map((group) => `<option value="${escapeAttr(group.id)}">${escapeHtml(group.callsign ?? group.id)}</option>`).join("") : `<option value="">No hay ${state.formationSize === 4 ? "grupos" : "binomios"} disponibles</option>`;
  renderGroupDetails();
  renderPilotAssignments();
  updateSummary();
}
function selectedGroup() { return availableGroups().find((group) => String(group.id) === $("groupSelect").value); }
function renderGroupDetails() {
  const group = selectedGroup();
  if (!group) return showDetails("groupDetails", ["No hay una formación disponible."]);
  showDetails("groupDetails", [group.callsign, `Frecuencia interna: ${normalizeFrequency(group.frequency)} MHz`, `Formación: ${groupSize(group)} aviones`]);
}
function renderPilotAssignments() {
  const group = selectedGroup();
  const target = $("pilotAssignments");
  target.innerHTML = "";
  if (!group) return;
  (group.slots ?? []).forEach((slot) => {
    const numeral = slot.bort ?? slot.modex ?? "-";
    target.insertAdjacentHTML("beforeend", `<label class="pilot-card"><span>${escapeHtml(slot.position)} · Numeral ${escapeHtml(numeral)}</span><input class="pilot-name" data-position="${escapeAttr(slot.position)}" data-numeral="${escapeAttr(numeral)}" placeholder="Nombre del piloto"></label>`);
  });
  target.querySelectorAll("input").forEach((input) => input.addEventListener("input", updateSummary));
}

function waypointCatalog() {
  const items = [];
  const add = (category, array, idFn, nameFn) => (array ?? []).forEach((raw) => items.push({ category, id: idFn(raw), name: nameFn(raw), raw }));
  add("DTC", state.db.waypoints, (x) => `dtc:${x.wp ?? x.name}`, (x) => `${x.name ?? `WP${x.wp}`} · ${x.description ?? "Waypoint DTC"}`);
  add("Aeropuerto", state.db.airports, (x) => `airport:${x.icao ?? x.id ?? x.name}`, (x) => `${x.name} (${x.icao ?? ""})`);
  add("Portaaviones", state.db.carriers, (x) => `carrier:${x.id ?? x.name}`, (x) => x.name);
  add("FARP", state.db.farps, (x) => `farp:${x.id ?? x.name}`, (x) => x.name);
  add("Outbase", state.db.outbases, (x) => `outbase:${x.id ?? x.name}`, (x) => x.name);
  add("Polígono", state.db.ranges, (x) => `range:${x.id ?? x.name}`, (x) => `${x.id ?? ""} · ${x.name ?? ""}`);
  add("Tanker", state.db.tankers, (x) => `tanker:${x.id ?? x.callsign}`, (x) => x.callsign ?? x.name);
  return items;
}
function renderWaypointRows() {
  const count = Math.max(1, Math.min(20, Number($("waypointCount").value || 1)));
  const catalog = waypointCatalog();
  const container = $("waypointRows");
  container.innerHTML = "";
  for (let index = 1; index <= count; index += 1) {
    const fragment = $("waypointTemplate").content.cloneNode(true);
    const row = fragment.querySelector(".waypoint-row");
    fragment.querySelector(".waypoint-number").textContent = `WP${index}`;
    const preset = fragment.querySelector(".wp-preset");
    preset.innerHTML = `<option value="">Selecciona un punto</option>` + catalog.map((item) => `<option value="${escapeAttr(item.id)}">[${escapeHtml(item.category)}] ${escapeHtml(item.name)}</option>`).join("");
    fragment.querySelector(".wp-mode").addEventListener("change", (event) => {
      const manual = event.target.value === "manual";
      row.querySelector(".wp-database-fields").classList.toggle("hidden", manual);
      row.querySelector(".wp-manual-fields").classList.toggle("hidden", !manual);
      updateSummary();
    });
    preset.addEventListener("change", () => updateSummary());
    fragment.querySelectorAll("input").forEach((input) => input.addEventListener("input", updateSummary));
    container.appendChild(fragment);
  }
  updateSummary();
}
function readWaypoints() {
  const catalog = waypointCatalog();
  return [...document.querySelectorAll(".waypoint-row")].map((row, index) => {
    if (row.querySelector(".wp-mode").value === "manual") return { number: index + 1, name: row.querySelector(".wp-name").value.trim() || "MANUAL", excelName: row.querySelector(".wp-name").value.trim() || "MANUAL", coordinates: [row.querySelector(".wp-lat").value.trim(), row.querySelector(".wp-lon").value.trim()].filter(Boolean).join(" "), altitude: row.querySelector(".wp-alt").value.trim() };
    const item = catalog.find((entry) => entry.id === row.querySelector(".wp-preset").value);
    return { number: index + 1, name: item?.raw?.name ?? item?.raw?.callsign ?? "-", excelName: item ? waypointExcelName(item) : "-", coordinates: item ? extractCoordinates(item.raw) : "", altitude: item?.raw?.elevation_ft ?? item?.raw?.altitude_ft ?? item?.raw?.altitude ?? "" };
  });
}
function readPilots() { return [...document.querySelectorAll(".pilot-name")].filter((input) => input.value.trim()).map((input) => ({ pilot: input.value.trim(), position: input.dataset.position, numeral: input.dataset.numeral })); }

function updateWeather() {
  const from = clamp(Number($("windFrom").value || 0), 0, 359);
  $("windTo").textContent = `${String((from + 180) % 360).padStart(3, "0")}°`;
  const speed = clamp(Number($("windSpeed").value || 0), 0, 99);
  const clouds = [1, 2, 3].map((n) => { const type = $(`cloud${n}Type`).value; const altitude = Number($(`cloud${n}Alt`).value || 0); return type ? `${type}${String(Math.round(altitude / 100)).padStart(3, "0")}` : ""; }).filter(Boolean);
  const hpa = Number($("qnhInHg").value || 29.92) * 33.8638866667;
  $("weatherString").textContent = `${String(from).padStart(3, "0")}º  ${String(speed).padStart(2, "0")}KT  ${clouds.join("  ")}  Q${hpa.toFixed(2).replace(".", ",")}`;
}
function missionData() { return { origin: selectedOrigin(), group: selectedGroup(), pilots: readPilots(), waypoints: readWaypoints(), weather: $("weatherString").textContent }; }
function updateSummary() {
  if (!state.db) return;
  const data = missionData();
  const flights = data.pilots.length ? data.pilots.map((p) => `${data.group.callsign} ${p.position}  |  ${p.pilot}  |  Numeral ${p.numeral}`).join("\n") : "Sin pilotos asignados";
  const waypoints = data.waypoints.map((wp) => `WP${String(wp.number).padStart(2, "0")}  ${wp.name}${wp.coordinates ? `  |  ${wp.coordinates}` : ""}${wp.altitude ? `  |  ${wp.altitude} ft` : ""}`).join("\n");
  $("missionSummary").textContent = `ORIGEN\n${data.origin ? unitName(data.origin) : "-"}\n\nFORMACIÓN\n${data.group?.callsign ?? "-"}\nRADIO INTERNA: ${data.group ? `${normalizeFrequency(data.group.frequency)} MHz` : "-"}\n\nTRIPULACIONES\n${flights}\n\nWAYPOINTS\n${waypoints}\n\nMETEO\n${data.weather}`;
}

function exportRows() {
  const data = missionData();
  const rows = [["DCS OPERATIONS CENTER"], ["ORIGEN", data.origin ? unitName(data.origin) : "-"], ["GRUPO", data.group?.callsign ?? "-"], ["RADIO INTERNA", data.group ? `${normalizeFrequency(data.group.frequency)} MHz` : "-"], ["METEO", data.weather], [], ["TRIPULACIONES"], ["Indicativo", "Posición", "Piloto", "Numeral"]];
  data.pilots.forEach((p) => rows.push([data.group?.callsign ?? "-", p.position, p.pilot, p.numeral]));
  rows.push([], ["WAYPOINTS"], ["WP", "Nombre", "Coordenadas", "Altitud ft"]);
  data.waypoints.forEach((wp) => rows.push([wp.number, wp.name, wp.coordinates, wp.altitude]));
  return rows;
}
function exportCsv() {
  const csv = exportRows().map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
  downloadBlob(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), "plan_vuelo_dcs.csv");
}
async function exportXlsx() {
  try {
    if (!window.XlsxPopulate) throw new Error("No se ha cargado la biblioteca de Excel");
    const response = await fetch("./piernografo_base.xlsx?v=3.0", { cache: "no-store" });
    if (!response.ok) throw new Error(`No se pudo cargar la plantilla (${response.status})`);
    const data = missionData();
    const workbook = await XlsxPopulate.fromDataAsync(await response.arrayBuffer());
    const sheet = workbook.sheet("Plan de vuelo") || workbook.sheet(0);

    ["C3","C4","C6","H7"].forEach(c => sheet.cell(c).value(""));
    ["C7:C10","E7:E10","F7:F10","C14:C25","D14:D25","E14:E25"].forEach(r => sheet.range(r).value(""));

    if (data.origin) {
      sheet.cell("C3").value(data.origin.name || data.origin.callsign || data.origin.icao || data.origin.id || "");
      sheet.cell("C4").value(originExcelLine(data.origin));
    }
    if (data.group) {
      const callsign=data.group.callsign || data.group.id || "";
      const kind=groupSize(data.group)===2 ? "Binomio" : "Grupo";
      sheet.cell("C6").value(`${kind} ${callsign}  -  ${normalizeFrequency(data.group.frequency)} MHz`);
      data.pilots.slice(0,4).forEach((pilot,index) => {
        const row=7+index;
        sheet.cell(`C${row}`).value(`${callsign} ${pilot.position}`);
        sheet.cell(`E${row}`).value(pilot.pilot);
        sheet.cell(`F${row}`).value(pilot.numeral);
      });
      sheet.cell("H7").value(wingFor(callsign));
    }
    data.waypoints.slice(0,12).forEach((wp,index) => {
      const row=14+index;
      sheet.cell(`C${row}`).value(wp.number || index+1);
      sheet.cell(`D${row}`).value(wp.excelName || wp.name || "");
      sheet.cell(`E${row}`).value(excelAltitude(wp.altitude));
    });
    const blob=await workbook.outputAsync({type:"blob"});
    downloadBlob(blob,`piernografo_${fileKey(data.group?.callsign || "grupo")}.xlsx`);
    generatePiernografoJpg(data);
  } catch (error) {
    console.error(error);
    alert(`No se pudo generar el piernógrafo XLSX: ${error.message}`);
  }
}

function originExcelLine(origin) {
  if (Array.isArray(origin.runways) && origin.runways.length) {
    return origin.runways.map((runway) => {
      const name=String(runway.runway || runway.name || "").replace(/^RWY\s*/i,"").trim();
      const heading=runway.heading == null ? "-" : `${String(runway.heading).padStart(3,"0")}º`;
      const tacan=formatTacan(runway.tacan);
      return [`${name}:`,heading,tacan === "-" ? "" : tacan].filter(Boolean).join(" ");
    }).join("   /   ");
  }
  const parts=[];
  const radio=origin.radio || origin.frequency;
  if(radio) parts.push(`${normalizeFrequency(radio)} MHz`);
  const tacan=formatTacan(origin.tacan);
  if(tacan !== "-") parts.push(tacan);
  if(origin.icls != null) parts.push(`ICLS: CH ${String(origin.icls).replace(/^CH\s*/i,"").trim()}`);
  if(origin.link4) parts.push(`Link 4: ${normalizeFrequency(origin.link4)} MHz`);
  return parts.join(" / ");
}

function waypointExcelName(item) {
  const raw=item.raw || {};
  switch(item.category) {
    case "DTC": return raw.name || `WP${raw.wp ?? ""}`;
    case "Aeropuerto": return raw.icao || raw.id || raw.name || "";
    case "Portaaviones": return String(raw.name || raw.id || "").match(/CVN-?\d+/i)?.[0]?.toUpperCase() || raw.id || raw.name || "";
    case "FARP": return String(raw.name || raw.id || "").replace(/^FARP\s+/i,"").trim();
    case "Polígono": return raw.id || raw.name || "";
    case "Tanker": return tankerAbbreviation(raw.callsign || raw.name || raw.id || "");
    case "Outbase": return raw.tacan?.ident || raw.id || raw.name || "";
    default: return raw.name || raw.id || "";
  }
}

function tankerAbbreviation(value) {
  const text=String(value);
  const compact=text.replace(/\s+/g,"");
  const numbers=(text.match(/\d+/g) || []).join("");
  if(/^shell/i.test(compact)) return `SH${numbers}`;
  if(/^texaco/i.test(compact)) return `TXC${numbers}`;
  if(/^navyone/i.test(compact)) return `NVY${numbers}`;
  if(/^arco/i.test(compact)) return `ARC${numbers}`;
  return text;
}

async function generatePiernografoJpg(data) {

    try {

        /*
         * Carga la imagen obtenida al imprimir el Excel.
         */

        const background =
            await loadPiernografoBackground(
                "./piernografo_base.jpg"
            );


        /*
         * El canvas utiliza exactamente la misma resolución
         * de la imagen base.
         */

        const canvas =
            document.createElement("canvas");

        canvas.width =
            background.naturalWidth;

        canvas.height =
            background.naturalHeight;

        const ctx =
            canvas.getContext("2d");


        /*
         * Dibuja la hoja de Excel completa como fondo.
         */

        ctx.drawImage(
            background,
            0,
            0,
            canvas.width,
            canvas.height
        );


        /*
         * Configuración general del texto.
         */

        ctx.fillStyle = "#000000";

        ctx.textBaseline = "middle";

        ctx.textAlign = "center";


        /*
         * =====================================================
         * C3: NOMBRE DEL AEROPUERTO O PORTAAVIONES
         * =====================================================
         */

        drawTextInExcelCell(
            ctx,
            data.origin
                ? unitName(data.origin)
                : "",
            {
                x: 160,
                y: 108,
                width: 1270,
                height: 48,
                fontSize: 27,
                bold: true,
                align: "center"
            }
        );


        /*
         * =====================================================
         * C4: PISTAS O DATOS DEL PORTAAVIONES
         * =====================================================
         */

        drawTextInExcelCell(
            ctx,
            data.origin
                ? originExcelLine(data.origin)
                : "",
            {
                x: 160,
                y: 156,
                width: 1270,
                height: 58,
                fontSize: 19,
                bold: false,
                align: "center"
            }
        );


        /*
         * =====================================================
         * C6: GRUPO Y FRECUENCIA
         * =====================================================
         */

        const formationText =
            data.group
                ? `${
                    groupSize(data.group) === 2
                        ? "Binomio"
                        : "Grupo"
                  } ${
                    data.group.callsign
                  }  -  ${
                    normalizeFrequency(
                        data.group.frequency
                    )
                  } MHz`
                : "";

        drawTextInExcelCell(
            ctx,
            formationText,
            {
                x: 160,
                y: 336,
                width: 1270,
                height: 44,
                fontSize: 24,
                bold: true,
                align: "center"
            }
        );


        /*
         * =====================================================
         * C7:C10, E7:E10 Y F7:F10
         *
         * Solo aparecen pilotos asignados.
         * =====================================================
         */

        const pilotRows = [
            401,
            443,
            485,
            527
        ];

        data.pilots
            .slice(0, 4)
            .forEach((pilot, index) => {

                const centerY =
                    pilotRows[index];


                /*
                 * C:D - Indicativo y posición.
                 */

                drawTextInExcelCell(
                    ctx,
                    `${
                        data.group?.callsign ?? ""
                    } ${
                        pilot.position
                    }`,
                    {
                        x: 160,
                        y: centerY - 19,
                        width: 420,
                        height: 38,
                        fontSize: 19,
                        bold: true,
                        align: "center"
                    }
                );


                /*
                 * E - Piloto.
                 */

                drawTextInExcelCell(
                    ctx,
                    pilot.pilot,
                    {
                        x: 580,
                        y: centerY - 19,
                        width: 275,
                        height: 38,
                        fontSize: 19,
                        bold: false,
                        align: "center"
                    }
                );


                /*
                 * F:G - Numeral.
                 */

                drawTextInExcelCell(
                    ctx,
                    pilot.numeral,
                    {
                        x: 855,
                        y: centerY - 19,
                        width: 330,
                        height: 38,
                        fontSize: 19,
                        bold: false,
                        align: "center"
                    }
                );
            });


        /*
         * =====================================================
         * H7: ALA O ESCUADRÓN
         * =====================================================
         */

        drawTextInExcelCell(
            ctx,
            wingFor(
                data.group?.callsign ?? ""
            ),
            {
                x: 1185,
                y: 382,
                width: 245,
                height: 171,
                fontSize: 18,
                bold: true,
                align: "center",
                multiline: true
            }
        );


        /*
         * =====================================================
         * C14:C25 - NÚMERO DE WAYPOINT
         * D14:D25 - NOMBRE ABREVIADO
         * E14:E25 - ALTITUD
         * =====================================================
         */

        const waypointStartY = 666;
        const waypointRowHeight = 41.1;

        data.waypoints
            .slice(0, 12)
            .forEach((waypoint, index) => {

                const y =
                    waypointStartY +
                    index * waypointRowHeight;


                /*
                 * Número.
                 */

                drawTextInExcelCell(
                    ctx,
                    String(
                        waypoint.number ??
                        index + 1
                    ),
                    {
                        x: 160,
                        y,
                        width: 116,
                        height: waypointRowHeight,
                        fontSize: 19,
                        bold: false,
                        align: "center"
                    }
                );


                /*
                 * Nombre abreviado.
                 */

                drawTextInExcelCell(
                    ctx,
                    waypoint.excelName ??
                    waypoint.name ??
                    "",
                    {
                        x: 276,
                        y,
                        width: 304,
                        height: waypointRowHeight,
                        fontSize: 19,
                        bold: false,
                        align: "center"
                    }
                );


                /*
                 * Altitud.
                 */

                drawTextInExcelCell(
                    ctx,
                    waypoint.altitude
                        ? formatJpgAltitude(
                            waypoint.altitude
                          )
                        : "",
                    {
                        x: 580,
                        y,
                        width: 275,
                        height: waypointRowHeight,
                        fontSize: 19,
                        bold: false,
                        align: "center"
                    }
                );
            });


        /*
         * Convierte el resultado completo a JPG.
         */

        canvas.toBlob(
            (blob) => {

                if (!blob) {
                    throw new Error(
                        "No se pudo crear la imagen."
                    );
                }

                const groupName =
                    fileKey(
                        data.group?.callsign ??
                        "grupo"
                    );

                downloadBlob(
                    blob,
                    `piernografo_${
                        groupName || "grupo"
                    }.jpg`
                );
            },
            "image/jpeg",
            0.96
        );

    } catch (error) {

        console.error(
            "Error generando el JPG:",
            error
        );

        alert(
            "Se ha generado el XLSX, " +
            "pero no se ha podido generar el JPG: " +
            error.message
        );
    }
}
function loadPiernografoBackground(src) {

    return new Promise(
        (resolve, reject) => {

            const image =
                new Image();

            /*
             * Evita reutilizar una versión antigua
             * de la imagen guardada en caché.
             */

            image.src =
                `${src}?t=${Date.now()}`;

            image.onload =
                () => resolve(image);

            image.onerror =
                () => reject(
                    new Error(
                        `No se pudo cargar ${src}`
                    )
                );
        }
    );
}


function drawTextInExcelCell(
    ctx,
    text,
    options
) {

    const {
        x,
        y,
        width,
        height,
        fontSize = 18,
        bold = false,
        align = "center",
        multiline = false
    } = options;


    const value =
        String(text ?? "").trim();

    if (!value) {
        return;
    }


    ctx.save();


    /*
     * Recorta el texto dentro del área equivalente
     * a la celda de Excel.
     */

    ctx.beginPath();

    ctx.rect(
        x + 2,
        y + 2,
        width - 4,
        height - 4
    );

    ctx.clip();


    ctx.fillStyle = "#000000";

    ctx.font =
        `${
            bold
                ? "bold "
                : ""
        }${fontSize}px Arial`;

    ctx.textBaseline = "middle";


    /*
     * Alineación.
     */

    let textX;

    if (align === "left") {

        ctx.textAlign = "left";

        textX =
            x + 8;

    } else if (align === "right") {

        ctx.textAlign = "right";

        textX =
            x +
            width -
            8;

    } else {

        ctx.textAlign = "center";

        textX =
            x +
            width / 2;
    }


    /*
     * Una sola línea.
     */

    if (!multiline) {

        const fittedFontSize =
            fitTextToCell(
                ctx,
                value,
                width - 16,
                fontSize,
                11,
                bold
            );

        ctx.font =
            `${
                bold
                    ? "bold "
                    : ""
            }${fittedFontSize}px Arial`;

        ctx.fillText(
            value,
            textX,
            y +
            height / 2
        );

        ctx.restore();

        return;
    }


    /*
     * Varias líneas, utilizado principalmente
     * para el nombre del ala.
     */

    const lines =
        splitTextIntoLines(
            ctx,
            value,
            width - 16
        );

    const lineHeight =
        fontSize * 1.15;

    const totalHeight =
        lines.length *
        lineHeight;

    let lineY =
        y +
        height / 2 -
        totalHeight / 2 +
        lineHeight / 2;

    lines.forEach((line) => {

        ctx.fillText(
            line,
            textX,
            lineY
        );

        lineY +=
            lineHeight;
    });


    ctx.restore();
}


function fitTextToCell(
    ctx,
    text,
    maximumWidth,
    startingSize,
    minimumSize,
    bold
) {

    let size =
        startingSize;

    while (
        size > minimumSize
    ) {

        ctx.font =
            `${
                bold
                    ? "bold "
                    : ""
            }${size}px Arial`;

        if (
            ctx.measureText(text).width <=
            maximumWidth
        ) {
            break;
        }

        size -= 1;
    }

    return size;
}


function splitTextIntoLines(
    ctx,
    text,
    maximumWidth
) {

    const words =
        String(text)
            .split(/\s+/);

    const lines = [];

    let currentLine = "";

    words.forEach((word) => {

        const testLine =
            currentLine
                ? `${currentLine} ${word}`
                : word;

        if (
            ctx.measureText(testLine).width >
            maximumWidth &&
            currentLine
        ) {

            lines.push(
                currentLine
            );

            currentLine =
                word;

        } else {

            currentLine =
                testLine;
        }
    });

    if (currentLine) {
        lines.push(
            currentLine
        );
    }

    return lines;
}


function formatJpgAltitude(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "";
    }

    const numeric =
        Number(
            String(value)
                .replace(/\./g, "")
                .replace(",", ".")
        );

    if (
        Number.isFinite(numeric)
    ) {
        return `${
            numeric.toLocaleString(
                "es-ES"
            )
        } ft`;
    }

    const text =
        String(value);

    return /ft/i.test(text)
        ? text
        : `${text} ft`;
}

function wingFor(callsign) {
  const n=fileKey(callsign);
  if(/^(tenis|poker)/.test(n)) return "Ala 12";
  if(/^(toro|marte|ebro)/.test(n)) return "Ala 15";
  if(/^nikel/.test(n)) return "VMFA 122";
  if(/^check/.test(n)) return "VMFA 312";
  if(/^joker/.test(n)) return "VFA-34";
  if(/^blade/.test(n)) return "VMFA-112";
  if(/^aggress?or4/.test(n)) return "64th Aggressor Squadron";
  if(/^aggress?or3/.test(n)) return "VFC-12";
  if(/^aggress?or2/.test(n)) return "NSAWC";
  return "";
}
function excelAltitude(value) {
  if(value==null || value==="") return "";
  const n=Number(String(value).replace(/\./g,"").replace(/,/g,"."));
  return Number.isFinite(n) ? n : value;
}
function fileKey(value) { return String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,""); }

function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
function showDetails(id, lines) { $(id).innerHTML = lines.map((line, index) => index === 0 ? `<strong>${escapeHtml(line)}</strong>` : `<span>${escapeHtml(line)}</span>`).join(""); }
function extractCoordinates(item) { const c = item.coordinates ?? item.position; if (!c) return ""; if (typeof c === "string") return c; return [c.lat ?? c.latitude, c.lon ?? c.lng ?? c.longitude].filter(Boolean).join(" "); }
function formatTacan(tacan) { if (!tacan) return "-"; if (typeof tacan === "string") return tacan; return [tacan.channel, tacan.ident].filter(Boolean).join(" ") || "-"; }
function normalizeFrequency(value) { return String(value ?? "-").replace(/\s*MHz/gi, "").trim(); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function escapeAttr(value) { return escapeHtml(value); }
