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
      html = html.split(marque).join(`<span>${esc(s[cle]).replace(/\n/g, '<br>')}</span>`);
    }
    return html;
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
    if (!liste.length) return html;
    const carte = (p) => {
      const logo = p.logo ? `<img src="${esc(p.logo)}" alt="${esc(p.nom)}" loading="lazy" decoding="async">` : `<span>${esc(p.nom)}</span>`;
      const boite = p.lien ? `<a class="logo-case grand" href="${esc(p.lien)}" rel="noopener" target="_blank">${logo}</a>` : `<span class="logo-case grand">${logo}</span>`;
      const desc = (en && p.description_en) || p.description || '';
      return `<article class="partenaire">${boite}<div><h3>${esc(p.nom)}</h3>${desc ? `<p class="petit">${esc(desc)}</p>` : ''}</div></article>`;
    };
    // Grille 1 : financeurs ; grille 2 : « Ils nous font confiance ». Les emplacements vides restants sont conservés.
    const grilles = [...html.matchAll(/<div class="grille-partenaires( financeurs)?">/g)];
    for (const g of grilles.reverse()) {
      const niveau = g[1] ? 'financeur' : 'confiance';
      const du = liste.filter((p) => p.niveau === niveau);
      if (!du.length) continue;
      const debut = g.index + g[0].length;
      // Seulement les emplacements de CETTE grille (jusqu'à la fin de sa section)
      const finSection = html.indexOf('</section>', debut);
      const fin = finSection < 0 ? html.length : finSection;
      let zone = html.slice(debut, fin);
      let i = 0;
      zone = zone.replace(/<article class="partenaire vide">[\s\S]*?<\/article>/g, (m) => (i < du.length ? carte(du[i++]) : m));
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
    if (!liste.length) return html;
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
    if (!liste.length) return html;
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
  const NIVEAUX = { vert: ['Vert', 'Green'], jaune: ['Jaune · vigilance', 'Yellow · vigilance'], orange: ['Orange', 'Orange'], rouge: ['Rouge', 'Red'] };
  function niveauOfficiel(html, s, en) {
    const n = NIVEAUX[s.alerte_niveau];
    if (!n) return html;
    const note = s.alerte_message ? esc(s.alerte_message)
      : en ? 'Level published by the Karthala Volcano Observatory.' : 'Niveau publié par l’Observatoire volcanologique du Karthala.';
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
