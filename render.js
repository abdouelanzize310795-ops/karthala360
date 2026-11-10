// Applique les réglages du back office aux pages du site au moment de les servir :
// coordonnées (WhatsApp, e-mail), champs « À COMPLÉTER », boutique, partenaires, photos, alerte volcanique.
// Les fichiers du site ne sont jamais modifiés.
const fs = require('fs');
const path = require('path');

const WHATSAPP_ORIGINE = '2693565803';
const EMAIL_ORIGINE = 'contact@discovermores.com';
// Adresse prévue à l'origine, écrite dans les pages (liens canoniques, FR/EN, partage, plan du site, QR code)
const DOMAINE_ORIGINE = 'karthala360.discovermores.com';
const INSTAGRAM_ORIGINE = 'https://www.instagram.com/discovermores/';
const FACEBOOK_ORIGINE = 'https://www.facebook.com/discovermores/';
const QRCode = require('qrcode');
// Version des fichiers du panier : change à chaque démarrage, pour que les navigateurs prennent la dernière
const VERSION = Date.now().toString(36);
// Essai d'un style sans changer le réglage : ?style=clarte ou ?style=original, retenu pendant la visite
const STYLE_ESSAI = `(function(){try{var p=new URLSearchParams(location.search).get("style");if(p==="clarte"||p==="original")sessionStorage.setItem("k360-style",p);var s=sessionStorage.getItem("k360-style");var c=document.documentElement.classList;if(s==="clarte")c.add("clarte");else if(s==="original")c.remove("clarte");}catch(e){}})();`;
// Navigation fluide : fondu entre les pages + préchargement des pages du site au survol (sans exécuter leur code).
// Les adresses avec paramètres (?q=… de K269, ?formule=…) ne sont pas préchargées.
const FLUIDE = `<link rel="stylesheet" href="/assets/css/fluide.css?v=${VERSION}">`;
const PRECHARGEMENT = '<script type="speculationrules">' + JSON.stringify({
  prefetch: [{ where: { and: [{ href_matches: '/*' }, { not: { href_matches: '/*\\?*' } }, { not: { href_matches: '/*#*' } }, { not: { href_matches: '/api/*' } }] }, eagerness: 'moderate' }],
}) + '</script>';

// Champs « À COMPLÉTER » : [fichier, texte exact] → réglage
const A_COMPLETER = [
  ['paiement.html', 'titulaire, banque, IBAN et code BIC', 'paiement_virement'],
  ['paiement.html', 'adresse PayPal ou lien PayPal.me', 'paiement_paypal'],
  ['paiement.html', 'numéro MVola et nom du compte', 'paiement_mvola'],
  ['paiement.html', 'numéro Wakati et nom du compte', 'paiement_wakati'],
  ['en/payment.html', 'account holder, bank, IBAN and BIC', 'paiement_virement'],
  ['en/payment.html', 'PayPal address or PayPal.me link', 'paiement_paypal'],
  ['en/payment.html', 'MVola number and account name', 'paiement_mvola'],
  ['en/payment.html', 'Wakati number and account name', 'paiement_wakati'],
  ['agenda.html', 'tarif', 'tarif_agenda_evenement'],
  ['agenda.html', 'tarif par semaine', 'tarif_agenda_semaine'],
  ['en/events.html', 'price', 'tarif_agenda_evenement'],
  ['en/events.html', 'price per week', 'tarif_agenda_semaine'],
  ['observatoire.html', 'tarif', 'tarif_datapro_rapport'],
  ['observatoire.html', 'tarif annuel', 'tarif_datapro_abonnement'],
  ['en/gps-tracks.html', 'price', 'tarif_datapro_rapport'],
  ['en/gps-tracks.html', 'annual price', 'tarif_datapro_abonnement'],
  ['cgv.html', 'numéro de contrat Amana Assurances', 'assurance_contrat'],
  ['en/terms.html', 'Amana Assurances policy number', 'assurance_contrat'],
];

const ALERTES = {
  jaune: { fond: '#E0A63A', texte: '#2B1D00', fr: 'Alerte jaune (vigilance) sur le Karthala', en: 'Yellow alert (vigilance) on Karthala' },
  orange: { fond: '#E58A2E', texte: '#2B1400', fr: 'Alerte orange sur le Karthala : ascensions suspendues', en: 'Orange alert on Karthala: climbs suspended' },
  rouge: { fond: '#C9362B', texte: '#FFFFFF', fr: 'Alerte rouge sur le Karthala : ascensions interdites', en: 'Red alert on Karthala: climbs forbidden' },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euros = (n) => `${Number(n).toLocaleString('fr-FR')} €`;

function creer(SITE, db) {
  const cache = new Map(); // fichiers sources lus une fois

  function source(rel) {
    if (!cache.has(rel)) cache.set(rel, fs.readFileSync(path.join(SITE, rel), 'utf8'));
    return cache.get(rel);
  }

  // Adresses complètes : le site est servi à la racine de l'adresse réglée (base = https://domaine)
  // Une seule passe : l'adresse réglée peut contenir le domaine d'origine sans être remplacée deux fois
  const RE_DOMAINE = new RegExp(`(https://)?${DOMAINE_ORIGINE.replace(/\./g, '\\.')}(/)?`, 'g');
  function adresses(texte, base) {
    const hote = base.replace(/^https?:\/\//, '');
    return texte.replace(RE_DOMAINE, (m, https, barre) => {
      if (https) return `${base}/`; // avec ou sans « / » final : la page d'accueil du site
      return barre ? `${hote}/` : hote; // adresse affichée en texte (page QR code)
    });
  }

  // Adresses sans « .html » : formules.html → formules, index.html → ./, en/index.html → en/
  const nettoie = (chemin) => (chemin === 'index' ? './' : chemin.endsWith('/index') ? chemin.slice(0, -5) : chemin);
  // Chemin interne entre guillemets (attributs, chaînes JS, JSON). Les adresses d'autres sites (https:, mailto:…) ne sont pas touchées.
  const RE_INTERNE = /(["'])(?![a-z][a-z0-9+.-]*:|\/\/)([a-z0-9._/-]*?)\.html(?=[?#"'])/gi;
  function sansHtml(texte, base) {
    texte = texte.replace(RE_INTERNE, (m, q, chemin) => q + nettoie(chemin));
    if (base) {
      // Adresses complètes du site (liens Google, partage, plan du site, JSON-LD)
      const re = new RegExp(base.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '(/[^"\'<>\\s?#]*?)\\.html', 'g');
      texte = texte.replace(re, (m, chemin) => base + nettoie(chemin));
      // Même adresse écrite en texte, sans https:// (ex. page QR code)
      const hote = base.replace(/^https?:\/\//, '');
      const reTexte = new RegExp('(^|[^/\\w.-])(' + hote.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + ')(/[^"\'<>\\s?#]*?)\\.html', 'g');
      texte = texte.replace(reTexte, (m, avant, h, chemin) => avant + h + nettoie(chemin));
    }
    return texte;
  }

  function reseaux(html, s) {
    if (s.lien_instagram) html = html.split(INSTAGRAM_ORIGINE).join(esc(s.lien_instagram));
    if (s.lien_facebook) html = html.split(FACEBOOK_ORIGINE).join(esc(s.lien_facebook));
    return html;
  }

  // QR code d'enregistrement, généré pour l'adresse réglée (les QR imprimés suivent le domaine)
  const qrCache = new Map();
  const lienEnregistrement = (base) => `${base}/enregistrement`;
  async function preparerQR(base) {
    const url = lienEnregistrement(base);
    if (!qrCache.has(url)) {
      const svg = await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0d120eff', light: '#ffffffff' } });
      qrCache.set(url, svg.replace('<svg ', '<svg width="312" height="312" class="segno" role="img" aria-label="QR code : ' + esc(url) + '" '));
    }
    return qrCache.get(url);
  }
  function qr(html, base) {
    const svg = qrCache.get(lienEnregistrement(base));
    return svg ? html.replace(/<svg[^>]*class="segno"[^>]*>[\s\S]*?<\/svg>/, svg) : html;
  }

  function coordonnees(html, s) {
    const wa = String(s.whatsapp || '').replace(/\D/g, '');
    if (wa && wa !== WHATSAPP_ORIGINE) html = html.split(WHATSAPP_ORIGINE).join(wa);
    if (s.email && s.email !== EMAIL_ORIGINE) html = html.split(EMAIL_ORIGINE).join(esc(s.email));
    return html;
  }

  function aCompleter(html, rel, s) {
    for (const [fichier, texte, cle] of A_COMPLETER) {
      if (fichier !== rel || !s[cle]) continue;
      const marque = `<span class="todo">[À COMPLÉTER : ${texte}]</span>`;
      // Lien PayPal.me : rendu cliquable
      const valeur = String(s[cle]).trim();
      const paypal = cle === 'paiement_paypal' && /^(https?:\/\/)?(www\.)?paypal\.me\/[\w.-]+\/?$/i.test(valeur);
      const contenu = paypal
        ? `<a href="${esc(/^https?:/i.test(valeur) ? valeur : 'https://' + valeur)}" rel="noopener" target="_blank">${esc(valeur)}</a>`
        : esc(valeur).replace(/\n/g, '<br>');
      html = html.split(marque).join(`<span>${contenu}</span>`);
    }
    return masquerNonRenseigne(html);
  }

  // Rien de « À COMPLÉTER » en ligne : ce qui n'est pas renseigné dans Paramètres est masqué.
  const TODO = String.raw`<span class="todo">\[À COMPLÉTER : [^\]]*\]</span>`;
  function masquerNonRenseigne(html) {
    if (!html.includes('class="todo"')) return html;
    // Paiement : la carte du moyen est masquée
    html = html.replace(new RegExp(String.raw`<div class="moyen"( id="[\w-]+")>((?:(?!<div class="moyen")[\s\S])*?)` + TODO, 'g'), '<div class="moyen"$1 hidden>$2');
    if (/<div class="moyen"[^>]*hidden/.test(html)) {
      html = html.replace('Quatre façons <em>de payer</em>', 'Comment <em>payer</em>').replace('Four ways <em>to pay</em>', 'How <em>to pay</em>');
      // Aucun moyen renseigné : toute la section est masquée
      if (!/<div class="moyen"(?![^>]*hidden)/.test(html)) html = html.replace(/<section([^>]*)>((?:(?!<section)[\s\S])*?<div class="moyens">)/, '<section$1 hidden>$2');
    }
    // Tarifs non fixés : la ligne de prix disparaît
    html = html.replace(new RegExp(`<p class="prix-data">${TODO}</p>`, 'g'), '');
    // CGV : numéro de contrat d'assurance pas encore fourni
    html = html.replace(new RegExp(String.raw`, (contrat n°|policy no\.) ` + TODO, 'g'), '');
    // Filet de sécurité : tout autre champ restant disparaît
    return html.replace(new RegExp(TODO, 'g'), '');
  }

  // Bouton « Ajouter au panier » : le panier (assets/js/panier.js) lit le code, le nom affiché et le prix ;
  // le serveur recalcule de toute façon le prix à la commande
  const boutonPanier = (p, nom, en) =>
    `<button type="button" class="bouton panier-ajout" data-ajout-panier data-code="${esc(p.code)}" data-nom="${esc(nom)}" data-prix="${Number(p.prix)}">${en ? 'Add to cart' : 'Ajouter au panier'}</button>`;

  // Carte d'un produit ajouté depuis le back office, au même format que les cartes du site
  function carteProduit(p, en, wa) {
    const nom = (en && p.nom_en) || p.nom;
    const desc = (en && p.description_en) || p.description || '';
    const prix = en ? `€${p.prix}` : euros(p.prix);
    const tailles = String(p.tailles || '').split(',').map((t) => t.trim()).filter(Boolean);
    const message = `${en ? 'Hello Discovermores, I would like to order: ' : 'Bonjour Discovermores, je souhaite commander : '}${nom}`;
    const prefixe = en ? 'size ' : 'taille ';
    const suffixe = ` – ${prix}`;
    const texte = tailles.length ? `${message} (${prefixe}${tailles[0]})${suffixe}.` : `${message}${suffixe}.`;
    const lien = `https://wa.me/${wa}?text=${encodeURIComponent(texte).replace(/'/g, '%27')}`;
    const img = p.image ? `<img src="${esc(p.image)}" alt="${esc(nom)}" loading="lazy" decoding="async">` : '';
    const badge = !p.disponible ? (en ? 'Sold out' : 'Épuisé') : (en && p.badge_en) || p.badge;
    const choix = tailles.length
      ? `<fieldset class="tailles"><legend>${en ? 'Size' : 'Taille'}</legend><div>${tailles.map((t, i) => `<label><input type="radio" name="choix-${esc(p.code)}" value="${esc(t)}"${i === 0 ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div></fieldset>`
      : '';
    const bouton = p.disponible
      ? boutonPanier(p, nom, en) + `<a class="lien-wa" href="${esc(lien)}"${tailles.length ? ` data-message="${esc(message)}" data-prefixe="${prefixe}" data-suffixe="${esc(suffixe)}"` : ''} rel="noopener">${en ? 'or order on WhatsApp' : 'ou commander sur WhatsApp'}</a>`
      : `<span class="bouton secondaire" aria-disabled="true">${en ? 'Sold out' : 'Épuisé'}</span>`;
    return `<li class="carte produit" id="${esc(p.code)}">
  <div class="carte-photo">${img}${badge ? `<span class="pastille">${esc(badge)}</span>` : ''}</div>
  <div class="carte-corps">
    <h3>${esc(nom)}</h3>
    ${desc ? `<p>${esc(desc)}</p>` : ''}
    ${choix}
    <div class="carte-pied${p.disponible ? ' avec-panier' : ''}"><div class="prix"><b>${prix}</b><span>${en ? 'each' : 'l’unité'}</span></div>${bouton}</div>
  </div>
</li>`;
  }

  function boutique(html, en, s) {
    // Produits ajoutés : à la fin de la dernière liste de la boutique (« Garder le Karthala avec vous »)
    const ajoutes = db.all('SELECT * FROM produits WHERE origine=0 ORDER BY ordre, id');
    if (ajoutes.length) {
      const wa = String(s.whatsapp || WHATSAPP_ORIGINE).replace(/\D/g, '');
      const listes = [...html.matchAll(/<ul class="cartes-formules boutique"[^>]*>/g)];
      const derniere = listes[listes.length - 1];
      if (derniere) {
        const fin = html.indexOf('</ul>', derniere.index);
        html = html.slice(0, fin) + ajoutes.map((p) => carteProduit(p, en, wa)).join('\n') + '\n' + html.slice(fin);
      }
    }
    for (const p of db.all('SELECT * FROM produits WHERE origine=1')) {
      const debut = html.indexOf(`<li class="carte produit" id="${p.code}">`);
      if (debut < 0) continue;
      const fin = html.indexOf('</li>', debut);
      let carte = html.slice(debut, fin);
      // Prix affiché et prix repris dans le message WhatsApp de commande
      carte = carte.replace(/(<div class="prix"><b>)[\d\s ,.]+ ?€(<\/b>)/, `$1${euros(p.prix)}$2`); // FR : « 30 € »
      carte = carte.replace(/(<div class="prix"><b>€)[\d,.]+(<\/b>)/, `$1${p.prix}$2`); // EN : « €30 »
      carte = carte.replace(/(%E2%80%93%20)\d+(?:[.,]\d+)?(%20%E2%82%AC)/g, `$1${p.prix}$2`);
      carte = carte.replace(/(%E2%80%93%20%E2%82%AC)\d+(?:[.,]\d+)?/g, `$1${p.prix}`);
      // Prix repris quand le client change de taille (data-suffixe lu par main.js)
      carte = carte.replace(/(data-suffixe=" – )\d+(?:[.,]\d+)? €"/, `$1${p.prix} €"`).replace(/(data-suffixe=" – €)\d+(?:[.,]\d+)?"/, `$1${p.prix}"`);
      if (!p.disponible) {
        carte = carte.replace(/<a class="bouton whatsapp"[^>]*>[\s\S]*?<\/a>/, '<span class="bouton secondaire" aria-disabled="true">Épuisé · Sold out</span>');
        carte = carte.replace(/<span class="pastille">[^<]*<\/span>/, '<span class="pastille">Épuisé</span>');
      } else {
        // Panier : bouton principal ; la commande WhatsApp reste possible en lien secondaire
        const nom = ((carte.match(/<h3>([^<]*)<\/h3>/) || [])[1] || p.nom).trim();
        carte = carte.replace(/<a class="bouton whatsapp"([^>]*)>[\s\S]*?<\/a>/, (m, attrs) =>
          boutonPanier(p, nom.replace(/&amp;/g, '&'), en) + `<a class="lien-wa"${attrs}>${en ? 'or order on WhatsApp' : 'ou commander sur WhatsApp'}</a>`);
        carte = carte.replace('<div class="carte-pied">', '<div class="carte-pied avec-panier">');
      }
      html = html.slice(0, debut) + carte + html.slice(fin);
    }
    return html;
  }

  function partenaires(html, en) {
    const liste = db.all("SELECT * FROM partenaires WHERE publie=1 ORDER BY ordre, id");
    const carte = (p) => {
      const logo = p.logo ? `<img src="${esc(p.logo)}" alt="${esc(p.nom)}" loading="lazy" decoding="async">` : `<span>${esc(p.nom)}</span>`;
      const boite = p.lien ? `<a class="logo-case grand" href="${esc(p.lien)}" rel="noopener" target="_blank">${logo}</a>` : `<span class="logo-case grand">${logo}</span>`;
      const desc = (en && p.description_en) || p.description || '';
      return `<article class="partenaire">${boite}<div><h3>${esc(p.nom)}</h3>${desc ? `<p class="petit">${esc(desc)}</p>` : ''}</div></article>`;
    };
    // Grille 1 : financeurs ; grille 2 : « Ils nous font confiance ». Jamais d'emplacement vide en ligne :
    // une rubrique sans partenaire publié est masquée en entier.
    const grilles = [...html.matchAll(/<div class="grille-partenaires( financeurs)?">/g)];
    for (const g of grilles.reverse()) {
      const niveau = g[1] ? 'financeur' : 'confiance';
      const du = liste.filter((p) => p.niveau === niveau);
      if (!du.length) {
        const s = html.lastIndexOf('<section', g.index);
        if (s >= 0) html = html.slice(0, s) + html.slice(s).replace(/^<section([^>]*)>/, '<section$1 hidden>');
        const debutVide = html.indexOf(g[0], s) + g[0].length;
        const finVide = html.indexOf('</section>', debutVide);
        html = html.slice(0, debutVide) + html.slice(debutVide, finVide).replace(/<article class="partenaire vide">[\s\S]*?<\/article>/g, '') + html.slice(finVide);
        continue;
      }
      const debut = g.index + g[0].length;
      // Seulement les emplacements de CETTE grille (jusqu'à la fin de sa section)
      const finSection = html.indexOf('</section>', debut);
      const fin = finSection < 0 ? html.length : finSection;
      let zone = html.slice(debut, fin);
      let i = 0;
      zone = zone.replace(/<article class="partenaire vide">[\s\S]*?<\/article>/g, () => (i < du.length ? carte(du[i++]) : ''));
      const extra = du.slice(i).map(carte).join('');
      html = html.slice(0, debut) + extra + zone + html.slice(fin);
    }
    return html;
  }

  // Avis de l'accueil : uniquement les avis publiés depuis le back office (12 au plus), au format des cartes du site.
  // Aucun avis publié : la section est masquée (plus d'exemples écrits dans la page).
  const MOIS = { fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
  function avisAccueil(html, en) {
    if (!/data-avis-zone="accueil"/.test(html)) return html;
    const avis = db.all('SELECT auteur,pays,formule,note,texte,mois FROM avis WHERE publie=1 ORDER BY id DESC LIMIT 12');
    if (!avis.length) return html.replace(/(<section[^>]*data-avis-zone="accueil")/, '$1 hidden');
    const noms = Object.fromEntries(db.all('SELECT code,nom,nom_en FROM formules').map((f) => [f.code, (en && f.nom_en) || f.nom]));
    const cartes = avis.map((a) => {
      const note = Math.min(5, Math.max(1, Math.round(Number(a.note)) || 5));
      const m = String(a.mois || '').split('-');
      const date = m.length === 2 && MOIS.fr[+m[1] - 1] ? `${MOIS[en ? 'en' : 'fr'][+m[1] - 1]} ${m[0]}` : '';
      return `<figure class="avis"><div class="etoiles" role="img" aria-label="${note}${en ? ' out of 5' : ' sur 5'}">${'★'.repeat(note)}${'☆'.repeat(5 - note)}</div>`
        + `<blockquote>${esc(a.texte)}</blockquote><figcaption><b>${esc(a.auteur)}</b>${a.pays ? ', ' + esc(a.pays) : ''}`
        + `${a.formule ? ' · ' + esc(noms[a.formule] || a.formule) : ''}${date ? ' · ' + date : ''}</figcaption></figure>`;
    }).join('');
    return html
      .replace(/(data-avis-zone="accueil" data-max=")\d+"/, '$112"')
      .replace(/(<div class="grille avis-grille" data-avis-liste>)[\s\S]*?(<\/div>\s*<div class="boutons">)/, `$1${cartes}$2`)
      .replace(/<\/body>/i, `<script src="/assets/js/avis-defile.js?v=${VERSION}" defer></script>\n</body>`);
  }

  // Listes de formules des formulaires, à partir des tarifs du back office
  // Réservation : liste entière régénérée (prix à jour) ; enregistrement et retour : formules désactivées retirées, nouvelles ajoutées
  const FORMULAIRES_FORMULES = { 'reservation.html': 'complet', 'en/book.html': 'complet', 'enregistrement.html': 'partiel',
    'en/registration.html': 'partiel', 'retour-experience.html': 'partiel', 'en/feedback.html': 'partiel' };
  function libelleFormule(f, en, avecPrix) {
    const nom = (en && f.nom_en) || f.nom;
    if (!avecPrix) return nom;
    const p = Number.isInteger(f.prix) ? String(f.prix) : String(f.prix).replace('.', en ? '.' : ',');
    if (f.type === 'forfait') return en ? `${nom} (€${p}, 1 to 4 people)` : `${nom} (${p} €, 1 à 4 pers.)`;
    if (f.type === 'a-partir') return en ? `${nom} (from €${p} per person)` : `${nom} (dès ${p} € / pers.)`;
    return en ? `${nom} (€${p} per person)` : `${nom} (${p} € / pers.)`;
  }
  const optionFormule = (f, en, avecPrix) => `<option value="${esc(f.nom)}" data-code="${esc(f.code)}">${esc(libelleFormule(f, en, avecPrix))}</option>`;
  function formulesDesFormulaires(html, rel, en) {
    const mode = FORMULAIRES_FORMULES[rel];
    if (!mode) return html;
    const toutes = db.all('SELECT * FROM formules ORDER BY ordre, id');
    const actives = toutes.filter((f) => f.actif);
    return html.replace(/(<select[^>]*name="formule"[^>]*>)([\s\S]*?)(<\/select>)/, (m, ouverture, options, fin) => {
      const vide = (options.match(/<option value="">[^<]*<\/option>/) || [`<option value="">${en ? 'Choose' : 'Choisir'}</option>`])[0];
      if (mode === 'complet') return ouverture + vide + actives.map((f) => optionFormule(f, en, true)).join('') + fin;
      const inactives = new Set(toutes.filter((f) => !f.actif).map((f) => f.code));
      let reste = options.replace(/<option value="[^"]+" data-code="([^"]+)">[^<]*<\/option>/g, (o, code) => (inactives.has(code) ? '' : o));
      reste += actives.filter((f) => !f.origine).map((f) => optionFormule(f, en, false)).join('');
      return ouverture + reste + fin;
    });
  }

  // Cartes des formules (accueil) : prix par personne à 2 et à 4, calculés à partir des Tarifs du back office
  const prixPar = (f, n) => Math.round((f.type === 'forfait' ? f.prix + (f.supp || 0) * Math.max(0, n - 4) : f.prix * n) / n);
  function prixCartes(html, en) {
    const parCode = Object.fromEntries(db.all('SELECT * FROM formules WHERE actif=1').map((f) => [f.code, f]));
    const eur = (n) => (en ? `€${n}` : `${n} €`);
    return html.replace(/<div class="prix"><b>[^<]*<\/b><span>[^<]*<\/span><span>[^<]*<\/span><\/div>(<a class="bouton" href="(?:reservation|book)\.html\?formule=([\w-]+)">)/g, (m, lien, code) => {
      const f = parCode[code];
      if (!f || f.type === 'a-partir') return m;
      const base = f.type === 'forfait' ? (en ? 'flat rate, 1 to 4 people' : 'forfait 1 à 4 personnes') : (en ? 'per person' : 'par personne');
      const detail = en ? `${eur(prixPar(f, 2))} pp for 2 · ${eur(prixPar(f, 4))} pp for 4` : `${eur(prixPar(f, 2))} / pers. à 2 · ${eur(prixPar(f, 4))} / pers. à 4`;
      return `<div class="prix"><b>${eur(f.prix)}</b><span>${base}</span><span>${detail}</span></div>${lien}`;
    });
  }

  // Tableau « Combien pour votre groupe ? » (formules) : calculé à partir des Tarifs du back office,
  // pour qu'un changement de prix ou une nouvelle formule y apparaisse aussitôt
  const TAILLES_GROUPE = [1, 2, 4, 6, 8];
  function tableauPrix(html, rel, en) {
    if (rel !== 'formules.html' && rel !== 'en/tours.html') return html;
    const actives = db.all('SELECT * FROM formules WHERE actif=1 ORDER BY ordre, id');
    if (!actives.length) return html;
    const euros = (n) => (en ? `€${Math.round(n)}` : `${Math.round(n)} €`);
    const lignes = actives.map((f) => {
      const cases = TAILLES_GROUPE.map((n) => {
        const total = f.type === 'forfait' ? f.prix + (f.supp || 0) * Math.max(0, n - 4) : f.prix * n;
        const des = f.type === 'a-partir' ? (en ? 'from ' : 'dès ') : '';
        return `<td class="nombre">${des}${euros(total)}<br><span class="petit">${en ? `i.e. ${euros(total / n)} pp` : `soit ${euros(total / n)} / pers.`}</span></td>`;
      }).join('');
      return `<tr><th scope='row'>${esc((en && f.nom_en) || f.nom)}</th>${cases}</tr>`;
    }).join('');
    html = html.replace(/(<caption[^>]*>(?:Prix total du groupe|Total price for the group)[\s\S]*?<tbody>)[\s\S]*?(<\/tbody>)/, `$1${lignes}$2`);
    // Âges minimum, d'après les Tarifs
    const ages = actives.filter((f) => f.age_min);
    if (ages.length) {
      const liste = en ? ages.map((f) => `${f.age_min} (${(f.nom_en || f.nom)})`).join(', ') : ages.map((f) => `${f.age_min} ans pour ${f.nom}`).join(', ').replace(/, ([^,]*)$/, ' et $1');
      html = en ? html.replace(/Minimum age: [^.]*\./, `Minimum age: ${esc(liste)}.`) : html.replace(/Âge minimum : [^.]*\./, `Âge minimum : ${esc(liste)}.`);
    }
    return html;
  }

  // Bandeau « Avec le soutien de » du pied de page (toutes les pages) : logos des partenaires de la rubrique « soutien ».
  // Dès qu'un logo existe, les emplacements « Logo à venir » disparaissent.
  function soutiens(html, en) {
    const liste = db.all("SELECT * FROM partenaires WHERE publie=1 AND niveau='soutien' ORDER BY ordre, id");
    // Aucun soutien publié : le bandeau entier disparaît (pas de « Logo à venir » en ligne)
    if (!liste.length) return html.replace(/<div class="pied-soutien">[\s\S]*?<div class="pied-soutien-logos">[\s\S]*?<\/div><\/div>/, '');
    const logos = liste.map((p) => {
      const desc = (en && p.description_en) || p.description || '';
      const titre = esc(desc ? `${p.nom} — ${desc}` : p.nom);
      const contenu = p.logo ? `<img src="${esc(p.logo)}" alt="${esc(p.nom)}" loading="lazy" decoding="async">` : `<span>${esc(p.nom)}</span>`;
      return p.lien
        ? `<a class="logo-case" href="${esc(p.lien)}" rel="noopener" target="_blank" title="${titre}">${contenu}</a>`
        : `<span class="logo-case" title="${titre}">${contenu}</span>`;
    }).join('');
    return html.replace(/(<div class="pied-soutien-logos">)[\s\S]*?(<\/div><\/div>)/, `$1${logos}$2`);
  }

  // Accueil, « Ils nous font confiance » : logos des rubriques « confiance » puis « financeur ».
  // Dès qu'un logo existe, les emplacements « Logo à venir » disparaissent.
  function logosAccueil(html, en) {
    const liste = db.all("SELECT * FROM partenaires WHERE publie=1 AND niveau IN ('confiance','financeur') ORDER BY niveau='financeur', ordre, id");
    // Aucun partenaire publié : la section « Ils nous font confiance » est masquée
    if (!liste.length) {
      return html.replace(/<section class="section serree bandeau-logos"([^>]*)>/, '<section class="section serree bandeau-logos"$1 hidden>')
        .replace(/(<div class="grille-logos">)[\s\S]*?<\/div>/, '$1</div>');
    }
    const logos = liste.map((p) => {
      const desc = (en && p.description_en) || p.description || '';
      const titre = esc(desc ? `${p.nom} — ${desc}` : p.nom);
      const contenu = p.logo ? `<img src="${esc(p.logo)}" alt="${esc(p.nom)}" loading="lazy" decoding="async">` : `<span>${esc(p.nom)}</span>`;
      return p.lien
        ? `<a class="logo-case" href="${esc(p.lien)}" rel="noopener" target="_blank" title="${titre}">${contenu}</a>`
        : `<span class="logo-case" title="${titre}">${contenu}</span>`;
    }).join('');
    return html.replace(/(<div class="grille-logos">)[\s\S]*?<\/div>/, `$1${logos}</div>`);
  }

  function galerie(html, en) {
    const photos = db.all('SELECT * FROM photos WHERE publie=1 ORDER BY ordre, id');
    if (!photos.length) return html;
    const figures = photos.map((p) => {
      const leg = esc((en && p.legende_en) || p.legende || '');
      return `<figure><a href="/uploads/${esc(p.fichier)}" data-legende="${leg}"><img src="/uploads/${esc(p.fichier)}" alt="${leg}" loading="lazy" decoding="async"></a><figcaption>${leg}</figcaption></figure>`;
    }).join('');
    const titre = en ? 'Latest photos' : 'Dernières photos';
    const bloc = `<h2 class="galerie-theme">${titre}</h2><div class="galerie mur-photos" data-galerie>${figures}</div>`;
    return html.replace(/(<h2 id="[^"]*" class="galerie-theme">)/, `${bloc}$1`);
  }

  // Case « Niveau d'alerte officiel » de l'accueil : remplace « À confirmer » par le niveau saisi
  // Mesure d'audience sans cookie : le script de l'outil choisi dans Paramètres (Plausible ou Umami) est placé
  // dans le <head> de toutes les pages, et la page Confidentialité le mentionne. Sans réglage : rien n'est chargé.
  function mesureAudience(html, s, en) {
    const outil = s.mesure_outil, id = String(s.mesure_id || '').trim();
    if (!id || !['plausible', 'umami'].includes(outil)) return html;
    const script = outil === 'plausible'
      ? `<script defer data-domain="${esc(id)}" src="https://plausible.io/js/script.js"></script>`
      : `<script defer data-website-id="${esc(id)}" src="https://cloud.umami.is/script.js"></script>`;
    const nom = outil === 'plausible' ? 'Plausible' : 'Umami';
    return html.replace(/<\/head>/i, `${script}\n</head>`)
      .replace('<p>Ce site n’utilise aucun cookie publicitaire ni outil de mesure d’audience.</p>',
        `<p>Ce site n’utilise aucun cookie publicitaire. Nous mesurons la fréquentation du site avec ${nom}, sans cookie et sans aucune donnée permettant de vous identifier : nombre de visites, pages consultées, clics sur les boutons de réservation et de WhatsApp.</p>`)
      .replace('<p>This website uses no advertising cookies or audience measurement tools.</p>',
        `<p>This website uses no advertising cookies. We measure visits to the site with ${nom}, without cookies and without any data that could identify you: number of visits, pages viewed, clicks on the booking and WhatsApp buttons.</p>`);
  }

  const NIVEAUX = { vert: ['Vert', 'Green'], jaune: ['Jaune · vigilance', 'Yellow · vigilance'], orange: ['Orange', 'Orange'], rouge: ['Rouge', 'Red'] };
  function niveauOfficiel(html, s, en) {
    const n = NIVEAUX[s.alerte_niveau];
    const date = /^\d{4}-\d{2}-\d{2}$/.test(s.alerte_date || '') ? s.alerte_date : '';
    const source = /^https:\/\/\S+$/.test(s.alerte_source || '') ? s.alerte_source : '';
    // Niveau affiché seulement s'il est officiel : daté et accompagné de sa source, sinon la case disparaît
    if (!n || !date || !source) return html.replace(/<div><span class="aujourdhui-label">(Niveau d’alerte officiel|Official alert level)<\/span><span class="alerte-pastille a-inconnu">[^<]*<\/span><small>[^<]*<\/small><\/div>/, '');
    const jour = new Date(date + 'T12:00:00').toLocaleDateString(en ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const note = (s.alerte_message ? esc(s.alerte_message)
      : en ? 'Level published by the Karthala Volcano Observatory' : 'Niveau publié par l’Observatoire volcanologique du Karthala')
      + ` (${en ? 'on' : 'le'} ${jour}) · <a href="${esc(source)}" rel="noopener" target="_blank">${en ? 'Source' : 'Source'}</a>`;
    return html.replace(/<span class="alerte-pastille a-inconnu">[^<]*<\/span><small>[^<]*<\/small>/,
      `<span class="alerte-pastille a-${s.alerte_niveau}">${n[en ? 1 : 0]}</span><small>${note}</small>`);
  }

  function alerte(html, s, en) {
    const a = ALERTES[s.alerte_niveau];
    if (!a) return html;
    const msg = esc(s.alerte_message || (en ? a.en : a.fr));
    const bandeau = `<div role="alert" style="background:${a.fond};color:${a.texte};padding:.7rem 1rem;text-align:center;font-weight:700;position:relative;z-index:60">⚠️ ${msg}</div>`;
    return html.replace(/(<body[^>]*>)/i, `$1${bandeau}`);
  }

  // Page HTML du site, réglages appliqués ; base = adresse publique du site (https://domaine)
  function page(rel, base) {
    const s = Object.fromEntries(db.all('SELECT key,value FROM settings').map((r) => [r.key, r.value]));
    const en = rel.startsWith('en/');
    let html = source(rel);
    html = adresses(html, base);
    if (rel === 'qr-codes.html') html = qr(html, base); // après les adresses : le QR contient déjà la bonne
    html = reseaux(html, s);
    html = coordonnees(html, s);
    html = aCompleter(html, rel, s);
    if (rel === 'boutique.html' || rel === 'en/shop.html') html = boutique(html, en, s);
    if (rel === 'partenaires.html' || rel === 'en/partners.html') html = partenaires(html, en);
    if (rel === 'galerie.html' || rel === 'en/gallery.html') html = galerie(html, en);
    html = formulesDesFormulaires(html, rel, en);
    html = tableauPrix(html, rel, en);
    if (rel === 'index.html' || rel === 'en/index.html') html = prixCartes(html, en);
    html = avisAccueil(html, en);
    html = soutiens(html, en);
    if (rel === 'index.html' || rel === 'en/index.html') html = logosAccueil(html, en);
    // Panier : sur toutes les pages (le bouton n'apparaît hors boutique que si le panier n'est pas vide)
    html = html.replace(/<\/head>/i, `<link rel="stylesheet" href="/assets/css/panier.css?v=${VERSION}">\n${FLUIDE}\n</head>`)
      .replace(/<\/body>/i, `<script src="/assets/js/panier.js?v=${VERSION}" defer></script>\n${PRECHARGEMENT}\n</body>`);
    // Style « Clarté » (inspiré de la V75) : activé dans Paramètres, ou essayé avec ?style=clarte (?style=original pour revenir)
    const clarte = s.style_site !== 'original'; // Clarté par défaut
    html = html.replace(/<\/head>/i, `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,600..800&family=Atkinson+Hyperlegible:wght@400;700&display=swap">\n<link rel="stylesheet" href="/assets/css/clarte.css?v=${VERSION}">\n<script>${STYLE_ESSAI}</script>\n</head>`);
    if (clarte) html = html.replace(/<html([^>]*?)(\sclass="([^"]*)")?([^>]*)>/i, (m, a, c, cls, b) => `<html${a} class="${cls ? cls + ' ' : ''}clarte"${b}>`);
    // Chaque mise à jour du site force les navigateurs à recharger les styles et scripts (pas d'ancienne version en cache)
    html = html.replace(/(assets\/(?:css|js)\/[\w-]+\.(?:css|js))\?v=[\w]+/g, `$1?v=${VERSION}`);
    html = mesureAudience(html, s, en);
    html = niveauOfficiel(html, s, en);
    html = alerte(html, s, en);
    return sansHtml(html, base);
  }

  // Fichier de connaissances de K269 : coordonnées à jour
  function connaissance(rel, base) {
    const s = Object.fromEntries(db.all('SELECT key,value FROM settings').map((r) => [r.key, r.value]));
    return sansHtml(coordonnees(reseaux(adresses(source(rel), base), s), s), base);
  }

  // Plan du site pour les moteurs de recherche
  const planDuSite = (base) => sansHtml(adresses(source('sitemap.xml'), base), base);

  // robots.txt : back office et API exclus
  function robots(base) {
    return adresses(source('robots.txt'), base)
      .replace(/^(Disallow:\s*\S*?)(?:index)?\.html\s*$/gm, '$1') // pages servies sans .html
      .replace(/^(Sitemap:.*)$/m, 'Disallow: /api/\n\n$1') // l'adresse secrète du back office n'est jamais écrite ici
      .replace(/^Sitemap:.*$/m, `Sitemap: ${base}/sitemap.xml`);
  }

  // Page d'aperçu (/apercu) : mêmes coordonnées et réseaux que le site ; ses liens « site/… » mènent à la racine
  function apercu(base) {
    const s = Object.fromEntries(db.all('SELECT key,value FROM settings').map((r) => [r.key, r.value]));
    const html = sansHtml(coordonnees(reseaux(adresses(source('../index.html').replace(/(href=")site\//g, '$1/'), base), s), s), base);
    return html.replace(/<\/head>/i, `${FLUIDE}\n</head>`).replace(/<\/body>/i, `${PRECHARGEMENT}\n</body>`);
  }

  // Script du site : liens fabriqués sans .html ; les tests sur « .html » acceptent aussi les adresses sans
  function script(rel) {
    return sansHtml(source(rel).split('\\.html/.test').join('(?:\\.html)?/.test'));
  }

  return { page, apercu, script, sansHtml, connaissance, planDuSite, robots, preparerQR, lienEnregistrement, A_COMPLETER };
}

module.exports = { creer };
