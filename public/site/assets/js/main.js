/* Karthala360 — script du site (V75).
   Aucun cookie, aucun traceur. Les formulaires envoient vers le script Google
   indiqué dans config.js ; sinon, ils proposent l’envoi par WhatsApp. */
(function () {
  "use strict";
  var C = window.K360 || { formules: [] };
  // Langue de la page : les pages de site/en/ ont <html lang="en">
  var EN = document.documentElement.lang === "en";
  function T(fr, en) { return EN ? en : fr; }
  var LOCALE = EN ? "en-GB" : "fr-FR";

  /* ---------- Menu mobile ---------- */
  var bouton = document.querySelector(".menu-bouton");
  var nav = document.getElementById("nav");
  if (bouton && nav) {
    bouton.addEventListener("click", function () {
      var ouvert = nav.classList.toggle("ouvert");
      bouton.setAttribute("aria-expanded", ouvert ? "true" : "false");
      bouton.textContent = ouvert ? T("Fermer", "Close") : "Menu";
    });
  }

  /* ---------- Apparition des blocs au défilement ---------- */
  if ("IntersectionObserver" in window) {
    document.documentElement.classList.add("js");
    var blocs = document.querySelectorAll(".section h2, .cartes-formules > li, .etapes > li, .feux > li, .bande-photos, .duo > *, .appel, .grille > div, .indicateurs, .fiche, .trace-carte, .trace-profil");
    var obs = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("visible"); obs.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    blocs.forEach(function (b, i) {
      b.classList.add("apparait");
      b.style.transitionDelay = (i % 4) * 80 + "ms";
      obs.observe(b);
    });
  }

  /* ---------- Tracés GPS : choix de la formule ---------- */
  document.querySelectorAll(".trace").forEach(function (trace) {
    var zone = trace.closest("section") || trace;
    var onglets = trace.querySelectorAll('[role="tab"]');
    onglets.forEach(function (o) {
      o.addEventListener("click", function () {
        var mode = o.getAttribute("data-mode");
        trace.setAttribute("data-mode", mode);
        onglets.forEach(function (x) { x.setAttribute("aria-selected", x === o ? "true" : "false"); });
        zone.querySelectorAll("[data-pour]").forEach(function (el) { el.hidden = el.getAttribute("data-pour") !== mode; });
      });
    });
    // Onglet demandé par un lien depuis la page Formules : observatoire.html?trace=soft#parcours
    var voulu = new URLSearchParams(location.search).get("trace");
    onglets.forEach(function (o) { if (o.getAttribute("data-mode") === voulu) { o.click(); } });
  });

  /* ---------- Boutique : l'option choisie (taille, itinéraire) part dans le message WhatsApp ---------- */
  document.querySelectorAll(".produit").forEach(function (carte) {
    var lien = carte.querySelector("a[data-message]");
    var liste = carte.closest("[data-whatsapp]");
    if (!lien || !liste) { return; }
    carte.querySelectorAll('input[type="radio"]').forEach(function (r) {
      r.addEventListener("change", function () {
        var texte = lien.getAttribute("data-message") + " (" + lien.getAttribute("data-prefixe") + r.value + ")" + lien.getAttribute("data-suffixe") + ".";
        lien.href = "https://wa.me/" + liste.getAttribute("data-whatsapp") + "?text=" + encodeURIComponent(texte);
      });
    });
  });

  /* ---------- Impression de la fiche pratique ---------- */
  document.querySelectorAll("[data-imprimer]").forEach(function (b) {
    b.addEventListener("click", function () { window.print(); });
  });

  /* ---------- Outils ---------- */
  // Texte venu de l’extérieur (feuille Google, adresse de la page, saisie) avant insertion dans du HTML, attributs compris
  function echapper(t) {
    return String(t === undefined || t === null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function formule(nom) {
    for (var i = 0; i < C.formules.length; i++) {
      if (C.formules[i].nom === nom || C.formules[i].code === nom) return C.formules[i];
    }
    return null;
  }
  function prixGroupe(f, n) {
    if (!f || n < 1) return 0;
    return f.type === "forfait" ? f.prix + Math.max(0, n - 4) * f.supp : f.prix * n;
  }
  function euros(v) { var d = v % 1 ? 2 : 0; var s = v.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }); return EN ? "€" + s : s + " €"; }
  function kmf(v) { return (Math.round(v * (C.tauxKmf || 491.96775) / 50) * 50).toLocaleString(LOCALE) + " KMF"; }
  function dateLisible(iso) {
    var d = new Date(iso + "T12:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  /* ---------- Dates de sortie : pas de date passée ---------- */
  var aujourdhui = new Date(); aujourdhui.setMinutes(aujourdhui.getMinutes() - aujourdhui.getTimezoneOffset());
  document.querySelectorAll('input[type="date"][name="date_souhaitee"]').forEach(function (el) {
    el.min = aujourdhui.toISOString().slice(0, 10);
  });
  // Fiche participant : la date du jour est proposée (le QR code est scanné au départ)
  document.querySelectorAll('input[type="date"][name="date_sortie"]').forEach(function (el) {
    if (!el.value) el.value = aujourdhui.toISOString().slice(0, 10);
  });
  function lienWhatsApp(texte) {
    // encodeURIComponent laisse passer l’apostrophe : dans un lien écrit entre apostrophes, elle coupait le message
    // (« Jean d'Arc », « l'hôtel »). On l’encode donc aussi.
    return "https://wa.me/" + C.whatsapp + "?text=" + encodeURIComponent(texte).replace(/'/g, "%27");
  }

  /* ---------- Pré-remplissage depuis l’adresse (QR code, boutons) ---------- */
  var params = new URLSearchParams(window.location.search);
  document.querySelectorAll("form[data-form]").forEach(function (form) {
    params.forEach(function (valeur, cle) {
      if (cle === "sortie") cle = "id_sortie"; // anciens QR codes
      var champ = form.elements[cle];
      if (!champ) return;
      if (champ.tagName === "SELECT") {
        Array.prototype.forEach.call(champ.options, function (o) {
          if (o.value === valeur || o.getAttribute("data-code") === valeur) champ.value = o.value;
        });
      } else if (champ.type !== "checkbox" && champ.type !== "radio") {
        champ.value = valeur;
      }
    });
  });

  /* ---------- Champs conditionnels ---------- */
  function conditionnel(selecteur, condition, cible) {
    var sources = document.querySelectorAll(selecteur);
    var bloc = document.querySelector(cible);
    if (!sources.length || !bloc) return;
    var champ = bloc.querySelector("input,textarea,select");
    function valeur() {
      var v = "";
      sources.forEach(function (s) { if (s.type !== "radio" || s.checked) v = s.value; });
      return v;
    }
    function maj() {
      var actif = condition(valeur());
      bloc.classList.toggle("masque", !actif);
      if (champ) champ.required = actif;
    }
    sources.forEach(function (s) { s.addEventListener("change", maj); });
    maj();
  }
  conditionnel("[name=tranche_age]", function (v) { return v === "Moins de 12 ans" || v === "12 à 17 ans"; }, "#bloc-mineur");
  conditionnel("[name=sante]", function (v) { return v === "Oui"; }, "#bloc-sante");
  conditionnel("[name=publication]", function (v) { return v === "Oui"; }, "#bloc-signature");

  /* ---------- Estimation du prix (réservation) ---------- */
  var formResa = document.querySelector("form[data-form=reservation]");
  var majEstimation = function () {};
  if (formResa) {
    var zone = document.getElementById("estimation");
    var selContrib = formResa.elements.contribution;
    majEstimation = function () {
      var f = formule(formResa.elements.formule.value);
      var n = (parseInt(formResa.elements.adultes.value, 10) || 0) + (parseInt(formResa.elements.enfants.value, 10) || 0);
      var optReco = selContrib.querySelector("[data-recommandee]");
      if (f && optReco) {
        optReco.value = String(f.contrib);
        optReco.textContent = f.contrib ? T("Recommandée : " + f.contrib + " € par personne", "Suggested: €" + f.contrib + " per person")
                                        : T("Pas de contribution recommandée", "No suggested contribution");
      }
      var aideAge = document.getElementById("aide-enfants");
      if (aideAge) {
        if (!aideAge.getAttribute("data-defaut")) aideAge.setAttribute("data-defaut", aideAge.textContent);
        var optF = formResa.elements.formule.options[formResa.elements.formule.selectedIndex];
        aideAge.textContent = f && f.age_min
          ? T("Âge minimum pour " + optF.text.split(" (")[0] + " : " + f.age_min + " ans. Pas de tarif réduit.", "Minimum age for " + optF.text.split(" (")[0] + ": " + f.age_min + ". No reduced rate.")
          : f && f.type === "a-partir" ? T("Âge minimum et conditions : l’équipe vous les précise.", "Minimum age and conditions: the team will tell you.")
          : aideAge.getAttribute("data-defaut");
      }
      if (!f || n < 1) { zone.innerHTML = "<p class='est-detail'>" + T("Choisissez une formule et le nombre de participants pour voir une estimation.", "Choose a tour and the number of people to see an estimate.") + "</p>"; formResa.elements.estimation.value = ""; return; }
      // Prix « à partir de » (nouveauté Quad & Buggy) : pas d’estimation ferme ni d’acompte chiffré, l’équipe confirme le prix
      if (f.type === "a-partir") {
        zone.innerHTML =
          "<p class='est-ligne est-total'><span>" + T("Pour " + n + " personne" + (n > 1 ? "s" : "") + ", à partir de", "For " + n + (n > 1 ? " people" : " person") + ", from") + "</span>" +
            "<b>" + euros(f.prix * n) + "</b></p>" +
          "<p class='est-detail'>" + n + " × " + T("à partir de ", "from ") + euros(f.prix) + T(" par personne.", " per person.") + "</p>" +
          "<p class='est-detail est-note'>" + T("Le prix exact et l’acompte vous sont confirmés par l’équipe, avec le parcours et la durée. Aucun paiement maintenant.", "The exact price and the deposit are confirmed by the team, with the route and the duration. No payment now.") + "</p>";
        formResa.elements.estimation.value = "";
        return;
      }
      var base = prixGroupe(f, n);
      var contrib = (parseFloat(selContrib.value) || 0) * n;
      var detail = f.type === "forfait"
        ? T("Forfait ", "Flat rate ") + euros(f.prix) + T(" pour 1 à 4 personnes", " for 1 to 4 people") + (n > 4 ? T(", plus ", ", plus ") + (n - 4) + " × " + euros(f.supp) : "")
        : n + " × " + euros(f.prix);
      var totalEstime = base + contrib;
      var acompte = Math.round(totalEstime * (C.acomptePct || 30)) / 100;
      zone.innerHTML =
        "<p class='est-ligne est-total'><span>" + T("Estimation pour " + n + " personne" + (n > 1 ? "s" : ""), "Estimate for " + n + (n > 1 ? " people" : " person")) + "</span>" +
          "<b>" + euros(totalEstime) + "</b></p>" +
        "<p class='est-detail'>" + kmf(totalEstime) + " · " + detail + (contrib ? T(" ; contribution environnementale ", "; environmental contribution ") + euros(contrib) : "") + ".</p>" +
        "<p class='est-ligne est-acompte'><span>" + T("Acompte de " + (C.acomptePct || 30) + " %, après notre confirmation", (C.acomptePct || 30) + "% deposit, after our confirmation") + "</span>" +
          "<b>" + euros(acompte) + "</b></p>" +
        "<p class='est-detail'>" + T("Aucun paiement maintenant. <a href='paiement.html'>Moyens de paiement</a>", "No payment now. <a href='payment.html'>Payment methods</a>") + "</p>" +
        (f.min_pers && n < f.min_pers ? "<p class='est-detail est-note'>" + T("Cette formule part à partir de " + f.min_pers + " personnes. Envoyez tout de même votre demande : l’équipe vous répond sur les possibilités.", "This tour runs from " + f.min_pers + " people. Send your request anyway: the team will tell you what is possible.") + "</p>" : "");
      formResa.elements.estimation.value = totalEstime;
    };
    ["formule", "adultes", "enfants", "contribution"].forEach(function (n) {
      formResa.elements[n].addEventListener("input", majEstimation);
      formResa.elements[n].addEventListener("change", majEstimation);
    });
    majEstimation();
  }

  /* ---------- Fiche participant (QR code) : groupe, une ligne par personne, sans réseau ---------- */
  // Les fiches qui n’ont pas pu partir (pas de réseau à Mvouni) sont gardées sur le téléphone
  // et renvoyées dès que la connexion revient, sur n’importe quelle page du site.
  var CLE_ATTENTE = "k360-fiches-en-attente";
  function lireAttente() { try { return JSON.parse(localStorage.getItem(CLE_ATTENTE) || "[]"); } catch (e) { return []; } }
  function ecrireAttente(l) { try { if (l.length) localStorage.setItem(CLE_ATTENTE, JSON.stringify(l)); else localStorage.removeItem(CLE_ATTENTE); } catch (e) {} }
  function envoyerLigne(obj) {
    var d = new URLSearchParams();
    Object.keys(obj).forEach(function (k) { d.append(k, obj[k] == null ? "" : obj[k]); });
    return fetch(C.endpoint, { method: "POST", body: d })
      .then(function (r) { return r.json(); })
      .then(function (rep) { if (!rep || !rep.ok) throw new Error("refus"); return rep; });
  }
  // Envoie les lignes une à une ; en cas d’échec, renvoie celles qui restent (jamais de doublon)
  function envoyerSuite(lignes) {
    var reste = lignes.slice();
    return new Promise(function (ok, ko) {
      (function suivant() {
        if (!reste.length) { ok(); return; }
        envoyerLigne(reste[0]).then(function () { reste.shift(); suivant(); }).catch(function () { ko(reste); });
      })();
    });
  }
  function viderAttente() {
    var l = lireAttente();
    if (!l.length || !C.endpoint || navigator.onLine === false) return;
    envoyerSuite(l).then(function () { ecrireAttente([]); }).catch(function (reste) { ecrireAttente(reste); });
  }
  viderAttente();
  window.addEventListener("online", viderAttente);

  var fiche = document.querySelector("form[data-form=enregistrement]");
  if (fiche) {
    // Le lien vers l’autre langue garde le code de sortie éventuel (?id_sortie=…)
    document.querySelectorAll("[data-garder-parametres]").forEach(function (a) { a.href += window.location.search; });

    var zoneAcc = fiche.querySelector("[data-accompagnants]");
    var modele = fiche.querySelector("[data-modele-accompagnant]");
    var nAcc = 0;
    var renumeroter = function () {
      zoneAcc.querySelectorAll("[data-accompagnant]").forEach(function (b, i) { b.querySelector("[data-numero]").textContent = i + 2; });
    };
    fiche.querySelector("[data-ajouter-personne]").addEventListener("click", function () {
      nAcc++;
      var bloc = modele.content.querySelector("[data-accompagnant]").cloneNode(true);
      bloc.setAttribute("data-n", nAcc);
      bloc.querySelectorAll("[id],[name],[for],[aria-describedby]").forEach(function (el) {
        ["id", "name", "for", "aria-describedby"].forEach(function (att) {
          var v = el.getAttribute(att);
          if (v) el.setAttribute(att, v + "_" + nAcc);
        });
      });
      bloc.querySelector("[data-retirer]").addEventListener("click", function () { bloc.remove(); renumeroter(); });
      zoneAcc.appendChild(bloc);
      renumeroter();
      bloc.querySelector("input").focus();
    });

    var val = function (nom) { var el = fiche.elements[nom]; return el ? (el.value || "") : ""; };
    // « Vous montez avec » : la formule n’est demandée qu’aux clients Discovermores ; les autres randonneurs
    // indiquent leur itinéraire et leur durée (QR code affiché au départ du sentier pour tous)
    var client = function () { return val("encadrement") === "Discovermores"; };
    var majEncadrement = function () {
      var e = val("encadrement");
      fiche.querySelectorAll("[data-si-encadrement]").forEach(function (b) {
        var visible = e && (b.getAttribute("data-si-encadrement") === "Discovermores" ? e === "Discovermores" : e !== "Discovermores");
        b.hidden = !visible;
        b.querySelectorAll("select, input[type=radio]").forEach(function (c, i) {
          c.required = visible && (c.tagName === "SELECT" || c === b.querySelector("[name=" + c.name + "]"));
        });
      });
      var g = fiche.querySelector("[data-si-guide]");
      if (g) g.hidden = e !== "Autre guide ou agence";
    };
    fiche.querySelectorAll("[name=encadrement]").forEach(function (r) { r.addEventListener("change", majEncadrement); });
    // Arrivée par le lien d’une formule (?formule=…) : c’est un client Discovermores
    if (fiche.elements.formule.value) { var rd = fiche.querySelector("[name=encadrement][value=Discovermores]"); if (rd) rd.checked = true; }
    majEncadrement();
    // Pays : « United Kingdom », « royaume-uni » ou « Royaume-Uni » sont tous enregistrés « Royaume-Uni »
    var paysFr = function (v) {
      var t = (v || "").trim(), cle = t.toLowerCase();
      var opt = Array.prototype.find.call(fiche.querySelectorAll("#liste-pays option"), function (o) {
        return o.value.toLowerCase() === cle || o.getAttribute("data-fr").toLowerCase() === cle;
      });
      return opt ? opt.getAttribute("data-fr") : t;
    };
    var valAcc = function (bloc, nom) {
      var el = bloc.querySelector('[name="' + nom + "_" + bloc.getAttribute("data-n") + '"]:checked') ||
               bloc.querySelector('[name="' + nom + "_" + bloc.getAttribute("data-n") + '"]:not([type=radio])');
      return el ? el.value : "";
    };
    var mineur = function (age) { return age === "Moins de 12 ans" || age === "12 à 17 ans"; };
    var codeSortie = function () {
      if (val("id_sortie")) return val("id_sortie");
      if (!client()) return val("date_sortie") ? "EXT-" + val("date_sortie") : "";
      var opt = fiche.elements.formule.options[fiche.elements.formule.selectedIndex];
      var code = (opt && opt.getAttribute("data-code") || "").replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase();
      return code && val("date_sortie") ? code + "-" + val("date_sortie") : "";
    };

    var ecranFinal = function (noms, differe) {
      var zone = document.querySelector("[data-fiche-ok]");
      var n = noms.length, code = codeSortie();
      zone.innerHTML =
        "<div class='fiche-ok-icone' aria-hidden='true'>✓</div>" +
        "<h2>" + (differe ? T("Enregistrement gardé sur ce téléphone", "Registration saved on this phone") : T("C’est enregistré !", "You’re registered!")) + "</h2>" +
        "<p class='fiche-ok-nombre'>" + n + " " + (n > 1 ? T("personnes", "people") : T("personne", "person")) + (code ? " · " + T("sortie", "trip") + " <b>" + code + "</b>" : "") + "</p>" +
        "<p class='fiche-ok-noms'>" + noms.join(" · ") + "</p>" +
        "<p>" + (differe
          ? T("Pas de réseau pour l’instant. L’envoi se fera tout seul dès que le téléphone retrouvera une connexion, pendant que cette page est ouverte ou la prochaine fois que vous l’ouvrirez. Montrez cet écran au guide.",
              "No network right now. It will be sent automatically as soon as the phone is back online, while this page is open or the next time you open it. Show this screen to your guide.")
          : (client() ? T("Montrez cet écran à votre guide au point de départ. Bonne ascension !", "Show this screen to your guide at the starting point. Enjoy the climb!")
            : T("Bonne ascension ! Prévenez un proche de votre heure de retour : le réseau est absent par endroits. Aucune sortie en cas d’alerte volcanique.",
                "Enjoy the climb! Tell someone when you expect to be back: there is no network in places. No hiking during a volcanic alert."))) + "</p>" +
        (client() ? "" : "<p><a href='" + (EN ? "prepare.html" : "preparer.html") + "'>" + T("Conseils de sécurité avant de partir", "Safety advice before you go") + "</a></p>") +
        "<button type='button' class='bouton secondaire' data-nouvelle-fiche>" + T("Enregistrer un autre groupe", "Register another group") + "</button>";
      fiche.hidden = true;
      zone.hidden = false;
      zone.querySelector("[data-nouvelle-fiche]").addEventListener("click", function () { window.location.reload(); });
      zone.scrollIntoView({ block: "start" });
      zone.focus();
    };

    fiche.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!fiche.reportValidity()) return;
      if (fiche.elements.site_web && fiche.elements.site_web.value) return; // robot

      var commun = {
        formulaire: "enregistrement", page: window.location.pathname, id_sortie: val("id_sortie"),
        encadrement: val("encadrement"), formule: client() ? val("formule") : "",
        itineraire: client() ? "" : val("itineraire"), duree_prevue: client() ? "" : val("duree_prevue"),
        guide_agence: val("encadrement") === "Autre guide ou agence" ? val("guide_agence") : "",
        date_sortie: val("date_sortie"), venu_avec: val("venu_avec"), premiere_fois: val("premiere_fois"),
        pays: paysFr(val("pays")), ville: val("ville"), profil: val("profil"), telephone: val("telephone"),
        urgence_nom: val("urgence_nom"), urgence_tel: val("urgence_tel"),
        niveau: val("niveau"), motivation: val("motivation"), connu_par: val("connu_par"),
        accord_photo: val("accord_photo"), consentement: fiche.elements.consentement.checked ? "Oui" : "Non"
      };
      var copie = function (extra) { var o = {}; Object.keys(commun).forEach(function (k) { o[k] = commun[k]; }); Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; };
      var lignes = [copie({
        nom: val("nom"), sexe: val("sexe"), tranche_age: val("tranche_age"), responsable_mineur: val("responsable_mineur"),
        nationalite: paysFr(val("nationalite")), sante: val("sante"), sante_detail: val("sante_detail")
      })];
      zoneAcc.querySelectorAll("[data-accompagnant]").forEach(function (b) {
        var age = valAcc(b, "acc_tranche_age");
        lignes.push(copie({
          nom: valAcc(b, "acc_nom"), sexe: valAcc(b, "acc_sexe"), tranche_age: age,
          responsable_mineur: mineur(age) ? val("nom") : "",
          nationalite: paysFr(valAcc(b, "acc_nationalite") || val("nationalite")),
          sante: valAcc(b, "acc_sante"), sante_detail: valAcc(b, "acc_sante_detail")
        }));
      });
      var noms = lignes.map(function (l) { return l.nom; });

      if (!C.endpoint) {
        proposerWhatsApp(fiche, T("<b>Dernière étape :</b> envoyez l’enregistrement à l’équipe sur WhatsApp. Tout est déjà rédigé, il suffit d’appuyer sur Envoyer.",
          "<b>Last step:</b> send the registration to the team on WhatsApp. Everything is already written, just press Send."), "succes");
        return;
      }
      var bouton = fiche.querySelector("[type=submit]");
      bouton.disabled = true;
      bouton.textContent = T("Envoi en cours…", "Sending…");
      var garder = function (reste) { ecrireAttente(lireAttente().concat(reste)); ecranFinal(noms, true); };
      if (navigator.onLine === false) { garder(lignes); return; }
      envoyerSuite(lignes).then(function () { ecranFinal(noms, false); }).catch(garder);
    });
  }

  /* ---------- Fiche « classe ou groupe scolaire » : une fiche pour toute la classe, sans nom d’élève ---------- */
  var choixMode = document.querySelector("[data-choix-mode]");
  var ficheClasse = document.querySelector("form[data-form=groupe]");
  if (choixMode && ficheClasse) {
    choixMode.hidden = false;
    var montrerMode = function (mode) {
      [].forEach.call(choixMode.querySelectorAll("[data-mode]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-mode") === mode ? "true" : "false"); });
      [].forEach.call(document.querySelectorAll("[data-mode-bloc]"), function (f) { f.hidden = f.getAttribute("data-mode-bloc") !== mode; });
    };
    choixMode.addEventListener("click", function (e) { var b = e.target.closest("[data-mode]"); if (b) montrerMode(b.getAttribute("data-mode")); });
    // QR code ou lien propre aux écoles : ?mode=classe ouvre directement la fiche de la classe
    montrerMode(new URLSearchParams(window.location.search).get("mode") === "classe" ? "classe" : "perso");
    // Le guide agence n’est utile que si la classe monte avec un autre guide
    var guideClasse = ficheClasse.querySelector("[name=g_guide_agence]").closest(".champ");
    var majGuide = function () { var v = (ficheClasse.querySelector("[name=g_encadrement]:checked") || {}).value; guideClasse.hidden = v !== "Autre guide ou agence"; };
    ficheClasse.addEventListener("change", majGuide); majGuide();

    ficheClasse.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!ficheClasse.reportValidity()) return;
      if (ficheClasse.elements.site_web && ficheClasse.elements.site_web.value) return; // robot
      // Noms des champs sans le préfixe g_ : ce sont les colonnes de l’onglet Groupes
      var ligne = { formulaire: "groupe", page: window.location.pathname };
      Array.prototype.forEach.call(ficheClasse.elements, function (el) {
        if (!el.name || el.type === "submit" || el.name === "site_web") return;
        if (el.type === "radio" && !el.checked) return;
        ligne[el.name.replace(/^g_/, "")] = el.type === "checkbox" ? (el.checked ? "Oui" : "Non") : el.value;
      });
      var fin = function (hors_ligne) {
        var zone = document.querySelector("[data-fiche-ok]");
        zone.innerHTML = "<h2>" + echapper(ligne.etablissement) + "</h2><p class='intro'>" + (Number(ligne.eleves) + Number(ligne.accompagnateurs)) + T(" personnes · ", " people · ") + echapper(ligne.date_sortie) + "</p><p>" +
          (hors_ligne ? ficheClasse.getAttribute("data-attente") : ficheClasse.getAttribute("data-ok")) + "</p>" +
          "<button type='button' class='bouton secondaire' data-nouvelle-fiche>" + T("Enregistrer un autre groupe", "Register another group") + "</button>";
        ficheClasse.hidden = true; choixMode.hidden = true; zone.hidden = false;
        zone.querySelector("[data-nouvelle-fiche]").addEventListener("click", function () { window.location.reload(); });
        zone.scrollIntoView({ block: "start" }); zone.focus();
      };
      if (!C.endpoint) {
        proposerWhatsApp(ficheClasse, T("<b>Dernière étape :</b> envoyez l’enregistrement de la classe à l’équipe sur WhatsApp. Tout est déjà rédigé.", "<b>Last step:</b> send the class registration to the team on WhatsApp. Everything is already written."), "succes");
        return;
      }
      var bouton = ficheClasse.querySelector("[type=submit]");
      bouton.disabled = true; bouton.textContent = T("Envoi en cours…", "Sending…");
      var garder = function () { ecrireAttente(lireAttente().concat([ligne])); fin(true); };
      if (navigator.onLine === false) { garder(); return; }
      envoyerLigne(ligne).then(function () { fin(false); }).catch(garder);
    });
  }

  /* ---------- Envoi des formulaires ---------- */
  // Délai de réponse annoncé : une seule valeur (config.js, en français), traduite ici pour les pages anglaises
  var DELAI_EN = String(C.delaiReponse || "24 heures").replace(/heures?/, "hours").replace(/jours?/, "days");
  var textesSucces = {
    reservation: T("Votre demande est envoyée. L’équipe Discovermores vous répond sur WhatsApp sous " + C.delaiReponse + " pour confirmer la date, la météo et les modalités.", "Your request has been sent. The Discovermores team will reply on WhatsApp within " + DELAI_EN + " to confirm the date, the weather and the details."),
    enregistrement: T("Votre enregistrement est reçu. Présentez-vous au guide au point de départ. Bonne ascension !", "Your registration has been received. Meet your guide at the starting point. Enjoy the climb!"),
    retour: T("Merci. Votre retour aide à améliorer les sorties et à suivre l’état du volcan.", "Thank you. Your feedback helps improve the trips and keep track of the state of the volcano."),
    contact: T("Votre message est envoyé. Nous vous répondons sous " + C.delaiReponse + ".", "Your message has been sent. We will reply within " + DELAI_EN + ".")
  };

  function resume(form) {
    var lignes = [form.getAttribute("data-titre") || "Demande Karthala360"];
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === "hidden" || el.closest(".pot-de-miel") || el.type === "submit") return;
      if ((el.type === "checkbox" || el.type === "radio") && !el.checked) return;
      if (el.type === "checkbox") return;
      if (!el.value) return;
      var libelle = el.getAttribute("data-libelle") || el.name;
      var valeur = el.tagName === "SELECT" ? el.options[el.selectedIndex].text : (el.type === "date" ? dateLisible(el.value) : el.value);
      lignes.push(libelle + T(" : ", ": ") + valeur);
    });
    if (form.elements.estimation && form.elements.estimation.value) lignes.push(T("Estimation affichée : ", "Estimate shown: ") + euros(+form.elements.estimation.value));
    return lignes.join("\n");
  }

  function afficher(form, type, html) {
    var zoneMsg = form.querySelector(".message-formulaire");
    zoneMsg.className = "message-formulaire visible " + type;
    zoneMsg.innerHTML = html;
    zoneMsg.setAttribute("tabindex", "-1");
    zoneMsg.focus();
  }

  function proposerWhatsApp(form, intro, type) {
    var lien = lienWhatsApp(resume(form));
    afficher(form, type || "erreur",
      "<p>" + intro + "</p><a class='bouton whatsapp' href='" + lien + "' target='_blank' rel='noopener' data-envoi-whatsapp>" + T("Envoyer par WhatsApp", "Send on WhatsApp") + "</a>");
    // Réservation : une fois le message WhatsApp ouvert, on affiche la page de confirmation
    if (form.getAttribute("data-form") === "reservation") {
      form.querySelector("[data-envoi-whatsapp]").addEventListener("click", function () {
        var cible = "confirmation.html?" + paramsConfirmation(form, "").toString();
        setTimeout(function () { window.location.href = cible; }, 600);
      });
    }
  }

  // Récapitulatif transmis à la page de confirmation
  function paramsConfirmation(form, id) {
    var e = form.elements, p = new URLSearchParams();
    if (id) p.set("id", id);
    // Nom affiché dans la liste (dans la langue de la page), sans le détail du prix
    var opt = e.formule.options[e.formule.selectedIndex];
    p.set("formule", opt ? opt.text.split(" (")[0] : e.formule.value);
    p.set("date", e.date_souhaitee.value);
    p.set("n", (parseInt(e.adultes.value, 10) || 0) + (parseInt(e.enfants.value, 10) || 0));
    if (e.estimation.value) p.set("total", e.estimation.value);
    return p;
  }

  document.querySelectorAll("form[data-form]:not([data-form=enregistrement]):not([data-form=groupe])").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      if (form.elements.site_web && form.elements.site_web.value) return; // robot
      var type = form.getAttribute("data-form");
      var bouton = form.querySelector("[type=submit]");

      if (!C.endpoint) {
        proposerWhatsApp(form, T("<b>Dernière étape :</b> envoyez votre " + (type === "reservation" ? "demande" : "message") +
          " à l’équipe sur WhatsApp. Tout est déjà rédigé, il suffit d’appuyer sur Envoyer. Réponse sous " + C.delaiReponse + ".",
          "<b>Last step:</b> send your " + (type === "reservation" ? "request" : "message") + " to the team on WhatsApp. Everything is already written, just press Send. Reply within " + DELAI_EN + "."), "succes");
        return;
      }

      var donnees = new URLSearchParams();
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || el.type === "submit") return;
        if (el.type === "checkbox") { donnees.append(el.name, el.checked ? "Oui" : "Non"); return; }
        if (el.type === "radio" && !el.checked) return;
        donnees.append(el.name, el.value);
      });
      donnees.append("formulaire", type);
      donnees.append("page", window.location.pathname);

      bouton.disabled = true;
      var texteBouton = bouton.textContent;
      bouton.textContent = T("Envoi en cours…", "Sending…");

      // Requête « simple » (formulaire encodé) : la réponse du script Google est lisible, on sait si l'envoi a réussi.
      fetch(C.endpoint, { method: "POST", body: donnees })
        .then(function (r) { return r.json(); })
        .then(function (rep) {
          if (!rep || !rep.ok) { throw new Error((rep && rep.erreur) || "refus"); }
          if (type === "reservation") {
            window.location.href = "confirmation.html?" + paramsConfirmation(form, rep.id || "").toString();
            return;
          }
          afficher(form, "succes", "<p>" + textesSucces[type] + "</p>");
          form.reset();
        })
        .catch(function () {
          proposerWhatsApp(form, T("L’envoi n’a pas abouti (connexion ou serveur). Rien n’est perdu : envoyez ces informations par WhatsApp, elles sont déjà rédigées.", "Sending failed (connection or server). Nothing is lost: send this information on WhatsApp, it is already written."));
        })
        .then(function () { bouton.disabled = false; bouton.textContent = texteBouton; });
    });
  });

  /* ---------- Compteur public des ascensions (accueil, Espace Data) ---------- */
  // Tant qu’aucune sortie n’est enregistrée, le texte d’attente reste affiché à la place des chiffres.
  if (document.querySelector("[data-stats-zone]")) {
    var etatStats = function (ok) {
      document.querySelectorAll("[data-si-donnees]").forEach(function (e) { e.hidden = !ok; });
      document.querySelectorAll("[data-si-vide]").forEach(function (e) { e.hidden = ok; });
    };
    etatStats(false);
    if (C.endpoint) {
      fetch(C.endpoint + "?action=stats")
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.ok || !d.stats || !(d.stats.sorties || d.stats.randonneurs || d.stats.derniere_date)) return;
          var s = d.stats;
          document.querySelectorAll("[data-stat]").forEach(function (el) {
            var cle = el.getAttribute("data-stat"), v = s[cle];
            if (v === undefined || v === null || v === "") return;
            // Les années s’affichent sans séparateur de milliers
            el.textContent = typeof v === "number" && cle !== "annee" && cle !== "depuis" ? v.toLocaleString(LOCALE) : v;
          });
          document.querySelectorAll("[data-jauge]").forEach(function (el) {
            el.style.width = Math.min(100, Math.round((s.fonds_action || 0) / (C.seuilAction || 500) * 100)) + "%";
          });
          etatStats(true);
        })
        .catch(function () {});
    }
  }

  /* ---------- Avis validés (onglet Retours), dans les emplacements prévus ---------- */
  var zonesAvis = document.querySelectorAll("[data-avis-zone]");
  if (zonesAvis.length && C.endpoint) {
    var NOMS_F = EN ? { "zero-effort": "Zero Effort", "soft-trek": "Soft Trek", "bivouac": "Volcano Bivouac", "sportif": "Full Climb" }
                    : { "zero-effort": "Zéro Effort", "soft-trek": "Soft Trek", "bivouac": "Bivouac au volcan", "sportif": "Karthala Sportif" };
    var MOIS_A = EN ? ["January","February","March","April","May","June","July","August","September","October","November","December"]
                    : ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
    var carteAvis = function (a, compacte) {
      var m = String(a.mois || "").split("-");
      var date = m.length === 2 ? MOIS_A[+m[1] - 1] + " " + m[0] : "";
      var note = Math.min(5, Math.max(1, Math.round(Number(a.note)) || 5));
      return "<figure class='avis" + (compacte ? " avis-compact" : "") + "'><div class='etoiles' role='img' aria-label='" + note + T(" sur 5", " out of 5") + "'>" +
        "★★★★★".slice(0, note) + "☆☆☆☆☆".slice(0, 5 - note) + "</div><blockquote>" + echapper(a.texte) + "</blockquote><figcaption><b>" +
        echapper(a.auteur) + "</b>" + (a.pays ? ", " + echapper(a.pays) : "") + " · " + echapper(NOMS_F[a.formule] || a.formule) + (date ? " · " + date : "") + "</figcaption></figure>";
    };
    fetch(C.endpoint + "?action=avis")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.avis || !d.avis.length) return;
        zonesAvis.forEach(function (zone) {
          var type = zone.getAttribute("data-avis-zone"), max = +zone.getAttribute("data-max") || 3;
          var lst = d.avis.filter(function (a) { return type !== "formule" || a.formule === zone.getAttribute("data-formule"); }).slice(0, max);
          if (!lst.length) return;
          // Les vrais avis remplacent les exemples de l’aperçu
          zone.querySelector("[data-avis-liste]").innerHTML = lst.map(function (a) { return carteAvis(a, type !== "accueil"); }).join("");
          zone.hidden = false;
        });
      })
      .catch(function () {});
  }

  /* ---------- Diaporama de l’en-tête de l’accueil ---------- */
  // Fondu lent entre 5 photos. Désactivé si l’utilisateur limite les animations ou si la connexion est lente
  // (la première photo reste affichée). Chaque photo n’est téléchargée qu’au moment de s’afficher.
  var diapo = document.querySelector("[data-diaporama]");
  var connexion = navigator.connection || {};
  var lent = connexion.saveData || /(^|-)2g$/.test(connexion.effectiveType || "");
  var sansAnimation = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (diapo && !lent && !sansAnimation) {
    var vues = diapo.querySelectorAll("span");
    var courante = 0;
    var charger = function (el, suite) {
      if (el.style.backgroundImage) { suite(); return; }
      var src = window.innerWidth <= 800 ? el.getAttribute("data-diapo-mobile") : el.getAttribute("data-diapo");
      var img = new Image();
      img.onload = function () { el.style.backgroundImage = "url('" + src + "')"; suite(); };
      img.onerror = function () {};
      img.src = src;
    };
    var suivante = function () {
      if (document.hidden) return;
      var prochaine = (courante + 1) % vues.length;
      charger(vues[prochaine], function () {
        vues[courante].classList.remove("actif");
        vues[prochaine].classList.add("actif");
        courante = prochaine;
      });
    };
    setInterval(suivante, 7000);
  }

  /* ---------- K269, l’assistant de Karthala 360 (recherche v1 + IA v2, en conversation) ---------- */
  // v1 : recherche locale dans les pages du site (assets/data/connaissance-xx.json, construit par gen_connaissance.py).
  // On montre le passage exact et sa page. Sans réponse fiable, on le dit. Fonctionne sans réseau une fois l’index chargé.
  // v2 (si K360.ia et le script Google sont branchés) : l’IA rédige une réponse courte À PARTIR DE CES SEULS PASSAGES,
  // avec leurs numéros. Si l’IA ne répond pas, est lente ou n’est pas activée, la réponse v1 reste affichée.
  var zoneAsk = document.querySelector("[data-ask]");
  if (zoneAsk) {
    var formAsk = zoneAsk.querySelector("[data-ask-form]");
    var champAsk = zoneAsk.querySelector("#q");
    var sortieAsk = zoneAsk.querySelector("[data-ask-resultats]");
    var suggAsk = zoneAsk.querySelector("[data-ask-suggestions]");
    var VIDES = (EN
      ? "a an the of to in on at for and or is are was be can i we you my our it its how what which when where who why do does did much many there with from by about this that these those should would could get live lives living found exist exists"
      : "le la les l un une des de du d et ou a au aux en dans sur pour par avec est sont ce c cet cette ces qu que qui quoi quel quelle quels quelles quand comment combien je j on nous vous il elle ils elles se s y ne n pas plus mon ma mes votre vos notre nos peut peux faut t doit dois est-ce ai as vit vivent vivre habite habitent trouve trouvent existe existent").split(" ");
    var GROUPES = EN ? [
      ["altitude", "high", "height", "tall", "metres", "meters", "summit", "highest"],
      ["walk", "walking", "hike", "hiking", "trek", "foot"],
      ["least", "easy", "easiest", "effort", "short", "shortest", "zero"],
      ["price", "prices", "cost", "costs", "pay", "euro", "euros", "expensive", "deposit"],
      ["season", "month", "months", "weather", "rain", "climate", "best", "period"],
      ["bring", "equipment", "gear", "pack", "clothes", "shoes", "wear", "backpack"],
      ["bird", "birds", "wildlife", "animal", "animals", "species", "owl", "white-eye"],
      ["plant", "plants", "flora", "tree", "trees", "forest", "medicinal", "herbs"],
      ["sleep", "bivouac", "night", "camp", "tent", "overnight"],
      ["car", "4x4", "vehicle", "drive", "track", "road"],
      ["child", "children", "kids", "family", "age", "old"],
      ["crater", "caldera", "chahale"],
      ["danger", "dangerous", "safe", "safety", "risk", "eruption", "alert"],
      ["eruption", "eruptions", "lava", "erupt", "erupted"],
      ["payment", "transfer", "paypal", "mvola", "wakati", "card"],
      ["book", "booking", "reserve", "reservation", "date", "available", "availability"],
      ["guide", "guides", "team"],
      ["legend", "legends", "story", "stories", "history", "djinn", "solomon"],
      ["duration", "long", "hours", "hour", "minutes", "time", "take", "takes", "walking"],
      ["water", "drink", "drinking", "bottle", "food", "meal", "meals", "eat", "lunch"],
      ["pregnant", "pregnancy"],
      ["quad", "quads", "buggy", "buggies", "atv"],
      ["group", "groups", "company", "school", "people"]
    ] : [
      ["altitude", "haut", "hauteur", "culminant", "metres", "sommet", "point"],
      ["marche", "marcher", "pied", "randonnee", "rando", "trek"],
      ["moins", "facile", "effort", "court", "zero", "peu"],
      ["prix", "tarif", "tarifs", "cout", "coute", "payer", "euros", "cher", "acompte"],
      ["periode", "saison", "mois", "meteo", "pluie", "climat", "meilleur", "meilleure"],
      ["emporter", "equipement", "sac", "prendre", "vetement", "vetements", "chaussures", "affaires", "prevoir"],
      ["oiseau", "oiseaux", "faune", "animal", "animaux", "espece", "especes", "zosterops", "observer"],
      ["plante", "plantes", "flore", "arbre", "arbres", "foret", "medicinales", "medicinale", "soigner"],
      ["dormir", "bivouac", "nuit", "camp", "tente", "camper", "dort"],
      ["voiture", "4x4", "vehicule", "piste", "route"],
      ["enfant", "enfants", "famille", "age", "ans"],
      ["cratere", "caldeira", "chahale"],
      ["danger", "dangereux", "securite", "risque", "eruption", "alerte"],
      ["eruption", "eruptions", "lave", "coulee"],
      ["paiement", "virement", "paypal", "mvola", "wakati", "carte"],
      ["reserver", "reservation", "date", "disponible", "disponibilite"],
      ["guide", "guides", "equipe"],
      ["legende", "legendes", "conte", "histoire", "recit", "djinns", "salomon"],
      ["eau", "boire", "potable", "gourde", "repas", "manger", "nourriture", "dejeuner"],
      ["enceinte", "grossesse"],
      ["quad", "quads", "buggy", "buggys", "moto"],
      ["groupe", "groupes", "entreprise", "ecole", "association", "personnes"],
      ["duree", "temps", "heures", "heure", "longtemps", "minutes"]
    ];
    var norm = function (t) {
      return String(t || "").toLowerCase().replace(/×/g, "x").normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[’'`]/g, " ")
        // « peut-on », « est-ce », « dort-on » : le pronom collé ne doit pas former un mot rare
        .replace(/-(t-)?(on|il|elle|ils|elles|ce|je|tu|nous|vous)\b/g, " ")
        .replace(/[^a-z0-9-]+/g, " ").trim();
    };
    // Racine : 5 premières lettres (« marcher » = « marche »), sauf quelques faux amis du domaine
    var FAUX_AMIS = { equipe: "eqpe", equipes: "eqpe", observatoire: "obsvt", observatory: "obsvt", team: "eqpe" };
    var cle = function (w) { return FAUX_AMIS[w] || (w.length >= 5 ? w.slice(0, 5) : w); };
    // Mots trop généraux : ils ne suffisent pas à dire qu’une question est couverte (« président des Comores »)
    var GENERIQUES = ["karth", "comor", "volca", "mont", "mount", "ngazi", "grand", "monte", "monto", "ascen", "climb", "gravi"];
    var mots = function (t) { return norm(t).split(/\s+/).filter(function (w) { return w.length >= 2 && VIDES.indexOf(w) < 0; }); };
    var synonymes = {};
    GROUPES.forEach(function (g) { g.forEach(function (w) { var k = cle(w); synonymes[k] = (synonymes[k] || []).concat(g.map(cle)); }); });

    var index = null, df = {}, longueurMoy = 1;
    var chargerIndex = function () {
      if (index) return Promise.resolve(index);
      var fichier = fetch("../".repeat(EN ? 1 : 0) + "assets/data/connaissance-" + (EN ? "en" : "fr") + ".json", { cache: "no-cache" })  // revalide : réponses à jour après chaque mise en ligne (304 si inchangé)
        .then(function (r) { return r.json(); });
      // Ce que K269 a appris : réponses écrites et validées par l’équipe dans la feuille Google (onglet Questions).
      // Si le script ne répond pas en 4 secondes, K269 répond quand même avec les pages du site.
      var appris = !C.endpoint ? Promise.resolve([]) : Promise.race([
        fetch(C.endpoint + "?action=savoirs&langue=" + (EN ? "en" : "fr")).then(function (r) { return r.json(); })
          .then(function (r) { return (r && r.ok && r.savoirs) || []; }),
        new Promise(function (ok) { setTimeout(function () { ok([]); }, 4000); })
      ]).catch(function () { return []; });
      return Promise.all([fichier, appris])
        .then(function (res) {
          var data = res[1].concat(res[0]);
          var total = 0;
          data.forEach(function (p) {
            p.kh = mots(p.h).map(cle); p.kt = mots(p.t).map(cle); p.kx = mots(p.x).map(cle);
            total += p.kx.length;
            var vus = {};
            p.kh.concat(p.kt, p.kx).forEach(function (k) { if (!vus[k]) { vus[k] = 1; df[k] = (df[k] || 0) + 1; } });
          });
          longueurMoy = total / Math.max(1, data.length);
          index = data;
          return data;
        });
    };
    var compte = function (liste, k) { var n = 0; for (var i = 0; i < liste.length; i++) if (liste[i] === k) n++; return n; };

    var chercher = function (question) {
      var q = mots(question).map(cle).filter(function (k, i, a) { return a.indexOf(k) === i; });
      if (!q.length) return { q: q, res: [] };
      var N = index.length;
      // Question faite uniquement de mots généraux (« Karthala ») : seuil plus bas, la réponse « en bref » ressort
      var seuil = q.every(function (k) { return GENERIQUES.indexOf(k) >= 0; }) ? 0.3 : 2.2;
      var aDesSpecifiques = q.some(function (k) { return GENERIQUES.indexOf(k) < 0; });
      var res = index.map(function (p) {
        var score = 0, couverts = 0, specifiques = 0, couvertsSpec = 0;
        q.forEach(function (k) {
          var variantes = [[k, 1]].concat((synonymes[k] || []).filter(function (s) { return s !== k; }).map(function (s) { return [s, 0.45]; }));
          var meilleur = 0;
          variantes.forEach(function (v) {
            var idf = Math.log(1 + (N - (df[v[0]] || 0) + 0.5) / ((df[v[0]] || 0) + 0.5));
            var tfx = compte(p.kx, v[0]);
            var bm25 = tfx ? tfx * 2.2 / (tfx + 1.2 * (0.25 + 0.75 * p.kx.length / longueurMoy)) : 0;
            var s = v[1] * idf * (3 * Math.min(1, compte(p.kh, v[0])) + 1.5 * Math.min(1, compte(p.kt, v[0])) + bm25);
            if (s > meilleur) meilleur = s;
          });
          var generique = GENERIQUES.indexOf(k) >= 0;
          if (!generique) specifiques++;
          if (meilleur > 0) { couverts++; if (!generique) couvertsSpec++; }
          // Un mot général (« monter », « Karthala ») aide à trouver, mais ne doit pas décider du classement
          score += generique && aDesSpecifiques ? meilleur * 0.25 : meilleur;
        });
        var couverture = specifiques ? couvertsSpec / specifiques : couverts / q.length;
        // Réponses rapides (écrites à partir des données du site) devant ; pages juridiques derrière
        var poids = p.f ? 1.6 : (/^(cgv|confidentialite|mentions-legales|terms|privacy|legal-notice)\.html/.test(p.u) ? 0.6 : 1);
        // Question faite seulement de mots généraux (« Karthala ») : la présentation « en bref » passe devant
        if (!aDesSpecifiques && /en bref|in brief|at a glance/i.test(p.h)) poids *= 2;
        return { p: p, score: poids * score * (0.35 + 0.65 * couverture * couverture), couverture: couverture };
      }).filter(function (r) { return r.score > seuil && r.couverture >= (q.length < 2 ? 0.01 : 0.5); })
        .sort(function (a, b) { return b.score - a.score; });
      // Contexte de l’IA : 6 meilleurs passages, 3 au plus par page
      var parPageCtx = {}, ctx = [];
      res.forEach(function (r) {
        var page = r.p.u.split("#")[0];
        if (ctx.length < 6 && (parPageCtx[page] || 0) < 3 && r.score >= res[0].score * 0.25) { parPageCtx[page] = (parPageCtx[page] || 0) + 1; ctx.push(r); }
      });
      // Au plus 2 passages par page, 3 au total, pour varier les sources
      var parPage = {}, choisis = [];
      res.forEach(function (r) {
        var page = r.p.u.split("#")[0];
        if (choisis.length < 3 && (parPage[page] || 0) < 2 && (!choisis.length || r.score >= choisis[0].score * 0.35)) {
          parPage[page] = (parPage[page] || 0) + 1; choisis.push(r);
        }
      });
      return { q: q, res: choisis, ctx: ctx };
    };

    var extrait = function (texte, q) {
      // Découpage en phrases sans « lookbehind » (non compris par les anciens Safari, qui bloquerait tout le script)
      var phrases = (texte.match(/[^.!?:;]+[.!?:;]*/g) || [texte]).map(function (x) { return x.trim(); }).filter(Boolean);
      var meilleure = 0, idx = 0;
      phrases.forEach(function (ph, i) {
        var ks = mots(ph).map(cle), n = 0;
        q.forEach(function (k) { if (ks.indexOf(k) >= 0 || (synonymes[k] || []).some(function (s) { return ks.indexOf(s) >= 0; })) n++; });
        if (n > meilleure) { meilleure = n; idx = i; }
      });
      var t = phrases[idx] + (phrases[idx].length < 120 && phrases[idx + 1] ? " " + phrases[idx + 1] : "");
      if (t.length > 320) t = t.slice(0, 317).replace(/\s+\S*$/, "") + "…";
      var cles = {};
      q.forEach(function (k) { cles[k] = 1; (synonymes[k] || []).forEach(function (s) { cles[s] = 1; }); });
      return echapper(t).replace(/[A-Za-zÀ-ÿ0-9×-]+/g, function (w) {
        var n = norm(w); return n && cles[cle(n)] && VIDES.indexOf(n) < 0 && n.length > 2 ? "<mark>" + w + "</mark>" : w;
      });
    };

    var INTENTION_CHOIX = ["formu", "choisir", "choix", "convi", "niveau", "facil", "moins", "sport", "enfan", "famil", "4x4", "march", "effor", "dormi", "nuit", "bivou", "tour", "tours", "least", "easy", "child", "famil", "sleep", "night", "walk", "which"];
    var INTENTION_PRIX = ["prix", "tarif", "cout", "coute", "payer", "reser", "date", "dispo", "price", "cost", "book", "pay", "avail"];
    // Réponses rapides proposées par K269 après sa réponse (aller plus loin : quiz, formules, réservation)
    var passerelles = function (q) {
      var choix = q.some(function (k) { return INTENTION_CHOIX.indexOf(k) >= 0; });
      var prix = q.some(function (k) { return INTENTION_PRIX.indexOf(k) >= 0; });
      var liens = [];
      if (choix) liens.push("<a class='k269-puce' href='" + (EN ? "tours.html#find-my-tour" : "formules.html#trouver-ma-formule") + "' data-ask-funnel='quiz'>" + T("Trouver ma formule en 3 questions", "Find my tour in 3 questions") + "</a>");
      if (choix || prix) liens.push("<a class='k269-puce' href='" + (EN ? "tours.html" : "formules.html") + "' data-ask-funnel='formules'>" + T("Voir les 4 formules et leurs prix", "See the 4 tours and prices") + "</a>");
      if (prix) liens.push("<a class='k269-puce' href='" + (EN ? "book.html" : "reservation.html") + "' data-ask-funnel='reservation'>" + T("Demander une date", "Request a date") + "</a>");
      return liens;
    };

    var journaliser = function (question, n, ia, type) {
      mesurer(n ? "ask_karthala_query" : "ask_karthala_no_answer", { resultats: n, ia: ia ? 1 : 0 });
      if (!C.endpoint) return;
      var d = new URLSearchParams();
      d.append("formulaire", "question"); d.append("question", question.slice(0, 200));
      d.append("langue", EN ? "en" : "fr"); d.append("resultats", n); d.append("ia", ia ? "Oui" : "Non");
      d.append("type_reponse", type || (n ? "pages du site" : "aucune")); d.append("page", window.location.pathname);
      fetch(C.endpoint, { method: "POST", body: d }).catch(function () {});
    };

    // IA (si branchée) : réponse rédigée à partir des passages trouvés (références seulement : le script relit le texte)
    var iaActive = !!(C.ia && C.endpoint && window.fetch);
    var precedente = "";
    var demanderIA = function (question, ctx, mode) {
      var d = new URLSearchParams();
      d.append("action", "demander"); d.append("mode", mode || "site"); d.append("question", question.slice(0, 300)); d.append("langue", EN ? "en" : "fr");
      d.append("refs", JSON.stringify(ctx.map(function (x) { return { u: x.p.u, h: x.p.h }; })));
      if (precedente && precedente !== question) d.append("precedente", precedente.slice(0, 300));
      var delai = new Promise(function (_, rejeter) { setTimeout(function () { rejeter(new Error("delai")); }, 20000); });
      return Promise.race([fetch(C.endpoint, { method: "POST", body: d }).then(function (r) { return r.json(); }), delai]);
    };

    /* ----- K269 : la conversation ----- */
    var fil = sortieAsk;
    var statutK = zoneAsk.querySelector("[data-k269-statut]");
    if (statutK) statutK.textContent = iaActive ? T("Assistant IA · Karthala et Comores · apprend avec l’équipe", "AI assistant · Karthala and the Comoros · learns with the team")
                                                : T("Répond à partir des pages de Karthala 360", "Answers from the Karthala 360 pages");
    // Défile jusqu’à la dernière question : on voit la question et le début de la réponse, même longue
    var derniere = null;
    var bas = function () { fil.scrollTop = derniere ? Math.max(0, derniere.offsetTop - 12) : fil.scrollHeight; };
    // L’avatar (randonneur en SVG) est repris de l’en-tête de la conversation : une seule source, dans ask.py
    var AVATAR = (zoneAsk.querySelector(".k269-tete .k269-avatar") || { outerHTML: "" }).outerHTML;
    var bulle = function (qui, html) {
      var d = document.createElement("div");
      d.className = "k269-msg " + qui;
      d.innerHTML = (qui === "k269" ? AVATAR : "") + "<div class='k269-bulle'><span class='sr-only'>" + (qui === "k269" ? "K269 : " : T("Vous : ", "You: ")) + "</span>" + html + "</div>";
      fil.appendChild(d); if (qui === "vous") derniere = d; bas();
      return d.querySelector(".k269-bulle");
    };
    var puces = function (liste) {
      if (!liste.length) return;
      var d = document.createElement("div"); d.className = "k269-puces"; d.innerHTML = liste.join(""); fil.appendChild(d); bas();
    };
    var CLE_FIL = "k269-conversation";
    var sauverFil = function () {
      try {
        var enfants = [].slice.call(fil.children), debut = enfants.findIndex(function (e) { return e.classList.contains("vous"); });
        if (debut < 0) return;
        var m = enfants.slice(debut).filter(function (e) { return !e.querySelector(".k269-ecrit"); }).slice(-16).map(function (e) { return e.outerHTML; });
        sessionStorage.setItem(CLE_FIL, JSON.stringify({ l: EN ? "en" : "fr", p: precedente, m: m }));
      } catch (e) {}
    };
    (function restaurerFil() {
      try {
        var sv = JSON.parse(sessionStorage.getItem(CLE_FIL) || "null");
        if (!sv || sv.l !== (EN ? "en" : "fr") || !sv.m || !sv.m.length) return;
        fil.insertAdjacentHTML("beforeend", sv.m.join(""));
        precedente = sv.p || "";
        if (suggAsk) suggAsk.hidden = true;
      } catch (e) {}
    })();
    var ECRIT = "<span class='k269-ecrit' role='status'><i></i><i></i><i></i><span class='sr-only'>" + T("K269 écrit…", "K269 is typing…") + "</span></span>";
    var SR = function (qui) { return "<span class='sr-only'>" + qui + "</span>"; };
    // Passages du site (sans IA, ou en repli) : la source, l’extrait, le lien
    var passagesHTML = function (r) {
      return "<p>" + T("Voici ce que disent les pages de Karthala 360 :", "Here is what the Karthala 360 pages say:") + "</p>" +
        r.res.map(function (x) {
          return "<a class='k269-source' href='" + echapper(x.p.u) + "' data-ask-resultat><small>" + echapper(x.p.t) + " · " + echapper(x.p.h) + "</small><span>" + (x.p.f && x.p.x.length <= 420 ? echapper(x.p.x) : extrait(x.p.x, r.q)) + "</span></a>";
        }).join("");
    };
    // Réponse de l’IA : texte échappé, [n] devient un lien vers la page du passage n, puis les sources
    var reponseIA = function (texte, ctx) {
      var html = echapper(texte).replace(/\n+/g, " ").replace(/\[(\d)\]/g, function (m, n) {
        var x = ctx[Number(n) - 1];
        return x ? "<a class='k269-ref' href='" + echapper(x.p.u) + "' title='" + echapper(x.p.t + " · " + x.p.h) + "' data-ask-resultat>" + n + "</a>" : "";
      });
      var sources = ctx.map(function (x, i) { return "<li><a href='" + echapper(x.p.u) + "' data-ask-resultat>" + (i + 1) + ". " + echapper(x.p.t) + " · " + echapper(x.p.h) + "</a></li>"; }).join("");
      return "<p>" + html + "</p><details class='k269-sources'><summary>" + T("Sources", "Sources") + " (" + ctx.length + ")</summary><ol>" + sources + "</ol></details>";
    };

    var reponseGenerale = function (texte) {
      return "<p class='k269-etiquette'>" + T("Réponse générale sur les Comores · non vérifiée par Discovermores", "General answer about the Comoros · not verified by Discovermores") + "</p>" +
        "<p>" + echapper(texte).replace(/\n+/g, " ") + "</p>";
    };
    var aucuneReponse = function (question, suite, horsSujet) {
      ecrire_courant(horsSujet
        ? "<p>" + T("Je réponds aux questions sur le Karthala, l’ascension et les Comores. Pour le reste, je ne suis pas la bonne source.", "I answer questions about Mount Karthala, the climb and the Comoros. For anything else, I’m not the right source.") + "</p>"
        : "<p>" + T("Je ne trouve pas encore cette information dans Karthala 360, et je préfère ne rien inventer.", "I can’t find this information in Karthala 360 yet, and I’d rather not make anything up.") + "</p><p>" +
          T("Votre question est transmise à l’équipe : dès qu’elle y aura répondu, je la connaîtrai. Vous pouvez aussi lui écrire sur WhatsApp.", "Your question is passed on to the team: once they have answered it, I will know it. You can also write to them on WhatsApp.") + "</p>");
      puces(["<a class='k269-puce whatsapp' href='" + lienWhatsApp(T("Bonjour Discovermores, j’ai une question : ", "Hello Discovermores, I have a question: ") + question) + "' rel='noopener' data-ask-funnel='whatsapp'>" + T("Demander à l’équipe", "Ask the team") + "</a>"].concat(suite));
    };
    var ecrire_courant = function () {};

    var repondre = function (question) {
      question = String(question || "").trim();
      if (!question) return;
      champAsk.value = "";
      if (suggAsk) suggAsk.hidden = true;
      // Sur la page K269 seulement : l’adresse garde la question (lien partageable). Jamais dans la bulle des autres pages.
      if (zoneAsk.hasAttribute("data-ask-page")) { try { history.replaceState(null, "", "?q=" + encodeURIComponent(question)); } catch (e) {} }
      bulle("vous", echapper(question));
      var k = bulle("k269", ECRIT);
      var ecrire = function (html) { k.innerHTML = SR("K269 : ") + html; bas(); setTimeout(sauverFil, 0); };
      ecrire_courant = ecrire;
      chargerIndex().then(function () {
        var r = chercher(question);
        // Question de suivi (« et pour les enfants ? ») : on la relit avec la question précédente,
        // seulement si elle commence comme une suite, pour ne pas répondre à côté d’une nouvelle question
        var suiteQ = /^\s*(et|pour|aussi|mais|and|what about|how about|also|for)\b/i.test(question);
        if (!r.res.length && precedente && suiteQ && mots(question).length <= 4) {
          var r2 = chercher(precedente + " " + question);
          if (r2.res.length) r = r2;
        }
        precedente = question;
        var suite = passerelles(r.q);
        if (!r.res.length) {
          // Rien sur le site ni dans ce que l’équipe m’a appris : avec l’IA, réponse générale sur les Comores, signalée comme telle
          if (!iaActive) { journaliser(question, 0, false, "aucune"); aucuneReponse(question, suite); return; }
          demanderIA(question, [], "general").then(function (rep) {
            if (rep && rep.ok && rep.reponse) { journaliser(question, 0, true, "générale"); ecrire(reponseGenerale(rep.reponse)); puces(suite); }
            else { journaliser(question, 0, false, "aucune"); aucuneReponse(question, suite, rep && rep.raison === "hors_sujet"); }
          }).catch(function () { journaliser(question, 0, false, "aucune"); aucuneReponse(question, suite); });
          return;
        }
        if (!iaActive) {
          journaliser(question, r.res.length, false);
          ecrire(passagesHTML(r)); puces(suite);
          return;
        }
        demanderIA(question, r.ctx).then(function (rep) {
          var ok = rep && rep.ok && rep.reponse;
          journaliser(question, r.res.length, !!ok);
          ecrire(ok ? reponseIA(rep.reponse, r.ctx) : passagesHTML(r)); puces(suite);
        }).catch(function () { journaliser(question, r.res.length, false); ecrire(passagesHTML(r)); puces(suite); });
      }).catch(function () {
        ecrire("<p>" + T("Je n’arrive pas à charger mes informations (connexion). Consultez les <a href='preparer.html'>questions fréquentes</a>.", "I can’t load my information (connection). See the <a href='prepare.html'>frequent questions</a>.") + "</p>");
      });
    };

    formAsk.addEventListener("submit", function (e) { e.preventDefault(); repondre(champAsk.value); });
    zoneAsk.addEventListener("click", function (e) {
      var s = e.target.closest("[data-ask-suggestion]");
      if (s) { e.preventDefault(); repondre(s.textContent); return; }
      var r = e.target.closest("[data-ask-resultat]");
      if (r) mesurer("ask_karthala_result_click", { page: r.getAttribute("href").split("#")[0] });
      var f = e.target.closest("[data-ask-funnel]");
      if (f) mesurer("ask_karthala_funnel_click", { cible: f.getAttribute("data-ask-funnel") });
    });
    var qInitiale = zoneAsk.hasAttribute("data-ask-page") && new URLSearchParams(window.location.search).get("q");
    if (qInitiale) repondre(qInitiale);
  }

  /* ---------- Bulle K269 : le bouton en bas de l’écran ouvre la conversation sans quitter la page ---------- */
  var flottant = document.querySelector("[data-k269-flottant]");
  if (flottant) {
    var panneauK = flottant.querySelector(".k269-panneau"), lanceurK = flottant.querySelector("[data-k269-ouvrir]");
    var ouvrirK = function (ouvert) {
      panneauK.hidden = !ouvert;
      lanceurK.setAttribute("aria-expanded", ouvert ? "true" : "false");
      flottant.classList.toggle("ouvert", ouvert);
      document.documentElement.classList.toggle("k269-ouvert", ouvert);
      if (ouvert) { panneauK.querySelector("input").focus(); mesurer("k269_bulle_ouverte", { page: window.location.pathname }); }
      else lanceurK.focus();
    };
    lanceurK.addEventListener("click", function () { ouvrirK(panneauK.hidden); });
    flottant.querySelector("[data-k269-fermer]").addEventListener("click", function () { ouvrirK(false); });
    panneauK.addEventListener("keydown", function (e) { if (e.key === "Escape") ouvrirK(false); });
  }

  /* ---------- L’ascension, carte en main : le point avance avec la lecture, ou avec le curseur sur le profil ---------- */
  // Sans JavaScript, la carte montre tout le chemin et toutes les étapes restent lisibles.
  var asc = document.querySelector("[data-ascension]");
  if (asc) {
    var D = JSON.parse(document.getElementById("asc-donnees").textContent);
    var ENa = asc.getAttribute("data-lang") === "en";
    var pointA = asc.querySelector(".asc-point"), haloA = asc.querySelector(".asc-halo");
    var lAlt = asc.querySelector("[data-asc-alt]"), lKm = asc.querySelector("[data-asc-km]");
    var profilA = asc.querySelector("[data-asc-profil]"), svgProfil = profilA.querySelector("svg"), curseurA = asc.querySelector(".asc-curseur");
    var etapesA = [].slice.call(asc.querySelectorAll(".asc-etape"));
    var repsA = [].slice.call(asc.querySelectorAll(".asc-rep"));
    var interpA = function (tab, km, ik, cles) {
      for (var i = 1; i < tab.length; i++) if (km <= tab[i][ik]) {
        var a = tab[i - 1], b = tab[i], t = (km - a[ik]) / ((b[ik] - a[ik]) || 1);
        return cles.map(function (k) { return a[k] + (b[k] - a[k]) * t; });
      }
      var z = tab[tab.length - 1]; return cles.map(function (k) { return z[k]; });
    };
    var nbA = function (n) { return ENa ? n.toLocaleString("en-US") : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "); };
    var placerA = function (km) {
      km = Math.max(0, Math.min(D.total, km));
      var xy = interpA(D.p, km, 2, [0, 1]);
      pointA.setAttribute("cx", xy[0]); pointA.setAttribute("cy", xy[1]); haloA.setAttribute("cx", xy[0]); haloA.setAttribute("cy", xy[1]);
      var alt = Math.round(interpA(D.alt, km, 0, [1])[0] / 10) * 10, kmT = km.toFixed(1).replace(".", ENa ? "." : ",") + " km";
      lAlt.textContent = nbA(alt) + " m"; lKm.textContent = kmT;
      var x = (D.x0 + (D.x1 - D.x0) * km / D.total) * 1000;
      curseurA.setAttribute("x1", x); curseurA.setAttribute("x2", x);
      repsA.forEach(function (g) { g.classList.toggle("actif", +g.getAttribute("data-km") <= km + 0.05); });
      profilA.setAttribute("aria-valuenow", km.toFixed(1)); profilA.setAttribute("aria-valuetext", kmT + ", " + nbA(alt) + " m");
    };
    asc.classList.add("anime");
    var aLaMain = false, kmClavier = 0;
    // 1. Défilement : entre deux étapes, le point avance au prorata de la lecture
    var suivreLecture = function () {
      var milieu = window.innerHeight * 0.55, km = 0, active = etapesA[0];
      for (var i = 0; i < etapesA.length; i++) {
        var r = etapesA[i].getBoundingClientRect(), c = r.top + Math.min(r.height, window.innerHeight) / 3;
        if (c <= milieu) {
          active = etapesA[i]; km = +etapesA[i].getAttribute("data-km");
          var s = etapesA[i + 1];
          if (s) { var rs = s.getBoundingClientRect(), cs = rs.top + Math.min(rs.height, window.innerHeight) / 3;
            km += (+s.getAttribute("data-km") - km) * Math.min(1, Math.max(0, (milieu - c) / Math.max(1, cs - c))); }
        }
      }
      etapesA.forEach(function (e) { e.classList.toggle("active", e === active); });
      if (!aLaMain) placerA(km);
    };
    var ticA = false;
    window.addEventListener("scroll", function () { if (!ticA) { ticA = true; requestAnimationFrame(function () { ticA = false; suivreLecture(); }); } }, { passive: true });
    window.addEventListener("resize", suivreLecture);
    suivreLecture();
    // 2. Curseur ou doigt sur le profil : le point suit ; en le quittant, il revient à la lecture
    var kmDepuis = function (e) {
      var r = svgProfil.getBoundingClientRect(), f = (e.clientX - r.left) / r.width;
      return (f - D.x0) / (D.x1 - D.x0) * D.total;
    };
    var suivre = function (e) { aLaMain = true; placerA(kmDepuis(e)); };
    profilA.addEventListener("pointermove", suivre);
    profilA.addEventListener("pointerdown", suivre);
    ["pointerleave", "pointercancel"].forEach(function (t) { profilA.addEventListener(t, function () { aLaMain = false; suivreLecture(); }); });
    // 3. Clavier : flèches (±0,5 km), Début, Fin
    profilA.addEventListener("keydown", function (e) {
      var pas = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 }[e.key];
      if (!aLaMain) kmClavier = +profilA.getAttribute("aria-valuenow") || 0;
      if (pas !== undefined) kmClavier += pas; else if (e.key === "Home") kmClavier = 0; else if (e.key === "End") kmClavier = D.total; else return;
      e.preventDefault(); aLaMain = true; kmClavier = Math.max(0, Math.min(D.total, kmClavier)); placerA(kmClavier);
    });
    profilA.addEventListener("blur", function () { aLaMain = false; suivreLecture(); });
    // 4. Trajet d’une formule : part en 4×4 (pointillés) et part à pied
    var outilsA = asc.querySelector(".asc-outils");
    var choisirMode = function (mode) {
      [].forEach.call(outilsA.querySelectorAll("[data-mode]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-mode") === mode ? "true" : "false"); });
      // SVG : pas de propriété .hidden, on passe par l’attribut
      [].forEach.call(asc.querySelectorAll("[data-trace]"), function (g) { if (g.getAttribute("data-trace") === mode) g.removeAttribute("hidden"); else g.setAttribute("hidden", ""); });
    };
    outilsA.addEventListener("click", function (e) { var b = e.target.closest("[data-mode]"); if (b) choisirMode(b.getAttribute("data-mode")); });
    var modeUrl = new URLSearchParams(window.location.search).get("trajet");
    if (modeUrl && asc.querySelector('[data-trace="' + modeUrl.replace(/[^a-z]/g, "") + '"]')) choisirMode(modeUrl.replace(/[^a-z]/g, ""));
  }

  /* ---------- Mode jour / mode nuit ---------- */
  // Le mode est posé avant l’affichage par un petit script dans <head> (choix mémorisé, sinon réglage de l’appareil).
  // Le bouton de l’en-tête bascule et mémorise le choix ; sans choix, le site suit l’appareil s’il change de mode.
  var boutonsTheme = document.querySelectorAll("[data-theme-bascule]");
  var majBoutonsTheme = function () {
    var nuit = document.documentElement.getAttribute("data-theme") === "nuit";
    [].forEach.call(boutonsTheme, function (b) {
      var libelle = nuit ? b.getAttribute("data-jour") : b.getAttribute("data-nuit");
      b.setAttribute("aria-pressed", nuit ? "true" : "false"); b.setAttribute("aria-label", libelle); b.title = libelle;
    });
  };
  [].forEach.call(boutonsTheme, function (b) {
    b.addEventListener("click", function () {
      var t = document.documentElement.getAttribute("data-theme") === "nuit" ? "jour" : "nuit";
      document.documentElement.setAttribute("data-theme", t);
      try { localStorage.setItem("k360-theme", t); } catch (e) {}
      majBoutonsTheme();
      mesurer("mode_" + t, {});
    });
  });
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var suivre = function (e) {
      var choix = null; try { choix = localStorage.getItem("k360-theme"); } catch (x) {}
      if (choix) return;
      document.documentElement.setAttribute("data-theme", e.matches ? "nuit" : "jour"); majBoutonsTheme();
    };
    if (mq.addEventListener) mq.addEventListener("change", suivre); else if (mq.addListener) mq.addListener(suivre);
  }
  majBoutonsTheme();

  /* ---------- Activités à la une et agenda ---------- */
  // 1. Les événements passés disparaissent d’eux-mêmes (date de fin < aujourd’hui).
  // 2. Si le script Google est branché, la liste vient de l’onglet « Evenements » : l’équipe publie sans toucher au code.
  var zonesEvt = document.querySelectorAll("[data-evenements]");
  if (zonesEvt.length) {
    var jourIso = new Date(); jourIso.setMinutes(jourIso.getMinutes() - jourIso.getTimezoneOffset());
    jourIso = jourIso.toISOString().slice(0, 10);
    var MOIS_L = EN ? ["January","February","March","April","May","June","July","August","September","October","November","December"]
                    : ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
    var MOIS_C = EN ? ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
                    : ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
    var JOURS_L = EN ? ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
                     : ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
    var dateTexte = function (iso) { var d = new Date(iso + "T12:00:00"); return JOURS_L[d.getDay()] + " " + d.getDate() + " " + MOIS_L[d.getMonth()] + " " + d.getFullYear(); };
    var carteEvt = function (e, grande) {
      var L = EN ? "en" : "fr";
      var quand = dateTexte(e.debut) + (e.fin && e.fin !== e.debut ? T(" au ", " to ") + dateTexte(e.fin) : "") + (e.heure && e.heure[L] ? ", " + e.heure[L] : "");
      var lien = /^https?:\/\//.test(e.lien || "") ? e.lien : lienWhatsApp(T("Bonjour Discovermores, je souhaite participer à : ", "Hello Discovermores, I would like to take part in: ") + e.titre[L] + " (" + quand + ").");
      var d = new Date(e.debut + "T12:00:00");
      var visuel = /^(https?:\/\/|\/uploads\/)/.test(e.image || "") ? "<img src='" + echapper(e.image) + "' alt='" + echapper(e.titre[L]) + "' loading='lazy'>"
        : "<div class='evt-date' aria-hidden='true'><b>" + d.getDate() + "</b><span>" + MOIS_C[d.getMonth()] + "</span></div>";
      return "<article class='evt" + (grande ? " evt-grande" : "") + "' data-evt-fin='" + echapper(e.fin || e.debut) + "'>" +
        "<div class='evt-visuel'>" + visuel + "</div><div class='evt-corps'><div class='evt-badges'>" +
        (e.type === "partenaire" ? "<span class='evt-badge partenaire'>" + T("Partenaire", "Partner") + "</span>" : "") + "</div>" +
        "<h3>" + echapper(e.titre[L]) + "</h3><p class='evt-quand'><b>" + echapper(e.lieu[L]) + "</b> · <time datetime='" + echapper(e.debut) + "'>" + echapper(quand) + "</time></p>" +
        "<p>" + echapper(e.description[L]) + "</p>" + (e.organisateur ? "<p class='evt-orga'>" + T("Organisé par ", "Organised by ") + echapper(e.organisateur) + "</p>" : "") +
        "<a class='bouton" + (grande ? "" : " secondaire") + "' href='" + echapper(lien) + "' rel='noopener' data-mesure='event_click'>" + T("Je veux venir", "I want to come") + "</a></div></article>";
    };
    // Carte flottante de l’accueil : visible dès l’arrivée, fermée par ×, et ne revient pas pour la même activité
    var flottante = document.querySelector("[data-une-flottante]");
    var CLE_UNE = "k360-une-fermee";
    var dejaFermee = function (id) { try { return localStorage.getItem(CLE_UNE) === id; } catch (e) { return false; } };
    var montrerFlottante = function () {
      if (!flottante) return;
      var id = flottante.getAttribute("data-evt-id");
      if (flottante.getAttribute("data-evt-fin") < jourIso || dejaFermee(id)) { flottante.hidden = true; return; }
      flottante.hidden = false;
      requestAnimationFrame(function () { flottante.classList.add("visible"); });
    };
    if (flottante) {
      flottante.querySelector("[data-une-fermer]").addEventListener("click", function () {
        try { localStorage.setItem(CLE_UNE, flottante.getAttribute("data-evt-id")); } catch (e) {}
        flottante.classList.remove("visible");
        setTimeout(function () { flottante.hidden = true; }, 250);
      });
    }
    var majFlottante = function (e) {
      if (!flottante || !e) return;
      var L = EN ? "en" : "fr";
      var quand = dateTexte(e.debut) + (e.fin && e.fin !== e.debut ? T(" au ", " to ") + dateTexte(e.fin) : "") + (e.heure && e.heure[L] ? ", " + e.heure[L] : "");
      flottante.setAttribute("data-evt-id", e.id || "");
      flottante.setAttribute("data-evt-fin", e.fin || e.debut);
      flottante.querySelector("[data-une-titre]").textContent = e.titre[L];
      flottante.querySelector("[data-une-quand]").innerHTML = "<b>" + echapper(e.lieu[L]) + "</b> · " + echapper(quand);
      flottante.querySelector("[data-une-desc]").textContent = e.description[L];
      flottante.querySelector("[data-une-lien]").href = /^https?:\/\//.test(e.lien || "") ? e.lien
        : lienWhatsApp(T("Bonjour Discovermores, je souhaite participer à : ", "Hello Discovermores, I would like to take part in: ") + e.titre[L] + " (" + quand + ").");
      // Colonne image à gauche : seulement si l’activité a une image
      var ancienne = flottante.querySelector(".une-image");
      if (ancienne) ancienne.remove();
      var avecImage = /^(https?:\/\/|\/uploads\/)/.test(e.image || "");
      flottante.classList.toggle("avec-image", avecImage);
      if (avecImage) {
        var image = document.createElement("img");
        image.className = "une-image";
        image.src = e.image;
        image.alt = "";
        flottante.insertBefore(image, flottante.firstChild);
      }
      var badge = flottante.querySelector(".evt-badge");
      if (badge) badge.remove();
      if (e.type === "partenaire") flottante.querySelector(".une-surtitre").insertAdjacentHTML("beforeend", " <span class='evt-badge partenaire'>" + T("Partenaire", "Partner") + "</span>");
    };

    var rangerEvt = function () {
      zonesEvt.forEach(function (zone) {
        zone.querySelectorAll("[data-evt-fin]").forEach(function (c) { if (c.getAttribute("data-evt-fin") < jourIso) c.remove(); });
        var liste = zone.querySelector("[data-evts]");
        var reste = liste ? liste.querySelectorAll(".evt").length : 0;
        var vide = zone.querySelector("[data-evts-vide]");
        if (vide) vide.hidden = reste > 0;
        if (zone.getAttribute("data-evenements") === "une" && !reste) zone.hidden = true;
      });
    };
    rangerEvt();
    // Petit délai : la carte arrive après l’en-tête, sans masquer le titre au premier coup d’œil
    setTimeout(montrerFlottante, 1200);
    if (C.endpoint) {
      fetch(C.endpoint + "?action=evenements")
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.ok || !d.evenements || !d.evenements.length) return;
          var premiere = d.evenements.filter(function (e) { return e.a_la_une; })[0];
          if (premiere) { majFlottante(premiere); montrerFlottante(); }
          zonesEvt.forEach(function (zone) {
            var liste = zone.querySelector("[data-evts]");
            if (!liste) return;
            var evts = d.evenements;
            if (zone.getAttribute("data-evenements") === "une") evts = evts.filter(function (e) { return e.a_la_une; }).slice(0, 3);
            if (!evts.length) return;
            liste.innerHTML = evts.map(function (e, i) { return carteEvt(e, i === 0); }).join("");
            zone.hidden = false;
          });
          rangerEvt();
        })
        .catch(function () {});
    }
  }
  // Clic sur « Je veux venir » (Plausible, si la mesure d’audience est active)
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("[data-mesure=event_click]");
    if (a && window.plausible) window.plausible("event_click", { props: { page: window.location.pathname } });
  });

  /* ---------- Contact : sujet choisi depuis un lien (?sujet=Data Pro) ---------- */
  var champSujet = document.querySelector('select[name="sujet"]');
  var sujetDemande = new URLSearchParams(window.location.search).get("sujet");
  if (champSujet && sujetDemande) {
    Array.prototype.forEach.call(champSujet.options, function (o) {
      if (o.value === sujetDemande || o.text === sujetDemande) champSujet.value = o.value;
    });
  }

  /* ---------- Page de confirmation : récapitulatif de la demande ---------- */
  var recap = document.querySelector("[data-recap]");
  if (recap) {
    var q = new URLSearchParams(window.location.search);
    var valeurs = {
      id: q.get("id"),
      formule: q.get("formule"),
      date: q.get("date") ? dateLisible(q.get("date")) : "",
      n: q.get("n") ? q.get("n") + T(" personne" + (+q.get("n") > 1 ? "s" : ""), +q.get("n") > 1 ? " people" : " person") : "",
      total: q.get("total") ? euros(+q.get("total")) + " (" + kmf(+q.get("total")) + ")" : "",
      acompte: q.get("total") ? euros(Math.round(+q.get("total") * (C.acomptePct || 30)) / 100) : ""
    };
    var rempli = false;
    Object.keys(valeurs).forEach(function (cle) {
      var bloc = recap.querySelector('[data-champ="' + cle + '"]');
      if (!bloc) return;
      if (valeurs[cle]) { bloc.querySelector("dd").textContent = valeurs[cle]; bloc.hidden = false; rempli = true; }
      else { bloc.hidden = true; }
    });
    recap.hidden = !rempli;
    // De la confirmation à la page Paiement, le montant suit : le client n’a pas à le retrouver
    if (rempli) document.querySelectorAll("[data-suite-recap]").forEach(function (a) { a.href = a.getAttribute("href").split("?")[0] + window.location.search; });
  }

  /* ---------- « Quelle formule pour moi ? » ----------
     Une formule n’est proposée que si le plus jeune enfant a l’âge minimum (âges lus dans data.py, transmis par la page).
     Ordre : deux jours et en forme -> Bivouac ; randonneur entraîné, une journée -> Sportif ;
     peu habitué à marcher, ou enfant trop jeune pour le Soft Trek -> Zéro Effort ; sinon -> Soft Trek. */
  document.querySelectorAll("[data-quiz]").forEach(function (quiz) {
    var formules = JSON.parse(quiz.querySelector("[data-quiz-formules]").textContent);
    var zone = quiz.querySelector("[data-quiz-resultat]");
    quiz.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var e = quiz.elements, forme = e.forme.value, temps = e.temps.value;
      var age = e.enfants.value === "non" ? 99 : Number(e.enfants.value);        // âge du plus jeune
      var ouverte = function (c) { return formules[c].age <= age; };
      var ageDe = function (c) { return formules[c].age; };
      var code, pourquoi;
      if (temps === "deux" && forme !== "peu" && ouverte("bivouac")) {
        code = "bivouac"; pourquoi = T("Vous avez le temps et la forme pour en profiter pleinement.", "You have the time and the fitness to make the most of it.");
      } else if (forme === "entraine" && temps !== "deux" && ouverte("sportif")) {
        code = "sportif"; pourquoi = T("Vous avez le niveau pour l’ascension intégrale à pied.", "You are fit enough for the full climb on foot.");
      } else if (!ouverte("soft-trek")) {
        code = "zero-effort"; pourquoi = T("C’est la seule formule ouverte dès " + ageDe("zero-effort") + " ans.", "It is the only tour open from age " + ageDe("zero-effort") + ".");
      } else if (forme === "peu") {
        code = "zero-effort";
        pourquoi = temps === "deux"
          ? T("Le bivouac demande une bonne forme. Avec Zéro Effort, le 4×4 fait l’essentiel : 25 minutes de marche seulement.", "The bivouac requires good fitness. With Zero Effort, the 4×4 does most of the work: only 25 minutes’ walking.")
          : T("Le 4×4 fait l’essentiel : 25 minutes de marche seulement.", "The 4×4 does most of the work: only 25 minutes’ walking.");
      } else {
        code = "soft-trek";
        if (temps === "deux") pourquoi = T("Le bivouac est ouvert dès " + ageDe("bivouac") + " ans : en une journée, le Soft Trek offre le meilleur équilibre.", "The bivouac is open from age " + ageDe("bivouac") + ": in one day, the Soft Trek offers the best balance.");
        else if (forme === "entraine") pourquoi = T("L’ascension intégrale est ouverte dès " + ageDe("sportif") + " ans : avec vos enfants, le Soft Trek est la vraie randonnée du Karthala.", "The full climb is open from age " + ageDe("sportif") + ": with your children, the Soft Trek is the real Karthala hike.");
        else pourquoi = T("Une vraie randonnée de 2 heures, accessible dès " + ageDe("soft-trek") + " ans.", "A real two-hour hike, open from age " + ageDe("soft-trek") + ".");
      }
      var f = formules[code];
      zone.innerHTML = "<p class='surtitre'>" + T("Notre conseil", "Our suggestion") + "</p><h3>" + f.nom + "</h3><p><b>" + f.promesse + "</b> " + pourquoi + "</p>" +
        "<div class='boutons'><a class='bouton' href='" + f.resa + "'>" + T("Réserver cette formule", "Book this tour") + "</a>" +
        "<a class='bouton secondaire' href='" + f.fiche + "'>" + T("Voir le détail", "See the details") + "</a></div>";
      zone.hidden = false;
      zone.setAttribute("tabindex", "-1"); zone.focus();
      mesurer("quiz_formule", { formule: code });
    });
  });

  /* ---------- Galerie : la photo s’ouvre en grand sans quitter la page ----------
     Sans script (ou sans <dialog>), le lien ouvre simplement la grande image. Flèches du clavier, Échap pour fermer. */
  var liensGalerie = [].slice.call(document.querySelectorAll("[data-galerie] a"));
  if (liensGalerie.length && window.HTMLDialogElement) {
    var vis = document.createElement("dialog");
    vis.className = "visionneuse";
    vis.setAttribute("aria-label", T("Photo agrandie", "Enlarged photo"));
    vis.innerHTML = "<button type='button' class='vis-fermer' aria-label='" + T("Fermer", "Close") + "'>×</button>" +
      "<button type='button' class='vis-fleche vis-prec' aria-label='" + T("Photo précédente", "Previous photo") + "'>‹</button>" +
      "<figure><img alt=''><figcaption></figcaption></figure>" +
      "<button type='button' class='vis-fleche vis-suiv' aria-label='" + T("Photo suivante", "Next photo") + "'>›</button>";
    document.body.appendChild(vis);
    var visImg = vis.querySelector("img"), visLegende = vis.querySelector("figcaption"), visCourante = 0;
    var visMontrer = function (i) {
      visCourante = (i + liensGalerie.length) % liensGalerie.length;
      var a = liensGalerie[visCourante], legende = a.getAttribute("data-legende") || "";
      visImg.src = a.getAttribute("href"); visImg.alt = legende;
      visLegende.textContent = legende + " · " + (visCourante + 1) + " / " + liensGalerie.length;
    };
    liensGalerie.forEach(function (a, i) {
      a.addEventListener("click", function (ev) { ev.preventDefault(); visMontrer(i); vis.showModal(); mesurer("galerie_photo", { photo: i + 1 }); });
    });
    vis.querySelector(".vis-fermer").addEventListener("click", function () { vis.close(); });
    vis.querySelector(".vis-prec").addEventListener("click", function () { visMontrer(visCourante - 1); });
    vis.querySelector(".vis-suiv").addEventListener("click", function () { visMontrer(visCourante + 1); });
    vis.addEventListener("click", function (ev) { if (ev.target === vis) vis.close(); });     // clic sur le fond
    vis.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowRight") visMontrer(visCourante + 1);
      else if (ev.key === "ArrowLeft") visMontrer(visCourante - 1);
    });
    vis.addEventListener("close", function () { liensGalerie[visCourante].focus(); });
  }

  /* ---------- Onglets des tracés : flèches gauche / droite au clavier ---------- */
  document.querySelectorAll('[role="tablist"]').forEach(function (liste) {
    liste.addEventListener("keydown", function (ev) {
      if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
      var onglets = Array.prototype.slice.call(liste.querySelectorAll('[role="tab"]'));
      var i = onglets.indexOf(document.activeElement);
      if (i < 0) return;
      var suivant = onglets[(i + (ev.key === "ArrowRight" ? 1 : onglets.length - 1)) % onglets.length];
      suivant.focus(); suivant.click(); ev.preventDefault();
    });
  });

  /* ---------- Mesure du parcours (sans cookie) ----------
     Actif seulement si Plausible est chargé (SITE["analytics"] dans src/data.py).
     Événements : clic_reserver, clic_whatsapp, clic_telephone, clic_email, voir_paiement,
     commande_boutique, achat_gpx, envoi_formulaire. La propriété "source" indique la page. */
  function mesurer(nom, props) {
    if (typeof window.plausible === "function") {
      props = props || {};
      props.source = location.pathname.replace(/^\//, "") || "index.html";
      window.plausible(nom, { props: props });
    }
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a[href]");
    if (!a) return;
    var h = a.getAttribute("href");
    var zone = a.closest(".barre-mobile") ? "barre-mobile" : a.closest(".heros") ? "en-tete" : a.closest(".carte") ? "carte" : a.closest(".nav") ? "menu" : "page";
    if (/^(reservation|book)\.html/.test(h)) mesurer("clic_reserver", { zone: zone, formule: (h.split("formule=")[1] || "") });
    else if (/wa\.me/.test(h)) {
      var txt = decodeURIComponent(h.split("text=")[1] || "");
      if (/Tracé GPS|GPS track/i.test(txt)) mesurer("achat_gpx", { zone: zone });
      else if (a.closest(".produit")) mesurer("commande_boutique", { article: (a.closest(".produit").id || "") });
      mesurer("clic_whatsapp", { zone: zone });
    }
    else if (/^tel:/.test(h)) mesurer("clic_telephone", { zone: zone });
    else if (/^mailto:/.test(h)) mesurer("clic_email", { zone: zone });
    else if (/^(paiement|payment)\.html/.test(h)) mesurer("voir_paiement", { zone: zone });
  });
  document.querySelectorAll("form[data-form]").forEach(function (form) {
    form.addEventListener("submit", function () {
      if (form.checkValidity()) mesurer("envoi_formulaire", { formulaire: form.getAttribute("data-form"), formule: form.elements.formule ? form.elements.formule.value : "" });
    });
  });

  var annee = document.querySelector("[data-annee]");
  if (annee) annee.textContent = new Date().getFullYear();
})();
