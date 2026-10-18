window.buildKneeboard =
function(){

    const selected =
        document.getElementById(
            "groupSelector"
        ).value;

    const group =
        db.groups.find(
            g => g.id === selected
        );

    const weather =
        JSON.parse(
            localStorage.getItem(
                "weather"
            )
        );

    document.getElementById(
        "kneeboard"
    ).textContent =

`CALLSIGN: ${group.callsign}

FREQUENCY: ${group.frequency}

CATEGORY:
${group.category}

WIND:
${weather.windFrom}°

QNH:
${weather.qnh}`;
}