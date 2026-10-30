/* Karthala360 — défilement continu des avis de l'accueil.
   Les cartes sont doublées pour une boucle sans à-coup ; la copie est cachée aux lecteurs d'écran.
   Vitesse constante quel que soit le nombre d'avis ; pause au survol, au toucher et au clavier. */
(function () {
  "use strict";
  var VITESSE = 38; // pixels par seconde : lent et lisible
  var zone = document.querySelector('[data-avis-zone="accueil"]');
  if (!zone) return;
  var liste = zone.querySelector("[data-avis-liste]");
  if (!liste) return;
  var observateur;

  function monter() {
    if (observateur) observateur.disconnect();
    // Repartir des cartes d'origine (le site peut remplacer la liste après chargement)
    var originales = Array.prototype.slice.call(liste.querySelectorAll(".avis")).filter(function (c) { return c.getAttribute("aria-hidden") !== "true"; });
    if (originales.length < 3) { observer(); return; } // trop peu d'avis : grille normale, sans défilement
    var defile = document.createElement("div");
    defile.className = "avis-defile";
    defile.setAttribute("role", "region");
    defile.setAttribute("aria-label", document.documentElement.lang === "en" ? "Traveller reviews (scrolling, paused on hover)" : "Avis des voyageurs (défilement, pause au survol)");
    var piste = document.createElement("div");
    piste.className = "avis-piste";
    originales.forEach(function (c) { piste.appendChild(c); });
    // Copie pour la boucle : invisible pour les lecteurs d'écran et le clavier
    originales.forEach(function (c) {
      var copie = c.cloneNode(true);
      copie.setAttribute("aria-hidden", "true");
      copie.querySelectorAll("a,button").forEach(function (x) { x.setAttribute("tabindex", "-1"); });
      piste.appendChild(copie);
    });
    defile.appendChild(piste);
    liste.textContent = "";
    liste.style.display = "block";
    liste.appendChild(defile);
    // Durée proportionnelle à la longueur : même vitesse pour 3 ou 12 avis
    requestAnimationFrame(function () {
      var largeur = piste.scrollWidth / 2;
      piste.style.setProperty("--duree", Math.max(20, Math.round(largeur / VITESSE)) + "s");
    });
    // Toucher : pause tant que le doigt est posé, reprise juste après
    defile.addEventListener("touchstart", function () { defile.classList.add("en-pause"); }, { passive: true });
    defile.addEventListener("touchend", function () { setTimeout(function () { defile.classList.remove("en-pause"); }, 1200); }, { passive: true });
    // Hors de l'écran : animation suspendue (économie de batterie)
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { piste.style.animationPlayState = e[0].isIntersecting ? "" : "paused"; }).observe(defile);
    }
    observer();
  }

  // Le script du site remplace la liste quand il reçoit les avis : on remonte le carrousel
  function observer() {
    observateur = new MutationObserver(function () { if (!liste.querySelector(".avis-defile")) monter(); });
    observateur.observe(liste, { childList: true });
  }

  monter();
})();
