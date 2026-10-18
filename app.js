import { loadDatabase }
from "./loader.js";

window.db =
    await loadDatabase();

window.showPage =
async function(page){

    const target =
        document.getElementById("content");

    const html =
        await fetch(
            `${page}.html`
        ).then(r=>r.text());

    target.innerHTML = html;

}

showPage("planner");
