// Données de test Karthala360 — passent par l'API (comme un visiteur et un administrateur).
//   node scripts/donnees-test.js           → ajoute les données de test
//   node scripts/donnees-test.js --vider   → supprime toutes les données marquées [TEST]
// Variables : URL (http://localhost:3000), ADMIN_EMAIL / ADMIN_PASSWORD (sinon lus dans .env).
const fs = require('fs');
const path = require('path');

const env = {};
try {
  for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
} catch {}
const URL = process.env.URL || 'http://localhost:3000';
const EMAIL = process.env.ADMIN_EMAIL || env.ADMIN_EMAIL || 'admin@karthala360.km';
const PASSWORD = process.env.ADMIN_PASSWORD || env.ADMIN_PASSWORD || 'karthala269';
const T = '[TEST] ';

const jour = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const pick = (a, i) => a[i % a.length];

async function formulaire(champs) {
  const r = await fetch(`${URL}/api/k360`, { method: 'POST', body: new URLSearchParams(champs) });
  const j = await r.json();
  if (!j.ok) throw new Error(`Formulaire ${champs.formulaire} refusé : ${JSON.stringify(j)}`);
  return j;
}

let cookie = '';
async function admin(methode, url, body) {
  const r = await fetch(`${URL}/api${url}`, {
    method: methode, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${methode} ${url} : ${j.error || r.status}`);
  return j;
}
async function connexion() {
  const r = await fetch(`${URL}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  if (!r.ok) throw new Error('Connexion admin impossible : vérifiez ADMIN_EMAIL / ADMIN_PASSWORD (.env)');
  cookie = r.headers.get('set-cookie').split(';')[0];
}

// ---------- Jeux de données ----------
const CLIENTS = [
  ['Amina Said', 'Comores', '+269 321 00 01', 'amina.test@example.com'],
  ['Julien Moreau', 'France', '+33 6 00 00 00 02', 'julien.test@example.com'],
  ['Fatima Ali', 'Comores', '+269 321 00 03', ''],
  ['Sarah Thompson', 'Royaume-Uni', '+44 7700 900004', 'sarah.test@example.com'],
  ['Ibrahim Mohamed', 'Comores', '+269 321 00 05', 'ibrahim.test@example.com'],
  ['Claire Dubois', 'Belgique', '+32 470 00 00 06', 'claire.test@example.com'],
  ['Hassani Ahmed', 'Mayotte', '+262 639 00 00 07', ''],
  ['Lena Schmidt', 'Allemagne', '+49 151 0000008', 'lena.test@example.com'],
  ['Moussa Djae', 'Comores', '+269 321 00 09', ''],
  ['Nadia Benali', 'France', '+33 6 00 00 00 10', 'nadia.test@example.com'],
  ['David Kariuki', 'Kenya', '+254 700 000011', 'david.test@example.com'],
  ['Zaharia Youssouf', 'Comores', '+269 321 00 12', ''],
];
const FORMULES = [['Zéro Effort', 350, 'forfait'], ['Soft Trek', 250, 'forfait'], ['Bivouac au volcan', 150, 'personne'], ['Karthala Sportif', 90, 'personne'], ['Quad & Buggy', 150, 'personne']];
const STATUTS = ['nouvelle', 'nouvelle', 'nouvelle', 'confirmée', 'confirmée', 'acompte payé', 'payée', 'payée', 'terminée', 'terminée', 'annulée', 'nouvelle'];
const MESSAGES = ['', 'Nous serons avec deux enfants de 9 et 12 ans.', 'Possible de partir très tôt pour le lever du soleil ?', '', 'Je suis végétarien.', 'Première fois aux Comores, des conseils pour l’équipement ?'];

async function ajouter() {
  await connexion();
  console.log('Connecté au back office.');

  // Réservations (formulaire du site), puis statuts variés (back office)
  const refs = [];
  for (let i = 0; i < CLIENTS.length; i++) {
    const [nom, pays, tel, email] = CLIENTS[i];
    const [formule, prix, type] = pick(FORMULES, i);
    const adultes = 1 + (i % 4), enfants = i % 3 === 0 ? 1 : 0;
    const terminee = STATUTS[i] === 'terminée';
    const r = await formulaire({
      formulaire: 'reservation', page: i % 4 === 3 ? '/en/book' : '/reservation',
      formule, nom: T + nom, telephone: tel, email, pays,
      date_souhaitee: jour(terminee ? -20 - i : 7 + i * 6), adultes, enfants,
      estimation: type === 'forfait' ? prix + 50 * Math.max(0, adultes + enfants - 2) : prix * (adultes + enfants),
      contribution: pick(['', '5', '10', '0'], i), prise_en_charge: pick(['Hôtel à Moroni', 'Aéroport', 'Aucune'], i),
      message: pick(MESSAGES, i), accepte_cgv: 'Oui',
    });
    refs.push(r.id);
  }
  const resas = await admin('GET', '/admin/reservations?q=[TEST]');
  for (let i = 0; i < resas.length; i++) {
    const r = resas[resas.length - 1 - i];
    if (STATUTS[i] !== 'nouvelle') await admin('PUT', `/admin/reservations/${r.id}`, { status: STATUTS[i], admin_note: i % 3 ? '' : 'Rappelé par WhatsApp' });
    const du = r.montant_total || r.estimation || 0;
    if (STATUTS[i] === 'acompte payé') await admin('PUT', `/admin/reservations/${r.id}`, { acompte: Math.round(du * 0.3), acompte_date: jour(-3), mode_paiement: 'MVola' });
    if (STATUTS[i] === 'payée' || STATUTS[i] === 'terminée') await admin('PUT', `/admin/reservations/${r.id}`, { acompte: Math.round(du * 0.3), acompte_date: jour(-10), solde_paye: du - Math.round(du * 0.3), solde_date: jour(-2), mode_paiement: pick(['Virement', 'PayPal', 'Wakati'], i) });
  }
  console.log(`✓ ${refs.length} réservations (statuts variés)`);

  // Fiches participants (compteur public)
  let n = 0;
  for (let s = 0; s < 4; s++) {
    for (let p = 0; p < 3 + s; p++) {
      const c = pick(CLIENTS, s * 3 + p);
      await formulaire({
        formulaire: 'enregistrement', page: '/enregistrement', id_sortie: `TEST-S${s + 1}`, encadrement: 'Discovermores', formule: pick(FORMULES, s)[0],
        date_sortie: jour(-40 + s * 9), nom: T + c[0], sexe: p % 2 ? 'Femme' : 'Homme', tranche_age: pick(['18 à 35 ans', '36 à 55 ans', '12 à 17 ans'], p),
        nationalite: c[1], pays: c[1], ville: pick(['Moroni', 'Paris', 'Mitsamiouli', 'Londres'], p), telephone: c[2],
        urgence_nom: 'Contact test', urgence_tel: '+269 321 99 99', niveau: pick(['Débutant', 'Régulier', 'Sportif'], p),
        sante: 'Non', accord_photo: 'Oui', consentement: 'Oui',
      });
      n++;
    }
  }
  console.log(`✓ ${n} fiches participants (4 sorties)`);
  const DECISIONS = [['Go', 'Ensoleillé, vent faible', 'Sec', 2.5], ['Adapter', 'Nuageux, bruine en forêt', 'Boue en forêt', 1.8], ['Go', 'Dégagé', 'Sec', 3.1], ['No Go', 'Pluie forte', 'Glissant', 0]];
  for (const [i, so] of (await admin('GET', '/admin/sorties')).filter((x) => x.code.startsWith('TEST-')).reverse().entries()) {
    const [decision, meteo, terrain, dechets_kg] = DECISIONS[i % 4];
    await admin('PUT', `/admin/sorties/${so.id}`, { guide: pick(['Ali (test)', 'Said (test)'], i), statut: decision === 'No Go' ? 'annulée' : 'réalisée', decision, meteo, terrain, heure_depart: '05:30', heure_retour: '14:00', dechets_kg, observations: T + 'Gobemouche de Humblot observé près de la lisière.' });
  }
  console.log('✓ fiches du guide sur les 4 sorties');

  // Retours d'expérience (certains avec accord de publication → avis à valider)
  const RETOURS = [
    ['Bivouac au volcan', 5, 'Nuit magique au bord du cratère, le guide connaissait chaque oiseau.', 'Oui', 'Amina S.'],
    ['Soft Trek', 4, 'Très belle balade, un peu de boue dans la forêt mais rien de grave.', 'Oui', 'Julien M.'],
    ['Karthala Sportif', 5, 'Montée difficile mais la vue sur la caldeira vaut tout.', 'Oui', 'Sarah T.'],
    ['Zéro Effort', 3, 'Le 4x4 a eu du retard au départ, sinon très bien.', 'Non', ''],
    ['Bivouac au volcan', 5, 'Repas excellents et tentes confortables.', 'Oui', 'Lena S.'],
  ];
  for (const [formule, note, commentaire, publication, signature] of RETOURS) {
    await formulaire({ formulaire: 'retour', page: '/retour-experience', formule, note, commentaire: T + commentaire, publication, signature: signature && T + signature, difficulte: 'Adaptée', moment: 'Le lever de soleil' });
  }
  console.log(`✓ ${RETOURS.length} retours d'expérience`);

  // Messages de contact
  const CONTACTS = [
    ['Hôtel Le Moroni', 'Partenariat', 'Nous aimerions proposer vos sorties à nos clients.'],
    ['École de Mitsamiouli', 'Groupe scolaire', 'Sortie pédagogique pour 25 élèves en mars ?'],
    ['Particulier', 'Question', 'Faut-il un certificat médical pour le Karthala Sportif ?'],
  ];
  for (const [organisation, sujet, message] of CONTACTS) {
    await formulaire({ formulaire: 'contact', page: '/contact', nom: T + 'Contact ' + organisation, organisation, sujet, email: 'contact.test@example.com', telephone: '+269 321 00 50', message: T + message });
  }
  console.log(`✓ ${CONTACTS.length} messages de contact`);

  // Questions posées à K269 (dont sans réponse)
  const QUESTIONS = [
    ['Peut-on monter avec des enfants ?', 4], ['Quel est le prix du bivouac ?', 3], ['Y a-t-il du réseau au sommet ?', 0],
    ['Can I rent hiking boots?', 0, 'en'], ['Le volcan est-il dangereux ?', 5], ['Combien de temps dure la montée ?', 2], ['Peut-on venir avec un chien ?', 0],
  ];
  for (const [q, n, langue] of QUESTIONS) await formulaire({ formulaire: 'question', question: T + q, langue: langue || 'fr', resultats: n, ia: 'Non', type_reponse: n ? 'pages du site' : 'aucune', page: '/site/question.html' });
  console.log(`✓ ${QUESTIONS.length} questions à K269`);

  // Contenus du back office : agenda, avis publiés, réponses de l'équipe
  await admin('POST', '/admin/evenements', { titre_fr: T + 'Ascension au clair de lune', titre_en: T + 'Full moon climb', lieu_fr: 'Départ de Mvouni', lieu_en: 'Start at Mvouni', description_fr: 'Montée de nuit pour voir le lever du soleil sur la caldeira.', description_en: 'Night climb to watch sunrise over the caldera.', heure_fr: '22 h 00', heure_en: '10:00 pm', debut: jour(21), fin: jour(22), type: 'discovermores', organisateur: 'Discovermores', a_la_une: 0, publie: 1 });
  await admin('POST', '/admin/evenements', { titre_fr: T + 'Atelier oiseaux endémiques', titre_en: T + 'Endemic birds workshop', lieu_fr: 'Moroni', lieu_en: 'Moroni', description_fr: 'Présentation des oiseaux du Karthala avec un ornithologue partenaire.', description_en: 'Karthala birds talk with a partner ornithologist.', heure_fr: '15 h 00', heure_en: '3:00 pm', debut: jour(35), fin: jour(35), type: 'partenaire', organisateur: 'Association partenaire (test)', a_la_une: 0, publie: 1 });
  const AVIS = [['Amina S.', 'Comores', 'bivouac', 5, 'Une nuit inoubliable au bord du cratère.'], ['Julien M.', 'France', 'soft-trek', 4, 'Parfait pour découvrir la forêt du Karthala.'], ['Sarah T.', 'Royaume-Uni', 'sportif', 5, 'Tough climb, amazing guides!']];
  for (const [auteur, pays, formule, note, texte] of AVIS) await admin('POST', '/admin/avis', { auteur: T + auteur, pays, formule, note, texte, mois: jour(-30).slice(0, 7), publie: 1 });
  await admin('POST', '/admin/savoirs', { langue: 'fr', titre: T + 'Y a-t-il du réseau téléphonique au sommet ?', texte: 'Le réseau est absent par endroits sur le sentier et au sommet. Prévenez un proche de votre heure de retour ; le guide a une radio.', lien: 'preparer.html', publie: 1 });
  await admin('POST', '/admin/savoirs', { langue: 'en', titre: T + 'Can I rent hiking boots?', texte: 'Yes, a few pairs of boots can be lent on request. Mention your shoe size when you book.', lien: 'book.html', publie: 1 });
  console.log('✓ 2 événements, 3 avis publiés, 2 réponses K269');
  for (const [client, produit, detail, quantite, montant, statut] of [['Amina Said', 'Édition Obsidienne Gold', 'Taille M', 1, 30, 'payée'], ['Julien Moreau', 'Gourde Karthala 2 361 m', '', 2, 30, 'à confirmer'], ['Lena Schmidt', 'Tracé GPS du Karthala', 'Bivouac', 1, 7, 'remise']]) {
    await admin('POST', '/admin/commandes', { client: T + client, telephone: '+269 321 00 01', produit, detail, quantite, montant, statut });
  }
  await admin('POST', '/admin/partenaires', { nom: T + 'Partenaire exemple', niveau: 'confiance', description: 'Partenaire fictif de démonstration.', lien: 'https://example.org', ordre: 1, publie: 1 });
  console.log('✓ 3 commandes boutique, 1 partenaire');
  console.log(`\nTerminé. Site : ${URL}/  ·  Back office : ${URL}/admin/`);
}

async function vider() {
  await connexion();
  let total = 0;
  const supprimer = async (ressource, lignes) => {
    for (const l of lignes) { await admin('DELETE', `/admin/${ressource}/${l.id}`); total++; }
  };
  const test = (v) => String(v || '').startsWith('[TEST]');
  await supprimer('reservations', (await admin('GET', '/admin/reservations?q=[TEST]')).filter((r) => test(r.nom)));
  await supprimer('soumissions', (await admin('GET', '/admin/soumissions')).filter((s) => Object.values(s.data).some(test)));
  await supprimer('questions', (await admin('GET', '/admin/questions')).filter((q) => test(q.question)));
  await supprimer('avis', (await admin('GET', '/admin/avis')).filter((a) => test(a.auteur) || test(a.texte)));
  await supprimer('evenements', (await admin('GET', '/admin/evenements')).filter((e) => test(e.titre_fr)));
  await supprimer('savoirs', (await admin('GET', '/admin/savoirs')).filter((s) => test(s.titre)));
  await supprimer('sorties', (await admin('GET', '/admin/sorties')).filter((s) => s.code.startsWith('TEST-')));
  await supprimer('commandes', (await admin('GET', '/admin/commandes')).filter((c) => test(c.client)));
  await supprimer('partenaires', (await admin('GET', '/admin/partenaires')).filter((p) => test(p.nom)));
  await supprimer('produits', (await admin('GET', '/admin/produits')).filter((p) => !p.origine && test(p.nom)));
  console.log(`✓ ${total} lignes de test supprimées`);
}

(process.argv.includes('--vider') ? vider() : ajouter()).catch((e) => { console.error('Erreur :', e.message); process.exit(1); });
