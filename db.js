// Base de données SQLite (sql.js, persistée dans data/karthala360.db)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'karthala360.db');
let db;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'editor',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL);
-- Demandes de réservation (formulaire reservation.html / en/book.html)
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  formule TEXT, nom TEXT, telephone TEXT, email TEXT, pays TEXT,
  date_souhaitee TEXT, adultes INTEGER DEFAULT 0, enfants INTEGER DEFAULT 0,
  estimation REAL, contribution TEXT, prise_en_charge TEXT, message TEXT,
  langue TEXT, status TEXT NOT NULL DEFAULT 'nouvelle', admin_note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- Autres formulaires : retour, contact, enregistrement (fiche participant), groupe
CREATE TABLE IF NOT EXISTS soumissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, data TEXT NOT NULL, traite INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- Questions posées à K269
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL, langue TEXT, resultats INTEGER, ia TEXT, type_reponse TEXT, page TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- Réponses validées par l'équipe, apprises par K269 (?action=savoirs)
CREATE TABLE IF NOT EXISTS savoirs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  langue TEXT NOT NULL DEFAULT 'fr', titre TEXT NOT NULL, texte TEXT NOT NULL, lien TEXT, publie INTEGER DEFAULT 1
);
-- Avis publiés sur le site (?action=avis)
CREATE TABLE IF NOT EXISTS avis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auteur TEXT NOT NULL, pays TEXT, formule TEXT, note INTEGER DEFAULT 5, texte TEXT NOT NULL, mois TEXT,
  publie INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- Agenda (?action=evenements)
CREATE TABLE IF NOT EXISTS evenements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titre_fr TEXT NOT NULL, titre_en TEXT, lieu_fr TEXT, lieu_en TEXT,
  description_fr TEXT, description_en TEXT, heure_fr TEXT, heure_en TEXT,
  debut TEXT NOT NULL, fin TEXT, type TEXT DEFAULT 'discovermores', organisateur TEXT,
  lien TEXT, image TEXT, a_la_une INTEGER DEFAULT 0, publie INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  return crypto.timingSafeEqual(crypto.scryptSync(pw, salt, 64), Buffer.from(hash, 'hex'));
}

function save() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}
const bindable = (p) => p.map((v) => (v === undefined ? null : v));
function all(sql, params = []) {
  const st = db.prepare(sql);
  st.bind(bindable(params));
  const rows = [];
  while (st.step()) rows.push(st.getAsObject());
  st.free();
  return rows;
}
function get(sql, params = []) { return all(sql, params)[0]; }
function run(sql, params = []) {
  db.run(sql, bindable(params));
  const id = get('SELECT last_insert_rowid() AS id').id;
  save();
  return { id };
}

function seed() {
  if (get('SELECT COUNT(*) AS n FROM users').n > 0) return;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@karthala360.km';
  const adminPw = process.env.ADMIN_PASSWORD || 'karthala269';
  // Le mot de passe initial vient du fichier .env : il devra être changé à la première connexion
  db.run('INSERT INTO users (email,name,password_hash,role) VALUES (?,?,?,?)', [adminEmail, 'Administrateur', hashPassword(adminPw), 'admin']);
  db.run('UPDATE users SET doit_changer=1 WHERE email=?', [adminEmail]);

  // Pas d'événement d'exemple : l'agenda se remplit depuis le back office

  const settings = {
    whatsapp: process.env.WHATSAPP_NUMBER || '2693565803',
    email: process.env.CONTACT_EMAIL || 'contact@discovermores.com',
    delai_reponse: '24 heures',
    // Indicateurs saisis par l'équipe (compteur public) ; les autres sont calculés
    stat_dechets_kg: '', stat_fonds_action: '', stat_derniere_meteo: '', stat_derniere_terrain: '', stat_derniere_decision: '',
  };
  for (const [k, v] of Object.entries(settings)) db.run('INSERT INTO settings (key,value) VALUES (?,?)', [k, v]);
  save();
  console.log(`Compte admin créé : ${adminEmail} (mot de passe : ADMIN_PASSWORD du fichier .env, ou 'karthala269' par défaut)`);
}

// ---------- Version 2 : sorties, tarifs, paiements, boutique, partenaires, photos, journal ----------
const SCHEMA_V2 = `
-- Sorties (une par formule et par date) et fiche du guide
CREATE TABLE IF NOT EXISTS sorties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL, formule TEXT, date TEXT NOT NULL, guide TEXT,
  statut TEXT NOT NULL DEFAULT 'planifiée',
  decision TEXT, meteo TEXT, terrain TEXT, heure_depart TEXT, heure_retour TEXT,
  dechets_kg REAL, observations TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- Tarifs (alimentent l'estimation de réservation, les totaux et K269)
CREATE TABLE IF NOT EXISTS formules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL, nom TEXT NOT NULL, nom_en TEXT,
  prix REAL NOT NULL, type TEXT NOT NULL DEFAULT 'personne', supp REAL, contrib REAL DEFAULT 0,
  age_min INTEGER, min_pers INTEGER DEFAULT 1, actif INTEGER DEFAULT 1, ordre INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS produits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL, nom TEXT NOT NULL, prix REAL NOT NULL, disponible INTEGER DEFAULT 1, stock INTEGER
);
CREATE TABLE IF NOT EXISTS commandes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL, telephone TEXT, produit TEXT NOT NULL, detail TEXT, quantite INTEGER DEFAULT 1,
  montant REAL, statut TEXT DEFAULT 'à confirmer', note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS partenaires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL, niveau TEXT NOT NULL DEFAULT 'confiance', description TEXT, description_en TEXT,
  logo TEXT, lien TEXT, ordre INTEGER DEFAULT 0, publie INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fichier TEXT NOT NULL, legende TEXT, legende_en TEXT, ordre INTEGER DEFAULT 0, publie INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utilisateur TEXT, action TEXT, cible TEXT, detail TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;
// Colonnes ajoutées aux tables existantes (bases créées avant la version 2)
const COLONNES_V2 = [
  ['reservations', 'montant_total REAL'], ['reservations', 'contribution_eur REAL'],
  ['reservations', 'acompte REAL'], ['reservations', 'acompte_date TEXT'],
  ['reservations', 'solde_paye REAL'], ['reservations', 'solde_date TEXT'], ['reservations', 'mode_paiement TEXT'],
  ['reservations', 'id_sortie TEXT'],
  // Produits ajoutés depuis le back office (origine = 0) ; les 7 du site d'origine ont origine = 1
  ['produits', 'nom_en TEXT'], ['produits', 'description TEXT'], ['produits', 'description_en TEXT'],
  ['produits', 'image TEXT'], ['produits', 'tailles TEXT'], ['produits', 'badge TEXT'], ['produits', 'badge_en TEXT'],
  ['produits', 'origine INTEGER DEFAULT 0'], ['produits', 'ordre INTEGER DEFAULT 0'],
  // Sécurité : mot de passe à changer à la prochaine connexion (mot de passe initial ou par défaut)
  ['users', 'doit_changer INTEGER DEFAULT 0'],
  // Panier de la boutique : commandes passées en ligne (référence, lignes détaillées, remise)
  ['commandes', 'ref TEXT'], ['commandes', 'email TEXT'], ['commandes', 'mode_remise TEXT'],
  ['commandes', 'lignes TEXT'], ['commandes', 'langue TEXT'], ['commandes', 'stock_rendu INTEGER DEFAULT 0'],
  // Formules : les 5 du site d'origine (origine = 1) ne se suppriment pas ; celles ajoutées depuis le back office oui
  // Envoi automatique du bon de réservation au client (date d'envoi, ou raison du non-envoi)
  ['reservations', 'bon_envoye_le TEXT'], ['reservations', 'bon_envoi_info TEXT'], ['reservations', 'groupe TEXT'], ['commandes', 'groupe TEXT'], ['commandes', 'confirmation_envoyee_le TEXT'], ['commandes', 'confirmation_info TEXT'],
  // Agenda : prix, niveau et places affichés seulement s'ils sont renseignés
  // Avis : traduction anglaise (sans elle, l'avis n'apparaît pas sur les pages anglaises)
  // Boutique entièrement gérée en base : rubrique, unité, titre et choix en anglais
  ['produits', 'rubrique TEXT'], ['produits', 'unite TEXT'], ['produits', 'unite_en TEXT'], ['produits', 'choix_titre TEXT'], ['produits', 'choix_titre_en TEXT'], ['produits', 'tailles_en TEXT'],
  ['avis', 'texte_en TEXT'], ['avis', 'pays_en TEXT'],
  ['evenements', 'prix TEXT'], ['evenements', 'niveau_fr TEXT'], ['evenements', 'niveau_en TEXT'], ['evenements', 'places TEXT'],
  ['formules', 'origine INTEGER DEFAULT 0'], ['formules', 'description TEXT'], ['formules', 'description_en TEXT'], ['formules', 'sigle TEXT'],
];
// Mots de passe connus (valeurs par défaut du projet) : jamais acceptés durablement
const MDP_PAR_DEFAUT = ['karthala269', 'changez-moi-svp', 'changez-moi-aussi'];
// Valeurs reprises de assets/js/config.js et de la boutique du site
const FORMULES_V2 = [
  ['zero-effort', 'Zéro Effort', 'Zero Effort', 350, 'forfait', 50, 10, 5, 1, 1],
  ['soft-trek', 'Soft Trek', 'Soft Trek', 250, 'forfait', 50, 7, 8, 1, 2],
  ['bivouac', 'Bivouac au volcan', 'Volcano Bivouac', 150, 'personne', null, 5, 12, 2, 3],
  ['sportif', 'Karthala Sportif', 'Full Climb', 90, 'personne', null, 2, 15, 2, 4],
];
const PRODUITS_V2 = [
  ['maillot-obsidienne-gold', 'Édition Obsidienne Gold', 30], ['maillot-relief-rouge', 'Édition Relief Rouge', 30],
  ['maillot-neon-alt', 'Édition Neon Alt', 30], ['gourde-karthala', 'Gourde Karthala 2 361 m', 15],
  ['patch-karthala', 'Écusson Karthala 2 361 m', 5], ['diplome-super-randonneur', 'Diplôme du Super Randonneur', 5],
  ['trace-gps', 'Tracé GPS du Karthala', 7],
];
const SETTINGS_V2 = {
  paiement_virement: '', paiement_paypal: '', paiement_mvola: '', paiement_wakati: '',
  acompte_pct: '30', seuil_action: '500', fonds_ajustement: '0',
  tarif_agenda_evenement: '', tarif_agenda_semaine: '', tarif_datapro_rapport: '', tarif_datapro_abonnement: '',
  assurance_contrat: '', alerte_niveau: '', alerte_message: '', alerte_date: '', alerte_source: '', mesure_outil: '', mesure_id: '', notif_email: '',
  site_url: process.env.SITE_URL || '', envoi_auto_bon: '1', style_site: 'clarte', lien_instagram: '', lien_facebook: '',
};

function migrer() {
  db.run(SCHEMA_V2);
  for (const [table, def] of COLONNES_V2) {
    const nom = def.split(' ')[0];
    if (!all(`PRAGMA table_info(${table})`).some((c) => c.name === nom)) db.run(`ALTER TABLE ${table} ADD COLUMN ${def}`);
  }
  if (get('SELECT COUNT(*) n FROM formules').n === 0) {
    for (const f of FORMULES_V2) db.run('INSERT INTO formules (code,nom,nom_en,prix,type,supp,contrib,age_min,min_pers,ordre) VALUES (?,?,?,?,?,?,?,?,?,?)', f);
  }
  if (get('SELECT COUNT(*) n FROM produits').n === 0) {
    for (const p of PRODUITS_V2) db.run('INSERT INTO produits (code,nom,prix) VALUES (?,?,?)', p);
  }
  // Comptes encore sur un mot de passe par défaut : changement imposé à la prochaine connexion
  for (const u of all('SELECT id, password_hash FROM users WHERE doit_changer=0')) {
    if (MDP_PAR_DEFAUT.some((pw) => verifyPassword(pw, u.password_hash))) db.run('UPDATE users SET doit_changer=1 WHERE id=?', [u.id]);
  }
  db.run(`UPDATE formules SET origine=1 WHERE code IN (${FORMULES_V2.map(() => '?').join(',')})`, FORMULES_V2.map((f) => f[0]));
  db.run(`UPDATE produits SET origine=1 WHERE code IN (${PRODUITS_V2.map(() => '?').join(',')})`, PRODUITS_V2.map((p) => p[0]));
  for (const [k, v] of Object.entries(SETTINGS_V2)) db.run('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)', [k, v]);
  // Une seule fois : le Quad & Buggy sort du site (formule désactivée, réactivable dans Tarifs)
  if (!get("SELECT 1 x FROM settings WHERE key='quad_retire'")) {
    db.run("UPDATE formules SET actif=0 WHERE code='quad-buggy'");
    db.run("INSERT INTO settings (key,value) VALUES ('quad_retire','1')");
  }
  // Une seule fois : le style Clarté devient celui du site (ensuite, le choix fait dans Paramètres est respecté)
  if (!get("SELECT 1 x FROM settings WHERE key='style_clarte_applique'")) {
    db.run("UPDATE settings SET value='clarte' WHERE key='style_site'");
    db.run("INSERT INTO settings (key,value) VALUES ('style_clarte_applique','1')");
  }
  save();
}

async function init() {
  const SQL = await initSqlJs();
  db = fs.existsSync(DB_FILE) ? new SQL.Database(fs.readFileSync(DB_FILE)) : new SQL.Database();
  db.run(SCHEMA);
  migrer(); // d'abord les tables et colonnes à jour, puis les données de départ
  seed();
  return { all, get, run, hashPassword, verifyPassword, exporter: () => Buffer.from(db.export()), dossier: path.dirname(DB_FILE), MDP_PAR_DEFAUT };
}

module.exports = { init };
