export async function loadDatabase() {

    const database = {};

    const files = [
        "airports",
        "carriers",
        "tankers",
        "ranges",
        "farps",
        "outbases",
        "groups",
        "comms",
        "waypoints"
    ];

    for(const file of files){

        database[file] =
            await fetch(
                `${file}.json`
            ).then(r => r.json());
    }

    return database;
}
