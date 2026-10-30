/* Karthala360 — panier de la boutique.
   Le panier est gardé sur l'appareil du visiteur ; à la commande, le serveur recalcule prix, disponibilité et stock.
   Tous les textes sont insérés avec textContent (jamais de HTML venu de l'extérieur). */
(function () {
  "use strict";
  var EN = /^\/en(\/|$)/.test(location.pathname);
  var T = function (fr, en) { return EN ? en : fr; };
  var CLE = "k360-panier";
  var ENDPOINT = (window.K360 && window.K360.endpoint) || "/api/k360";
  var WHATSAPP = (window.K360 && window.K360.whatsapp) || "";
  var MAX_QTE = 20;

  // ---------- Stockage ----------
  function lire() { try { var l = JSON.parse(localStorage.getItem(CLE) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function ecrire(l) {
    try { if (l.length) localStorage.setItem(CLE, JSON.stringify(l)); else localStorage.removeItem(CLE); } catch (e) {}
    majBouton();
    try { window.dispatchEvent(new Event("k360-panier")); } catch (e) {}
  }
  var panier = lire();
  var catalogue = {}; // code → {prix, disponible, stock} à jour, depuis le serveur

  var euros = function (n) { return EN ? "€" + (Math.round(n * 100) / 100) : (Math.round(n * 100) / 100).toLocaleString("fr-FR") + " €"; };
  var el = function (tag, attrs, texte) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    if (texte != null) e.textContent = texte;
    return e;
  };
  // Le panier contient des articles de la boutique et des activités à réserver (type « activite »)
  var estActivite = function (l) { return l.type === "activite"; };
  var activites = function () { return panier.filter(estActivite); };
  var produits = function () { return panier.filter(function (l) { return !estActivite(l); }); };
  var nombre = function () { return panier.reduce(function (s, l) { return s + l.quantite; }, 0); };
  var prixDe = function (l) { if (estActivite(l)) return l.prix || 0; var c = catalogue[l.code]; return c ? c.prix : l.prix; };
  var dateLisible = function (d) { var p = String(d || "").split("-"); return p.length === 3 ? (EN ? d : p[2] + "/" + p[1] + "/" + p[0]) : d; };
  var resumeActivite = function (l) {
    var n = (l.adultes || 0) + (l.enfants || 0);
    return dateLisible(l.date_souhaitee) + " · " + n + " " + T(n > 1 ? "personnes" : "personne", n > 1 ? "people" : "person");
  };
  var total = function () { return panier.reduce(function (s, l) { return s + prixDe(l) * l.quantite; }, 0); };

  // ---------- Bouton de l'en-tête ----------
  var SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/></svg>';
  var bouton = el("button", { type: "button", "class": "panier-bouton", "aria-haspopup": "dialog" });
  bouton.innerHTML = SVG; // icône fixe, écrite ici
  var compteur = el("span", { "class": "panier-nombre", "aria-hidden": "true" });
  bouton.appendChild(compteur);
  var formResa = document.querySelector("form[data-form=reservation]");
  var surBoutique = !!document.querySelector("[data-ajout-panier]") || !!formResa;
  function majBouton() {
    var n = nombre();
    compteur.textContent = n ? String(n) : "";
    bouton.setAttribute("aria-label", n ? T("Panier : " + n + " article" + (n > 1 ? "s" : ""), "Cart: " + n + " item" + (n > 1 ? "s" : "")) : T("Panier vide", "Cart is empty"));
    bouton.title = bouton.getAttribute("aria-label");
    bouton.hidden = !n && !surBoutique; // hors boutique, le bouton n'apparaît que si le panier contient quelque chose
  }
  var place = document.querySelector(".entete [data-theme-bascule]");
  if (place) place.insertAdjacentElement("afterend", bouton);
  else { bouton.style.cssText = "position:fixed;top:1rem;right:1rem;z-index:60"; document.body.appendChild(bouton); }
  majBouton();

  // ---------- Message bref ----------
  var toast = el("div", { "class": "panier-toast", role: "status", "aria-live": "polite" });
  document.body.appendChild(toast);
  var minuterie;
  function annoncer(texte) {
    toast.textContent = texte; toast.classList.add("visible");
    clearTimeout(minuterie); minuterie = setTimeout(function () { toast.classList.remove("visible"); }, 2200);
  }

  // ---------- Ajouter depuis une carte produit ----------
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-ajout-panier]");
    if (!b) return;
    var carte = b.closest(".produit");
    var choix = carte && carte.querySelector('input[type="radio"]:checked');
    var img = carte && carte.querySelector(".carte-photo img");
    var ligne = {
      code: b.getAttribute("data-code"), nom: b.getAttribute("data-nom"), prix: Number(b.getAttribute("data-prix")),
      option: choix ? choix.value : "", image: img ? img.getAttribute("src") : "", quantite: 1
    };
    var deja = panier.filter(function (l) { return l.code === ligne.code && l.option === ligne.option; })[0];
    if (deja) deja.quantite = Math.min(MAX_QTE, deja.quantite + 1); else panier.push(ligne);
    ecrire(panier);
    bouton.classList.remove("secousse"); void bouton.offsetWidth; bouton.classList.add("secousse");
    annoncer(T("Ajouté au panier : ", "Added to cart: ") + ligne.nom + (ligne.option ? " (" + ligne.option + ")" : ""));
  });

  // ---------- Formulaire de réservation : plusieurs activités dans le panier ----------
  if (formResa) {
    var CHAMPS_ACTIVITE = ["formule", "date_souhaitee", "adultes", "enfants", "contribution", "prise_en_charge"];
    var envoi = formResa.querySelector("[type=submit]");
    var zoneAjout = el("div", { "class": "resa-panier" });
    var ajout = el("button", { type: "button", "class": "bouton secondaire resa-ajout" }, T("+ Ajouter au panier", "+ Add to cart"));
    var aide = el("p", { "class": "resa-panier-aide" }, T("Plusieurs activités ? Ajoutez-les une par une au panier, puis validez le panier en une seule fois.",
      "Several activities? Add them to the cart one by one, then check out once."));
    zoneAjout.appendChild(ajout); zoneAjout.appendChild(aide);
    if (envoi) envoi.insertAdjacentElement("afterend", zoneAjout);

    ajout.addEventListener("click", function () {
      var e = formResa.elements;
      // Seuls les champs de l'activité sont exigés ici ; les coordonnées sont demandées à la validation du panier
      for (var i = 0; i < CHAMPS_ACTIVITE.length; i++) { var c = e[CHAMPS_ACTIVITE[i]]; if (c && !c.checkValidity()) { c.reportValidity(); return; } }
      var adultes = parseInt(e.adultes.value, 10) || 0, enfants = parseInt(e.enfants && e.enfants.value, 10) || 0;
      if (adultes + enfants < 1) { e.adultes.setCustomValidity(T("Au moins une personne", "At least one person")); e.adultes.reportValidity(); e.adultes.setCustomValidity(""); return; }
      if (activites().length >= 10) { annoncer(T("10 activités au maximum par panier", "10 activities maximum per cart")); return; }
      var opt = e.formule.options[e.formule.selectedIndex];
      var ligne = {
        type: "activite", code: "activite:" + Date.now(), nom: e.formule.value, image: "",
        formule: e.formule.value, formule_code: opt ? opt.getAttribute("data-code") || "" : "",
        date_souhaitee: e.date_souhaitee.value, adultes: adultes, enfants: enfants,
        contribution: e.contribution ? e.contribution.value : "", prise_en_charge: e.prise_en_charge ? e.prise_en_charge.value : "",
        prix: e.estimation && e.estimation.value ? Number(e.estimation.value) : null, quantite: 1
      };
      panier.push(ligne); ecrire(panier);
      bouton.classList.remove("secousse"); void bouton.offsetWidth; bouton.classList.add("secousse");
      annoncer(T("Ajouté au panier : ", "Added to cart: ") + ligne.nom + " · " + dateLisible(ligne.date_souhaitee));
      // Prêt pour l'activité suivante : on garde le nombre de personnes et le lieu de prise en charge
      e.formule.value = ""; e.date_souhaitee.value = "";
      e.formule.dispatchEvent(new Event("change", { bubbles: true }));
      majAideResa();
    });

    // Rappel près du bouton d'envoi quand le panier contient déjà des activités
    var rappel = el("p", { "class": "resa-panier-rappel", hidden: "" });
    var voir = el("button", { type: "button", "class": "lien-bouton" }, T("Voir le panier et valider", "View cart and check out"));
    voir.addEventListener("click", function () { ouvrir(); });
    zoneAjout.appendChild(rappel);
    function majAideResa() {
      var n = activites().length;
      rappel.hidden = !n;
      while (rappel.firstChild) rappel.removeChild(rappel.firstChild);
      if (n) {
        rappel.appendChild(document.createTextNode(T(n + (n > 1 ? " activités dans votre panier. " : " activité dans votre panier. "), n + (n > 1 ? " activities in your cart. " : " activity in your cart. "))));
        rappel.appendChild(voir);
      }
    }
    majAideResa();
    window.addEventListener("k360-panier", majAideResa);
  }

  // ---------- Tiroir ----------
  var fond = el("div", { "class": "panier-fond", hidden: "" });
  var tiroir = el("aside", { "class": "panier-tiroir", role: "dialog", "aria-modal": "true", "aria-labelledby": "panier-titre", hidden: "" });
  var tete = el("div", { "class": "panier-tete" });
  var titre = el("h2", { id: "panier-titre" }, T("Votre panier", "Your cart"));
  var fermer = el("button", { type: "button", "class": "panier-fermer", "aria-label": T("Fermer le panier", "Close cart") }, "×");
  tete.appendChild(titre); tete.appendChild(fermer);
  var corps = el("div", { "class": "panier-corps" });
  var pied = el("div", { "class": "panier-pied" });
  tiroir.appendChild(tete); tiroir.appendChild(corps); tiroir.appendChild(pied);
  document.body.appendChild(fond); document.body.appendChild(tiroir);

  var dernierFocus = null;
  function ouvrir() {
    dernierFocus = document.activeElement;
    toast.classList.remove("visible"); clearTimeout(minuterie); // le message ne doit pas couvrir le panier
    fond.hidden = false; tiroir.hidden = false;
    requestAnimationFrame(function () { fond.classList.add("visible"); tiroir.classList.add("visible"); });
    afficherPanier(); actualiserPrix();
    fermer.focus();
    document.addEventListener("keydown", clavier);
  }
  function fermerTiroir() {
    fond.classList.remove("visible"); tiroir.classList.remove("visible");
    setTimeout(function () { fond.hidden = true; tiroir.hidden = true; }, 260);
    document.removeEventListener("keydown", clavier);
    if (dernierFocus && dernierFocus.focus) dernierFocus.focus();
  }
  function clavier(e) { if (e.key === "Escape") fermerTiroir(); }
  bouton.addEventListener("click", ouvrir);
  fermer.addEventListener("click", fermerTiroir);
  fond.addEventListener("click", fermerTiroir);

  // Prix, disponibilité et stock à jour
  function actualiserPrix() {
    return fetch(ENDPOINT + "?action=produits").then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) return;
      d.produits.forEach(function (p) { catalogue[p.code] = p; });
      if (!tiroir.hidden && corps.getAttribute("data-vue") === "panier") afficherPanier();
    }).catch(function () {});
  }

  function vider(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function afficherPanier() {
    corps.setAttribute("data-vue", "panier");
    titre.textContent = T("Votre panier", "Your cart");
    vider(corps); vider(pied);
    if (!panier.length) {
      corps.appendChild(el("p", { "class": "panier-vide" }, T("Votre panier est vide.", "Your cart is empty.")));
      if (!surBoutique) {
        var lien = el("a", { "class": "bouton", href: EN ? "/en/shop" : "/boutique" }, T("Voir la boutique", "See the shop"));
        pied.appendChild(lien);
      }
      return;
    }
    var bloque = false;
    panier.forEach(function (l, i) {
      if (estActivite(l)) {
        var la = el("div", { "class": "panier-ligne panier-activite" });
        la.appendChild(el("span", { "class": "sans-image activite-icone", "aria-hidden": "true" }, "⛰"));
        var ia = el("div");
        ia.appendChild(el("b", null, l.nom));
        ia.appendChild(el("small", null, resumeActivite(l)));
        if (l.prise_en_charge) { ia.appendChild(el("small", null, T("Prise en charge : ", "Pick-up: ") + l.prise_en_charge)); }
        var actions = el("div", { "class": "panier-qte" });
        var ret = el("button", { type: "button", "class": "panier-retirer" }, T("Retirer", "Remove"));
        ret.addEventListener("click", function () { panier.splice(i, 1); ecrire(panier); afficherPanier(); });
        actions.appendChild(ret);
        ia.appendChild(actions);
        la.appendChild(ia);
        la.appendChild(el("span", { "class": "panier-prix" }, l.prix ? euros(l.prix) : T("sur devis", "on quote")));
        corps.appendChild(la);
        return;
      }
      var c = catalogue[l.code];
      var ligne = el("div", { "class": "panier-ligne" });
      ligne.appendChild(l.image ? el("img", { src: l.image, alt: "" }) : el("span", { "class": "sans-image" }));
      var info = el("div");
      info.appendChild(el("b", null, l.nom));
      if (l.option) info.appendChild(el("small", null, T("Taille / choix : ", "Size / option: ") + l.option));
      var probleme = "";
      if (c && !c.disponible) probleme = T("Plus disponible : retirez-le pour commander", "No longer available: remove it to order");
      else if (c && c.stock != null && l.quantite > c.stock) probleme = c.stock > 0 ? T("Plus que " + c.stock + " en stock", "Only " + c.stock + " left") : T("Épuisé", "Sold out");
      if (probleme) { bloque = true; info.appendChild(el("small", { "class": "alerte" }, probleme)); info.lastChild.style.display = "block"; }
      var qte = el("div", { "class": "panier-qte" });
      var moins = el("button", { type: "button", "aria-label": T("Retirer un", "One less") }, "−");
      var n = el("span", { "aria-live": "polite" }, String(l.quantite));
      var plus = el("button", { type: "button", "aria-label": T("Ajouter un", "One more") }, "+");
      var retirer = el("button", { type: "button", "class": "panier-retirer" }, T("Retirer", "Remove"));
      moins.addEventListener("click", function () { if (l.quantite > 1) { l.quantite--; ecrire(panier); afficherPanier(); } });
      plus.addEventListener("click", function () { if (l.quantite < MAX_QTE) { l.quantite++; ecrire(panier); afficherPanier(); } });
      retirer.addEventListener("click", function () { panier.splice(i, 1); ecrire(panier); afficherPanier(); });
      qte.appendChild(moins); qte.appendChild(n); qte.appendChild(plus); qte.appendChild(retirer);
      info.appendChild(qte);
      ligne.appendChild(info);
      ligne.appendChild(el("span", { "class": "panier-prix" }, euros(prixDe(l) * l.quantite)));
      corps.appendChild(ligne);
    });
    var tot = el("div", { "class": "panier-total" });
    tot.appendChild(el("span", null, T("Total", "Total"))); tot.appendChild(el("span", null, euros(total())));
    pied.appendChild(tot);
    pied.appendChild(el("p", { "class": "panier-note" }, activites().length
      ? T("Aucun paiement maintenant : l'équipe confirme les dates et la météo, puis vous versez l'acompte. Prix des activités estimés, confirmés à l'envoi.",
        "No payment now: the team confirms dates and weather, then you pay the deposit. Activity prices are estimates, confirmed on sending.")
      : T("Aucun paiement maintenant : l'équipe confirme la disponibilité, puis vous réglez par virement, PayPal, MVola ou Wakati.",
        "No payment now: the team confirms availability, then you pay by bank transfer, PayPal, MVola or Wakati.")));
    var secondaire = null;
    if (formResa) {
      var autre = el("button", { type: "button", "class": "bouton secondaire" }, T("+ Ajouter une autre activité", "+ Add another activity"));
      autre.addEventListener("click", function () { fermerTiroir(); setTimeout(function () { formResa.elements.formule.focus(); }, 280); });
      secondaire = autre;
    } else if (activites().length) {
      secondaire = el("a", { "class": "bouton secondaire", href: EN ? "/en/book" : "/reservation" }, T("+ Ajouter une activité", "+ Add an activity"));
    }
    var suite = el("button", { type: "button", "class": "bouton" }, activites().length ? T("Valider le panier", "Check out") : T("Passer commande", "Checkout"));
    if (bloque) { suite.disabled = true; suite.title = T("Corrigez les articles signalés", "Fix the flagged items"); }
    suite.addEventListener("click", afficherFormulaire);
    pied.appendChild(suite);
    if (secondaire) pied.appendChild(secondaire);
  }

  function champ(form, nom, libelle, type, requis, attrs) {
    var lab = el("label", null, libelle + (requis ? " *" : ""));
    var inp = type === "textarea" ? el("textarea", { name: nom, rows: "2", maxlength: "1000" }) : el("input", Object.assign({ name: nom, type: type, maxlength: "120" }, attrs || {}));
    if (requis) inp.required = true;
    lab.appendChild(inp); form.appendChild(lab);
    return inp;
  }

  function afficherFormulaire() {
    corps.setAttribute("data-vue", "formulaire");
    titre.textContent = T("Vos coordonnées", "Your details");
    vider(corps); vider(pied);
    var avecActivites = activites().length > 0, avecProduits = produits().length > 0;
    var form = el("form", { "class": "panier-form", novalidate: "" });
    var nom = champ(form, "nom", T("Nom et prénom", "Full name"), "text", true, { autocomplete: "name" });
    var tel = champ(form, "telephone", T("Téléphone / WhatsApp", "Phone / WhatsApp"), "tel", true, { autocomplete: "tel" });
    var mail = champ(form, "email", avecActivites ? T("E-mail (pour recevoir vos bons de réservation)", "Email (to receive your booking forms)") : T("E-mail", "Email"), "email", false, { autocomplete: "email" });
    var pays = avecActivites ? champ(form, "pays", T("Pays de résidence", "Country of residence"), "text", false, { autocomplete: "country-name" }) : null;
    // Coordonnées déjà saisies dans le formulaire de réservation : reprises pour ne pas les retaper
    if (formResa) {
      [[nom, "nom"], [tel, "telephone"], [mail, "email"], [pays, "pays"]].forEach(function (x) {
        var src = formResa.elements[x[1]];
        if (x[0] && src && src.value) x[0].value = src.value;
      });
    }
    if (avecProduits) {
      var labR = el("label", null, T("Remise des articles", "Item delivery") + " *");
      var sel = el("select", { name: "mode_remise", required: "" });
      [[T("Retrait à Moroni", "Pick-up in Moroni")], [T("Remise le jour de mon ascension", "Hand-over on my climb day")], [T("Envoi à l'étranger (frais sur devis)", "Shipping abroad (quote on request)")]]
        .forEach(function (o) { sel.appendChild(el("option", { value: o[0] }, o[0])); });
      if (avecActivites) sel.selectedIndex = 1;
      labR.appendChild(sel); form.appendChild(labR);
    }
    champ(form, "message", T("Message (facultatif)", "Message (optional)"), "textarea", false);
    var cgv = null;
    if (avecActivites) {
      var labC = el("label", { "class": "panier-cgv" });
      cgv = el("input", { type: "checkbox", name: "accepte_cgv", value: "Oui", required: "" });
      labC.appendChild(cgv);
      var txt = el("span");
      txt.appendChild(document.createTextNode(T("J'ai lu les ", "I have read the ")));
      txt.appendChild(el("a", { href: EN ? "/en/terms" : "/cgv", target: "_blank", rel: "noopener" }, T("conditions de vente", "terms of sale")));
      txt.appendChild(document.createTextNode(T(" (annulation, report météo).", " (cancellation, weather postponement).")));
      labC.appendChild(txt); form.appendChild(labC);
      var cgvResa = formResa && formResa.elements.accepte_cgv;
      if (cgvResa && cgvResa.checked) cgv.checked = true;
    }
    var miel = el("input", { name: "site_web", type: "text", tabindex: "-1", autocomplete: "off", "class": "pot-de-miel", "aria-hidden": "true" });
    form.appendChild(miel);
    var erreur = el("p", { "class": "panier-erreur", role: "alert" });
    form.appendChild(erreur);
    corps.appendChild(form);

    var tot = el("div", { "class": "panier-total" });
    var nA = activites().length, nP = produits().reduce(function (s, l) { return s + l.quantite; }, 0);
    var parts = [];
    if (nA) parts.push(nA + " " + T(nA > 1 ? "activités" : "activité", nA > 1 ? "activities" : "activity"));
    if (nP) parts.push(nP + " " + T(nP > 1 ? "articles" : "article", nP > 1 ? "items" : "item"));
    tot.appendChild(el("span", null, parts.join(" + ")));
    tot.appendChild(el("span", null, euros(total())));
    pied.appendChild(tot);
    var libelleEnvoi = avecActivites ? T("Envoyer ma demande", "Send my request") : T("Envoyer la commande", "Place order");
    var envoyer = el("button", { type: "button", "class": "bouton" }, libelleEnvoi);
    var retour = el("button", { type: "button", "class": "bouton secondaire" }, T("Retour au panier", "Back to cart"));
    retour.addEventListener("click", afficherPanier);
    pied.appendChild(envoyer); pied.appendChild(retour);
    nom.focus();

    envoyer.addEventListener("click", function () {
      erreur.textContent = "";
      if (!form.reportValidity()) return;
      if (miel.value) return; // robot
      var d = new URLSearchParams();
      d.append("formulaire", avecActivites ? "panier" : "commande"); d.append("page", location.pathname);
      ["nom", "telephone", "email", "pays", "mode_remise", "message"].forEach(function (k) { if (form.elements[k]) d.append(k, form.elements[k].value); });
      if (cgv && cgv.checked) d.append("accepte_cgv", "Oui");
      d.append("panier", JSON.stringify(produits().map(function (l) { return { code: l.code, option: l.option, quantite: l.quantite }; })));
      if (avecActivites) d.append("activites", JSON.stringify(activites().map(function (l) {
        return { formule: l.formule, date_souhaitee: l.date_souhaitee, adultes: l.adultes, enfants: l.enfants, contribution: l.contribution, prise_en_charge: l.prise_en_charge };
      })));
      envoyer.disabled = true; envoyer.textContent = T("Envoi…", "Sending…");
      fetch(ENDPOINT, { method: "POST", body: d })
        .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
        .then(function (x) {
          if (x.j && x.j.ok) { var copie = panier.slice(); panier = []; ecrire(panier); confirmer(x.j, form, copie); return; }
          // Prix, stock ou disponibilité changés depuis l'ajout : on remet le panier à jour et on l'affiche
          erreur.textContent = (x.j && x.j.erreur) || T("La demande n'a pas pu être envoyée.", "The request could not be sent.");
          if (x.j && (x.j.code === "stock" || x.j.code === "indisponible")) actualiserPrix();
          envoyer.disabled = false; envoyer.textContent = libelleEnvoi;
        })
        .catch(function () {
          erreur.textContent = T("Connexion impossible. Vous pouvez envoyer la demande par WhatsApp :", "Connection failed. You can send the request on WhatsApp:");
          var lien = el("a", { href: lienWhatsApp(form, panier, ""), target: "_blank", rel: "noopener" }, "WhatsApp");
          erreur.appendChild(document.createTextNode(" ")); erreur.appendChild(lien);
          envoyer.disabled = false; envoyer.textContent = libelleEnvoi;
        });
    });
  }

  function lienWhatsApp(form, lignes, ref) {
    var acts = lignes.filter(estActivite), arts = lignes.filter(function (l) { return !estActivite(l); });
    var texte = T("Bonjour Discovermores, ", "Hello Discovermores, ") + (ref ? T("ma demande " + ref + " :", "my request " + ref + ":") : T("je souhaite réserver :", "I would like to book:")) + "\n" +
      acts.map(function (l) { return "- " + l.nom + " · " + resumeActivite(l) + (l.prix ? " · " + euros(l.prix) : ""); }).concat(
        arts.map(function (l) { return "- " + l.quantite + " × " + l.nom + (l.option ? " (" + l.option + ")" : ""); })).join("\n") +
      "\n" + T("Total : ", "Total: ") + euros(lignes.reduce(function (s, l) { return s + (l.total != null ? l.total : prixDe(l) * l.quantite); }, 0)) +
      "\n" + form.elements.nom.value + (form.elements.mode_remise ? " · " + form.elements.mode_remise.value : "");
    return "https://wa.me/" + String(WHATSAPP).replace(/\D/g, "") + "?text=" + encodeURIComponent(texte).replace(/'/g, "%27");
  }

  function confirmer(rep, form, lignes) {
    corps.setAttribute("data-vue", "ok");
    var avecActivites = rep.reservations && rep.reservations.length;
    titre.textContent = avecActivites ? T("Demande envoyée", "Request sent") : T("Commande envoyée", "Order sent");
    vider(corps); vider(pied);
    var ok = el("div", { "class": "panier-ok" });
    ok.appendChild(el("p", null, T("Merci ! Votre référence :", "Thank you! Your reference:")));
    ok.appendChild(el("p", { "class": "ref" }, rep.id));
    if (avecActivites && (rep.reservations.length > 1 || rep.commande)) {
      var liste = el("ul", { "class": "panier-refs" });
      rep.reservations.forEach(function (r) { liste.appendChild(el("li", null, r.ref + " · " + r.formule + " · " + dateLisible(r.date_souhaitee) + (r.total != null ? " · " + euros(r.total) : ""))); });
      if (rep.commande) liste.appendChild(el("li", null, rep.commande.ref + " · " + T("articles de la boutique", "shop items") + " · " + euros(rep.commande.total)));
      ok.appendChild(liste);
    }
    ok.appendChild(el("p", null, T("Total : ", "Total: ") + euros(rep.total)));
    ok.appendChild(el("p", null, avecActivites
      ? T("L'équipe Discovermores vous confirme les dates et la météo sous 24 heures. La réservation est définitive à réception de l'acompte."
        + (form.elements.email && form.elements.email.value ? " Vos bons de réservation arrivent par e-mail." : ""),
        "The Discovermores team will confirm dates and weather within 24 hours. Your booking is final once the deposit is received."
        + (form.elements.email && form.elements.email.value ? " Your booking forms are on their way by email." : ""))
      : T("L'équipe Discovermores vous confirme la disponibilité et le délai sous 24 heures, puis vous réglez la commande.",
        "The Discovermores team will confirm availability and timing within 24 hours, then you pay for your order.")));
    corps.appendChild(ok);
    var wa = el("a", { "class": "bouton whatsapp", href: lienWhatsApp(form, lignes, rep.id), target: "_blank", rel: "noopener" }, T("Prévenir l'équipe sur WhatsApp", "Notify the team on WhatsApp"));
    var payer = el("a", { "class": "bouton secondaire", href: EN ? "/en/payment" : "/paiement" }, T("Voir les moyens de paiement", "See payment methods"));
    pied.appendChild(wa); pied.appendChild(payer);
  }

  // Panier ouvert depuis un lien (ex. /boutique#panier)
  if (location.hash === "#panier") ouvrir();
  // Synchronisation entre onglets
  window.addEventListener("storage", function (e) { if (e.key === CLE) { panier = lire(); majBouton(); if (!tiroir.hidden) afficherPanier(); } });
})();
