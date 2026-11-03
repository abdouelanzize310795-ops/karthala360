// Nouveau mot de passe pour un compte du back office (mot de passe oublié),
// ou création d'un compte administrateur si l'e-mail tapé n'existe pas encore.
// À lancer application arrêtée, sinon elle réécrirait la base avec l'ancien mot de passe :
//   docker compose stop karthala360
//   docker compose run --rm -it karthala360 node scripts/mot-de-passe.js
//   docker compose start karthala360
const readline = require('readline');
const { init } = require('../db');
const securite = require('../securite');

// Saisie masquée : rien ne s'affiche à l'écran pendant la frappe
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let masquer = false;
const ecrire = rl._writeToOutput.bind(rl);
rl._writeToOutput = (t) => { if (!masquer || /\n/.test(t)) ecrire(masquer ? '\n' : t); };
// Lignes tapées gardées en file d'attente (rien n'est perdu si on tape avant la question)
const lignes = [], attentes = [];
rl.on('line', (l) => { masquer = false; (attentes.length ? attentes.shift() : (x) => lignes.push(x))(l.trim()); });
function demander(question, masque) {
  process.stdout.write(question);
  masquer = !!masque; // la question est affichée, la frappe ne l'est pas
  return new Promise((ok) => (lignes.length ? (masquer = false, ok(lignes.shift())) : attentes.push(ok)));
}

(async () => {
  const db = await init();
  const comptes = db.all('SELECT email, role FROM users ORDER BY id');
  console.log('Comptes du back office :');
  for (const c of comptes) console.log(`  - ${c.email} (${c.role})`);
  const email = (await demander(`E-mail du compte [${comptes[0].email}] : `)) || comptes[0].email;
  let u = db.get('SELECT id, email FROM users WHERE email=?', [email.toLowerCase()]);
  if (!u) {
    // E-mail inconnu : on propose de créer un nouveau compte administrateur
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.log('E-mail invalide.'); process.exit(1); }
    const oui = await demander(`Aucun compte avec cet e-mail. Créer un compte administrateur ${email.toLowerCase()} ? (o/n) : `);
    if (!/^o/i.test(oui)) process.exit(1);
    const nom = (await demander('Nom affiché [Administrateur] : ')) || 'Administrateur';
    u = { id: null, email: email.toLowerCase(), nom };
  }
  const mdp = await demander('Nouveau mot de passe (rien ne s\'affiche, c\'est normal) : ', true);
  const erreur = securite.erreurMotDePasse(mdp, db.MDP_PAR_DEFAUT, u.email);
  if (erreur) { console.log(erreur); process.exit(1); }
  if (mdp !== await demander('Retapez-le : ', true)) { console.log('Les deux mots de passe sont différents.'); process.exit(1); }
  if (!u.id) {
    db.run('INSERT INTO users (email,name,password_hash,role) VALUES (?,?,?,?)', [u.email, u.nom, db.hashPassword(mdp), 'admin']);
    db.run('INSERT INTO journal (utilisateur,action,cible) VALUES (?,?,?)', [u.email, 'compte administrateur créé (console du serveur)', '']);
    console.log(`Compte administrateur créé : ${u.email}. Relancez l'application : docker compose start karthala360`);
    process.exit(0);
  }
  db.run('UPDATE users SET password_hash=?, doit_changer=0 WHERE id=?', [db.hashPassword(mdp), u.id]);
  db.run('DELETE FROM sessions WHERE user_id=?', [u.id]);
  db.run('INSERT INTO journal (utilisateur,action,cible) VALUES (?,?,?)', [u.email, 'mot de passe réinitialisé (console du serveur)', '']);
  console.log(`Mot de passe changé pour ${u.email}. Relancez l'application : docker compose start karthala360`);
  process.exit(0);
})();
