// Nouveau mot de passe pour un compte du back office (mot de passe oublié).
// À lancer application arrêtée, sinon elle réécrirait la base avec l'ancien mot de passe :
//   docker compose stop karthala360
//   docker compose run --rm -it karthala360 node scripts/mot-de-passe.js
//   docker compose start karthala360
const readline = require('readline');
const { init } = require('../db');
const securite = require('../securite');

// Saisie masquée : rien ne s'affiche à l'écran pendant la frappe
function demander(question, masque) {
  return new Promise((ok) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (masque) rl._writeToOutput = (t) => { if (t.includes(question)) process.stdout.write(t); };
    rl.question(question, (r) => { rl.close(); if (masque) process.stdout.write('\n'); ok(r.trim()); });
  });
}

(async () => {
  const db = await init();
  const comptes = db.all('SELECT email, role FROM users ORDER BY id');
  console.log('Comptes du back office :');
  for (const c of comptes) console.log(`  - ${c.email} (${c.role})`);
  const email = (await demander(`E-mail du compte [${comptes[0].email}] : `)) || comptes[0].email;
  const u = db.get('SELECT id, email FROM users WHERE email=?', [email.toLowerCase()]);
  if (!u) { console.log('Aucun compte avec cet e-mail.'); process.exit(1); }
  const mdp = await demander('Nouveau mot de passe (rien ne s\'affiche, c\'est normal) : ', true);
  const erreur = securite.erreurMotDePasse(mdp, db.MDP_PAR_DEFAUT, u.email);
  if (erreur) { console.log(erreur); process.exit(1); }
  if (mdp !== await demander('Retapez-le : ', true)) { console.log('Les deux mots de passe sont différents.'); process.exit(1); }
  db.run('UPDATE users SET password_hash=?, doit_changer=0 WHERE id=?', [db.hashPassword(mdp), u.id]);
  db.run('DELETE FROM sessions WHERE user_id=?', [u.id]);
  db.run('INSERT INTO journal (utilisateur,action,cible) VALUES (?,?,?)', [u.email, 'mot de passe réinitialisé (console du serveur)', '']);
  console.log(`Mot de passe changé pour ${u.email}. Relancez l'application : docker compose start karthala360`);
  process.exit(0);
})();
