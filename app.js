import { loadDatabase } from "./loader.js";

const db = await loadDatabase();

window.db = db;

const mission = {

    unit: null,

    group: null,

    tankers: [],

    ranges: [],

    waypoints: []

};

const unitSelector =
    document.getElementById("unitSelector");

const typeSelector =
    document.getElementById("unitType");

const groupSelector =
    document.getElementById("groupSelector");

loadUnits();

loadAssets();

createInitialWaypoints();

typeSelector.addEventListener(
    "change",
    loadUnits
);

groupSelector.addEventListener(
    "change",
    updateMission
);

document
.getElementById("generateButton")
.addEventListener(
    "click",
    buildKneeboard
);

function loadUnits(){

    unitSelector.innerHTML = "";

    let source = [];

    switch(typeSelector.value){

        case "airport":

            source = db.airports;
            break;

        case "carrier":

            source = db.carriers;
            break;

        case "farp":

            source = db.farps;
            break;

        case "outbase":

            source = db.outbases;
            break;
    }

    source.forEach(item => {

        const option =
            document.createElement("option");

        option.value =
            item.id ??
            item.icao ??
            item.name;

        option.textContent =
            item.name;

        unitSelector.appendChild(option);

    });

    unitSelector.onchange =
        loadGroups;

    loadGroups();
}

function loadGroups(){

    const selected =
        unitSelector.value;

    mission.unit =
        selected;

    groupSelector.innerHTML = "";

    const filtered =
        db.groups.filter(
            g =>
            g.homeUnit === selected
        );

    filtered.forEach(group => {

        const option =
            document.createElement("option");

        option.value =
            group.id;

        option.textContent =
            group.callsign;

        groupSelector.appendChild(option);

    });

    updateMission();
}

function updateMission(){

    mission.group =
        groupSelector.value;
}

function loadAssets(){

    const tankerContainer =
        document.getElementById(
            "tankersContainer"
        );

    db.tankers.forEach(tanker => {

        tankerContainer.innerHTML +=
        `
        <label>

        <input
            type="checkbox"
            value="${tanker.id}"
            class="tankerCheck">

        ${tanker.callsign}

        </label>

        <br>
        `;
    });

    const rangeContainer =
        document.getElementById(
            "rangesContainer"
        );

    db.ranges.forEach(range => {

        rangeContainer.innerHTML +=
        `
        <label>

        <input
            type="checkbox"
            value="${range.id}"
            class="rangeCheck">

        ${range.name}

        </label>

        <br>
        `;
    });
}

function createInitialWaypoints(){

    const container =
        document.getElementById(
            "waypointsContainer"
        );

    for(
        let i = 1;
        i <= 20;
        i++
    ){

        const select =
            document.createElement(
                "select"
            );

        select.innerHTML =
            `
            <option>
            -
            </option>
            `;

        db.waypoints.forEach(wp => {

            select.innerHTML +=
            `
            <option
             value="${wp.name}">

            ${wp.name}

            </option>
            `;
        });

        const row =
            document.createElement(
                "div"
            );

        row.innerHTML =
            `<strong>
                WP${i}
             </strong> `;

        row.appendChild(select);

        container.appendChild(row);
    }
}

function buildKneeboard(){

    const group =
        db.groups.find(
            g => g.id ===
            mission.group
        );

    const selectedTankers =
        [...document.querySelectorAll(
            ".tankerCheck:checked"
        )]
        .map(x => x.value);

    const selectedRanges =
        [...document.querySelectorAll(
            ".rangeCheck:checked"
        )]
        .map(x => x.value);

    document.getElementById(
        "kneeboardPreview"
    ).textContent =

`GRUPO
${group?.callsign ?? "-"}

ORIGEN
${mission.unit}

TANKERS
${selectedTankers.join(", ")}

RANGES
${selectedRanges.join(", ")}
`;
}
