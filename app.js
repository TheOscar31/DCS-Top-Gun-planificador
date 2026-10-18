import { loadDatabase } from "./loader.js";

let db = {};

async function init() {
    try {

        db = await loadDatabase();

        window.db = db;

        console.log("Base de datos cargada");

        window.showPage = async function(page) {

            const target =
                document.getElementById("content");

            const response =
                await fetch(`${page}.html`);

            if (!response.ok) {

                target.innerHTML = `
                    <h2>${page}</h2>
                    <p>Página todavía no creada.</p>
                `;

                return;
            }

            const html =
                await response.text();

            target.innerHTML = html;
        };

        showPage("planner");

    }
    catch(error) {

        console.error(error);

        document.getElementById("content").innerHTML =
            `<pre>${error}</pre>`;
    }
}

init();
