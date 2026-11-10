// Construit les 4 pages expériences (/zero-effort, /soft-trek, /bivouac, /karthala-sportif, et /en/…) à partir
// des fiches de la page Formules et des sections Équipement, Sécurité et Questions de la page Préparer.
// Les données encore manquantes (journée heure par heure, altitude de départ, nom de l'arrêt 4×4, nom du Bivouac)
// ne sont pas inventées : la page reprend seulement ce qui est déjà publié.
// À relancer après une modification de formules.html, preparer.html ou de leurs versions anglaises :
//   node scripts/pages-experiences.js
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', 'public', 'site');
const BASE = 'https://karthala360.discovermores.com';
const EXPERIENCES = [['zero-effort', 'zero-effort'], ['soft-trek', 'soft-trek'], ['bivouac', 'bivouac'], ['sportif', 'karthala-sportif']];
const LANGUES = {
  fr: { dossier: '', formules: 'formules.html', preparer: 'preparer.html', resa: 'reservation.html', autre: 'en/', retour: '',
    enBref: 'En bref', titre: (n) => `${n} : ascension du Karthala | Karthala360`, appel: 'Prêt à partir ?',
    appelTexte: 'Envoyez-nous votre date : aucun paiement tant que la météo, les guides et le véhicule ne sont pas confirmés.',
    demander: 'Demander une date', comparer: 'Comparer les 4 expériences', sections: ['Équipement', 'Sécurité', 'Questions fréquentes'] },
  en: { dossier: 'en/', formules: 'tours.html', preparer: 'prepare.html', resa: 'book.html', autre: '../', retour: '',
    enBref: 'At a glance', titre: (n) => `${n}: Mount Karthala climb | Karthala360`, appel: 'Ready to go?',
    appelTexte: 'Send us your date: no payment until the weather, the guides and the vehicle are confirmed.',
    demander: 'Request a date', comparer: 'Compare the 4 experiences', sections: ['Equipment', 'Safety', 'Frequently asked questions'] },
};

const lire = (rel) => fs.readFileSync(path.join(SITE, rel), 'utf8');
const sansBalises = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// Section de la page Préparer dont le titre commence par « debut »
function sectionPreparer(html, debut) {
  for (const m of html.matchAll(/<section class="section[^"]*"[^>]*>[\s\S]*?<\/section>/g)) {
    const h2 = m[0].match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    if (h2 && sansBalises(h2[1]).startsWith(debut)) return m[0];
  }
  return '';
}

for (const [langue, L] of Object.entries(LANGUES)) {
  const formules = lire(L.dossier + L.formules);
  const preparer = lire(L.dossier + L.preparer);
  const entete = formules.slice(0, formules.indexOf('<main id="contenu">'));
  const pied = formules.slice(formules.indexOf('</main>'));
  const nonInclus = (formules.match(/<section class="section">\s*<div class="conteneur colonnes-2">[\s\S]*?<\/section>/) || [''])[0];
  const extraits = L.sections.map((t) => sectionPreparer(preparer, t)).filter(Boolean).join('\n\n');

  for (const [id, adresse] of EXPERIENCES) {
    const fiche = formules.match(new RegExp(`<article class="fiche" id="${id}">[\\s\\S]*?</article>`))[0];
    const nom = sansBalises(fiche.match(/<h2>([\s\S]*?)<\/h2>/)[1]);
    const promesse = sansBalises((fiche.match(/<p class="promesse-fiche">([\s\S]*?)<\/p>/) || ['', ''])[1]);
    const image = fiche.match(/<img src="([^"]+)"/)[1].replace(/^(\.\.\/)?/, '');
    const image800 = image.replace(/\.webp$/, '-800.webp');
    const url = `${BASE}/${L.dossier}${adresse}.html`;
    const urlFr = `${BASE}/${adresse}.html`, urlEn = `${BASE}/en/${adresse}.html`;
    const prefixe = L.dossier ? '../' : '';

    let tete = entete
      .replace(/<title>[^<]*<\/title>/, `<title>${L.titre(nom)}</title>`)
      .replace(/(<meta (?:name|property)="(?:og:|twitter:)?title" content=")[^"]*"/g, `$1${attr(L.titre(nom))}"`)
      .replace(/(<meta (?:name|property)="(?:og:|twitter:)?description" content=")[^"]*"/g, `$1${attr(promesse)}"`)
      .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${url}"`)
      .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${url}"`)
      .replace(/(<link rel="alternate" hreflang="fr" href=")[^"]*"/, `$1${urlFr}"`)
      .replace(/(<link rel="alternate" hreflang="en" href=")[^"]*"/, `$1${urlEn}"`)
      .replace(/(<link rel="alternate" hreflang="x-default" href=")[^"]*"/, `$1${urlFr}"`)
      .replace(/(<meta (?:property="og:image"|name="twitter:image") content=")[^"]*"/g, `$1${BASE}/${image}"`)
      .replace(/(<link rel="preload" as="image" href=")[^"]*(" media="\(min-width:801px\)")/, `$1${prefixe}${image}$2`)
      .replace(/(<link rel="preload" as="image" href=")[^"]*(" media="\(max-width:800px\)")/, `$1${prefixe}${image800}$2`)
      .replace(/(background-image:url\(')[^']*('\)!important)/, `$1${prefixe}${image800}$2`)
      .replace(/(<a class="langue" href=")[^"]*"/, `$1${L.dossier ? '../' : 'en/'}${adresse}.html"`)
      .replace(/ aria-current="page"/g, '');

    const article = fiche
      .replace(`id="${id}"`, `id="${adresse}"`)
      .replace(/<h2>[\s\S]*?<\/h2>/, `<h2>${L.enBref}</h2>`);
    const corps = `<main id="contenu">

<section class="bandeau-page" style="background-image:url('${prefixe}${image}')">
  <div class="conteneur">
    <h1>${nom}</h1>
    <p>${promesse}</p>
  </div>
</section>

<section class="section">
  <div class="conteneur">
    ${article}
  </div>
</section>

${nonInclus}

${extraits}

<section class="section">
  <div class="conteneur"><div class="appel">
    <h2>${L.appel}</h2>
    <p class="intro">${L.appelTexte}</p>
    <div class="boutons">
      <a class="bouton" href="${L.resa}?formule=${id}">${L.demander}</a>
      <a class="bouton secondaire" href="${L.formules}">${L.comparer}</a>
    </div>
  </div></div>
</section>

`;
    // Barre fixe « Réserver » : ouvre le formulaire avec cette expérience déjà choisie
    const fin = pied.replace(/(<div class="barre-mobile">\s*<a class="bouton" href=")[^"]*"/, `$1${L.resa}?formule=${id}"`)
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/, '');
    fs.writeFileSync(path.join(SITE, L.dossier + adresse + '.html'), tete + corps + fin);
    console.log(`${L.dossier}${adresse}.html : ${nom}`);
  }
}
