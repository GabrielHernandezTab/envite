const socket = io();

const elements = {
  setupBox: document.getElementById('setup-box'),
  gameBox: document.getElementById('game-box'),
  roomCodeBadge: document.getElementById('room-code-badge'),
  playerName: document.getElementById('player-name'),
  roomCode: document.getElementById('room-code'),
  createRoomBtn: document.getElementById('create-room-btn'),
  joinRoomBtn: document.getElementById('join-room-btn'),
  spectateBtn: document.getElementById('spectate-btn'),
  teamABtn: document.getElementById('team-a-btn'),
  teamBBtn: document.getElementById('team-b-btn'),
  returnMenuBtn: document.getElementById('return-menu-btn'),
  closeRoomBtn: document.getElementById('close-room-btn'),
  statusText: document.getElementById('status-text'),
  scoreA: document.getElementById('score-a'),
  scoreB: document.getElementById('score-b'),
  chicosA: document.getElementById('chicos-a'),
  chicosB: document.getElementById('chicos-b'),
  roundText: document.getElementById('round-text'),
  resultText: document.getElementById('result-text'),
  playersGrid: document.getElementById('players-grid'),
  teamACount: document.getElementById('team-a-count'),
  teamBCount: document.getElementById('team-b-count'),
  teamAPlayers: document.getElementById('team-a-players'),
  teamBPlayers: document.getElementById('team-b-players'),
  seatPositions: document.getElementById('seat-positions'),
  visibleCard: document.getElementById('visible-card'),
  tableCards: document.getElementById('table-cards'),
  hand: document.getElementById('hand'),
  turnIndicator: document.getElementById('turn-indicator'),
  tumboPanel: document.getElementById('tumbo-panel'),
  tumboYesBtn: document.getElementById('tumbo-yes-btn'),
  tumboNoBtn: document.getElementById('tumbo-no-btn'),
  envitePanel: document.getElementById('envite-panel'),
  envite2Btn: document.getElementById('envite-2-btn'),
  envite4Btn: document.getElementById('envite-4-btn'),
  envite7Btn: document.getElementById('envite-7-btn'),
  envite9Btn: document.getElementById('envite-9-btn'),
  enviteChicoBtn: document.getElementById('envite-chico-btn'),
  betResponsePanel: document.getElementById('bet-response-panel'),
  betResponseText: document.getElementById('bet-response-text'),
  betAcceptBtn: document.getElementById('bet-accept-btn'),
  betRejectBtn: document.getElementById('bet-reject-btn'),
  betRaise4Btn: document.getElementById('bet-raise-4-btn'),
  betRaise7Btn: document.getElementById('bet-raise-7-btn'),
  betRaise9Btn: document.getElementById('bet-raise-9-btn'),
  betRaiseChicoBtn: document.getElementById('bet-raise-chico-btn')
};

let myPlayerId = null;
let myRole = 'player';
let currentRoomCode = '';

function getTeamLabel(team) {
  if (team === 0) return 'Equipo A';
  if (team === 1) return 'Equipo B';
  return 'Sin equipo';
}

function getSuitMeta(suit) {
  const map = {
    oros: { short: 'O', symbol: '♦', className: 'red', label: 'oros' },
    copas: { short: 'C', symbol: '♥', className: 'red', label: 'copas' },
    espadas: { short: 'E', symbol: '♠', className: 'black', label: 'espadas' },
    bastos: { short: 'B', symbol: '♣', className: 'black', label: 'bastos' }
  };

  return map[suit] || { short: '?', symbol: '?', className: 'black', label: suit };
}

function renderCardFace(card, compact = false) {
  const meta = getSuitMeta(card?.suit || 'oros');
  const el = document.createElement('div');
  el.className = `card-face ${meta.className}`;

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `<span class="card-number">${card?.label || '-'}</span><span class="card-suit-name">${meta.short}</span>`;

  const symbol = document.createElement('div');
  symbol.className = 'card-symbol';
  symbol.textContent = meta.symbol;

  const footer = document.createElement('div');
  footer.className = 'card-footer';
  footer.innerHTML = `<span class="card-suit-name">${meta.label}</span><span class="card-number">${card?.label || '-'}</span>`;

  el.appendChild(header);
  el.appendChild(symbol);
  el.appendChild(footer);

  if (compact) {
    el.style.transform = 'scale(0.85)';
  }

  return el;
}

function cardText(card) {
  if (!card) return '-';
  return `${card.label} de ${card.suit}`;
}

function renderHand(hand, room) {
  elements.hand.innerHTML = '';

  if (!Array.isArray(hand) || hand.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'mini-card';
    empty.textContent = 'Sin cartas';
    elements.hand.appendChild(empty);
    return;
  }

  hand.forEach((card) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card-btn';
    btn.disabled = room?.game?.turnPlayerId !== myPlayerId || myRole !== 'player';
    btn.appendChild(renderCardFace(card));

    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      socket.emit('play-card', { cardId: card.id });
    });

    elements.hand.appendChild(btn);
  });
}

function renderTableCards(playedCards, players) {
  elements.tableCards.innerHTML = '';

  if (!Array.isArray(playedCards) || playedCards.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'table-card';
    empty.textContent = 'No hay cartas sobre la mesa';
    elements.tableCards.appendChild(empty);
    return;
  }

  playedCards.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'table-card';

    const player = players.find((p) => p.id === entry.playerId);
    const mini = renderCardFace(entry.card, true);
    mini.style.width = '50px';
    mini.style.height = '72px';
    mini.style.display = 'inline-block';

    const label = document.createElement('div');
    label.textContent = `${player?.name || 'Jugador'}: ${entry.card.label} de ${entry.card.suit}`;
    item.appendChild(mini);
    item.appendChild(label);
    elements.tableCards.appendChild(item);
  });
}

function renderSeatPositions(players) {
  if (!elements.seatPositions) return;

  elements.seatPositions.innerHTML = '';
  const orderedPlayers = [...players].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
  const reserved = orderedPlayers.length ? orderedPlayers : Array.from({ length: 4 }, (_, index) => ({ name: `Jugador ${index + 1}`, team: null, seat: index }));

  const seatPositions = [
    { className: 'seat seat-top-left', angle: 'top-left' },
    { className: 'seat seat-top-right', angle: 'top-right' },
    { className: 'seat seat-bottom-left', angle: 'bottom-left' },
    { className: 'seat seat-bottom-right', angle: 'bottom-right' }
  ];

  reserved.slice(0, 4).forEach((player, index) => {
    const seat = document.createElement('div');
    const seatDef = seatPositions[index] || seatPositions[0];
    seat.className = `seat ${seatDef.className}`;
    seat.innerHTML = `
      <div class="seat-avatar">${(player.name || 'Libre').charAt(0).toUpperCase()}</div>
      <div class="seat-name">${player.name || 'Libre'}</div>
      <div class="seat-team">${player.team === 0 ? 'Equipo A' : player.team === 1 ? 'Equipo B' : 'Esperando'}</div>
    `;
    elements.seatPositions.appendChild(seat);
  });
}

function renderPlayers(players, room) {
  elements.playersGrid.innerHTML = '';
  elements.teamAPlayers.innerHTML = '';
  elements.teamBPlayers.innerHTML = '';
  renderSeatPositions(players);

  const teamA = players.filter((player) => player.team === 0);
  const teamB = players.filter((player) => player.team === 1);

  elements.teamACount.textContent = `${teamA.length} / 2`;
  elements.teamBCount.textContent = `${teamB.length} / 2`;

  [teamA, teamB].forEach((teamPlayers, teamIndex) => {
    const list = teamIndex === 0 ? elements.teamAPlayers : elements.teamBPlayers;

    if (teamPlayers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'team-player-item empty';
      empty.textContent = 'Sin jugadores';
      list.appendChild(empty);
      return;
    }

    teamPlayers.forEach((player) => {
      const item = document.createElement('div');
      item.className = 'team-player-item';
      item.innerHTML = `
        <span class="team-player-name">${player.name}</span>
        <span class="team-player-role">${player.id === myPlayerId ? 'Tú' : 'Jugador'}</span>
      `;
      list.appendChild(item);
    });
  });

  players.forEach((player) => {
    const card = document.createElement('div');
    card.className = 'player-card';
    if (player.team === 0) card.style.borderColor = 'rgba(122, 229, 130, 0.5)';
    if (player.team === 1) card.style.borderColor = 'rgba(255, 122, 122, 0.5)';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = player.id === myPlayerId ? 'Tú' : player.id ? 'Jugador' : 'Espectador';

    const name = document.createElement('div');
    name.textContent = player.name;

    const team = document.createElement('div');
    team.className = 'label';
    team.textContent = getTeamLabel(player.team);

    const status = document.createElement('div');
    status.className = 'label';
    status.textContent = player.team === null ? 'Sin equipo' : 'En equipo';

    const handMini = document.createElement('div');
    handMini.className = 'hand-mini';

    if (Array.isArray(player.hand) && player.hand.length > 0) {
      player.hand.forEach((cardEntry) => {
        const mini = document.createElement('span');
        mini.className = 'mini-card';
        const meta = getSuitMeta(cardEntry.suit || 'oros');
        mini.innerHTML = `<span>${cardEntry.label}</span><span>${meta.symbol}</span>`;
        handMini.appendChild(mini);
      });
    } else {
      const mini = document.createElement('span');
      mini.className = 'mini-card';
      mini.textContent = player.id === myPlayerId ? 'Sin mano' : 'Oculta';
      handMini.appendChild(mini);
    }

    card.append(label, name, team, status, handMini);
    elements.playersGrid.appendChild(card);
  });
}

function renderVisibleCard(card) {
  if (!card) {
    elements.visibleCard.innerHTML = `
      <div class="card-header"><span class="card-number">-</span><span class="card-suit-name">-</span></div>
      <div class="card-symbol">-</div>
      <div class="card-footer"><span class="card-suit-name">-</span><span class="card-number">-</span></div>
    `;
    return;
  }

  const meta = getSuitMeta(card.suit);
  elements.visibleCard.className = `card-face ${meta.className}`;
  elements.visibleCard.innerHTML = `
    <div class="card-header"><span class="card-number">${card.label}</span><span class="card-suit-name">${meta.short}</span></div>
    <div class="card-symbol">${meta.symbol}</div>
    <div class="card-footer"><span class="card-suit-name">${meta.label}</span><span class="card-number">${card.label}</span></div>
  `;
}

function updateRoom(room) {
  if (!room) return;

  currentRoomCode = room.code;
  elements.roomCodeBadge.textContent = `Sala: ${room.code}`;
  elements.roomCode.value = room.code;
  elements.scoreA.textContent = String(room.game?.scores?.[0] ?? 0);
  elements.scoreB.textContent = String(room.game?.scores?.[1] ?? 0);
  elements.chicosA.textContent = `Chicos: ${room.game?.chicos?.[0] ?? 0}`;
  elements.chicosB.textContent = `Chicos: ${room.game?.chicos?.[1] ?? 0}`;

  const players = room.players || [];
  const myPlayer = players.find((player) => player.id === myPlayerId) || null;
  const myHand = myPlayer?.hand || [];
  renderHand(myHand, room);
  renderTableCards(room.game?.playedCards || [], players);
  renderPlayers(players, room);

  if (room.game) {
    renderVisibleCard(room.game.visibleCard);
    const isTumbo = room.game.status === 'tumbo';
    const currentTeamCanSend = myPlayer && myPlayer.team !== null && room.game.status === 'playing' && !room.game.pendingBet;
    const isBetTarget = myPlayer && myPlayer.team !== null && room.game.pendingBet && room.game.pendingBet.targetTeam === myPlayer.team;

    elements.tumboPanel.classList.toggle('hidden', !isTumbo || myPlayer?.team !== room.game.tumboTeam);
    elements.envitePanel.classList.toggle('hidden', !currentTeamCanSend);
    elements.betResponsePanel.classList.toggle('hidden', !isBetTarget);

    if (room.game.pendingBet && isBetTarget) {
      const levelLabel = room.game.pendingBet.level === 'chico-fuera' ? 'chico fuera' : `${room.game.pendingBet.level}`;
      elements.betResponseText.textContent = `Han enviado ${levelLabel}. ¿aceptas?`;
    }

    elements.statusText.textContent = room.game.status === 'finished' ? 'Partida finalizada' : isTumbo ? 'Tumbo en juego' : 'Partida en marcha';
    elements.roundText.textContent = `Ronda ${Math.min(room.game.round, room.game.maxRounds)} de ${room.game.maxRounds}`;

    if (room.game.turnPlayerId === myPlayerId && myRole === 'player') {
      elements.turnIndicator.textContent = 'Es tu turno';
    } else if (myRole === 'spectator') {
      elements.turnIndicator.textContent = 'Modo espectador';
    } else {
      const name = players.find((player) => player.id === room.game.turnPlayerId)?.name || 'Otro';
      elements.turnIndicator.textContent = `Turno de ${name}`;
    }

    if (room.game.status === 'finished') {
      const winner = room.game.finalWinner;
      if (winner === 'empate') {
        elements.resultText.textContent = `Resultado final: empate ${room.game.scores[0]} - ${room.game.scores[1]}`;
      } else {
        elements.resultText.textContent = `Resultado final: ${winner === 0 ? 'Equipo A' : 'Equipo B'} gana ${room.game.scores[0]} - ${room.game.scores[1]}`;
      }
    } else if (room.game.status === 'tumbo') {
      const team = room.game.tumboTeam === 0 ? 'Equipo A' : 'Equipo B';
      elements.resultText.textContent = `${team} está en tumbo: tiene 11 piedras y debe decidir si acepta o se achica.`;
    } else if (room.players.length < 4) {
      elements.resultText.textContent = 'Esperando a que haya 4 jugadores para empezar.';
    } else if (room.players.some((player) => player.team === null)) {
      elements.resultText.textContent = 'Cada jugador debe elegir su equipo.';
    } else {
      elements.resultText.textContent = 'La partida ha empezado. Haz tu jugada.';
    }
  } else {
    renderVisibleCard(null);
    elements.tumboPanel.classList.add('hidden');
    elements.statusText.textContent = 'Esperando jugadores';
    elements.roundText.textContent = 'Ronda 1 de 3';
    elements.resultText.textContent = room.players.length >= 4
      ? 'Todos los jugadores están en la sala. Elige equipo para empezar.'
      : 'Necesitas 4 jugadores para iniciar la partida.';
  }

  const isRoomOwner = room.ownerId === myPlayerId;
  elements.closeRoomBtn.style.display = isRoomOwner ? 'inline-flex' : 'none';
  elements.returnMenuBtn.style.display = 'inline-flex';

  elements.teamABtn.style.display = myPlayer && myPlayer.team === null ? 'inline-flex' : 'none';
  elements.teamBBtn.style.display = myPlayer && myPlayer.team === null ? 'inline-flex' : 'none';
  elements.teamABtn.disabled = room.players.filter((player) => player.team === 0).length >= 2;
  elements.teamBBtn.disabled = room.players.filter((player) => player.team === 1).length >= 2;

  if (!room.code) {
    elements.setupBox.classList.remove('hidden');
    elements.gameBox.classList.add('hidden');
  } else {
    elements.setupBox.classList.add('hidden');
    elements.gameBox.classList.remove('hidden');
  }
}

function createRoom() {
  const name = elements.playerName.value.trim() || 'Jugador';
  socket.emit('create-room', { name });
}

function joinRoom() {
  const name = elements.playerName.value.trim() || 'Jugador';
  const code = elements.roomCode.value.trim().toUpperCase();
  if (!code) {
    elements.resultText.textContent = 'Escribe el código de la sala.';
    return;
  }
  socket.emit('join-room', { roomCode: code, name });
}

function spectateRoom() {
  const name = elements.playerName.value.trim() || 'Espectador';
  const code = elements.roomCode.value.trim().toUpperCase();
  if (!code) {
    elements.resultText.textContent = 'Escribe el código para espectar.';
    return;
  }
  socket.emit('spectate-room', { roomCode: code, name });
}

function leaveRoom() {
  socket.emit('return-to-lobby');
  myPlayerId = null;
  myRole = 'player';
  currentRoomCode = '';
  elements.roomCode.value = '';
  elements.setupBox.classList.remove('hidden');
  elements.gameBox.classList.add('hidden');
  elements.resultText.textContent = 'Has vuelto a la pantalla principal.';
}

elements.createRoomBtn.addEventListener('click', createRoom);
elements.joinRoomBtn.addEventListener('click', joinRoom);
elements.spectateBtn.addEventListener('click', spectateRoom);
elements.returnMenuBtn.addEventListener('click', () => {
  socket.emit('return-to-lobby');
  myPlayerId = null;
  myRole = 'player';
  currentRoomCode = '';
  elements.roomCode.value = '';
  elements.setupBox.classList.remove('hidden');
  elements.gameBox.classList.add('hidden');
});
elements.teamABtn.addEventListener('click', () => socket.emit('select-team', { team: 0 }));
elements.teamBBtn.addEventListener('click', () => socket.emit('select-team', { team: 1 }));
elements.tumboYesBtn.addEventListener('click', () => socket.emit('tumbo-decision', { accept: true }));
elements.tumboNoBtn.addEventListener('click', () => socket.emit('tumbo-decision', { accept: false }));
elements.envite2Btn.addEventListener('click', () => socket.emit('send-bet', { level: 2 }));
elements.envite4Btn.addEventListener('click', () => socket.emit('send-bet', { level: 4 }));
elements.envite7Btn.addEventListener('click', () => socket.emit('send-bet', { level: 7 }));
elements.envite9Btn.addEventListener('click', () => socket.emit('send-bet', { level: 9 }));
elements.enviteChicoBtn.addEventListener('click', () => socket.emit('send-bet', { level: 'chico-fuera' }));
elements.betAcceptBtn.addEventListener('click', () => socket.emit('bet-response', { accept: true }));
elements.betRejectBtn.addEventListener('click', () => socket.emit('bet-response', { accept: false }));
elements.betRaise4Btn?.addEventListener('click', () => socket.emit('bet-response', { accept: 'raise', level: 4 }));
elements.betRaise7Btn?.addEventListener('click', () => socket.emit('bet-response', { accept: 'raise', level: 7 }));
elements.betRaise9Btn?.addEventListener('click', () => socket.emit('bet-response', { accept: 'raise', level: 9 }));
elements.betRaiseChicoBtn?.addEventListener('click', () => socket.emit('bet-response', { accept: 'raise', level: 'chico-fuera' }));
elements.closeRoomBtn.addEventListener('click', () => {
  socket.emit('close-room');
});

socket.on('joined-room', ({ code, role }) => {
  myPlayerId = socket.id;
  myRole = role || 'player';
  currentRoomCode = code;
  elements.roomCode.value = code;
  elements.roomCodeBadge.textContent = `Sala: ${code}`;
  elements.setupBox.classList.add('hidden');
  elements.gameBox.classList.remove('hidden');
});

socket.on('room-state', (room) => {
  updateRoom(room);
});

socket.on('join-error', (message) => {
  elements.resultText.textContent = message;
});

socket.on('room-closed', () => {
  leaveRoom();
});
