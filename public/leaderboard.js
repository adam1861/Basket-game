const list = document.getElementById('leaderboard-list');
let scores = [];
try { scores = JSON.parse(localStorage.getItem('hand-pong-leaderboard')) || []; } catch { /* Storage is optional. */ }
scores = scores.filter((entry) => entry && typeof entry.name === 'string' && typeof entry.promo === 'string' && Number.isFinite(Number(entry.score)))
  .sort((a, b) => Number(b.score) - Number(a.score) || a.name.localeCompare(b.name)).slice(0, 10);
if (scores.length) {
  list.replaceChildren(...scores.map((entry, index) => {
    const item = document.createElement('li');
    const rank = document.createElement('strong'); rank.className = 'rank'; rank.textContent = String(index + 1).padStart(2, '0');
    const identity = document.createElement('span'); identity.className = 'identity';
    const name = document.createElement('b'); name.textContent = entry.name;
    const promo = document.createElement('small'); promo.textContent = entry.promo;
    identity.append(name, promo);
    const points = document.createElement('strong'); points.className = 'points'; points.textContent = entry.score;
    item.append(rank, identity, points); return item;
  }));
}
