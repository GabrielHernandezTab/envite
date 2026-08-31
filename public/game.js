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
  roundText: document.getElementById('round-text'),
  resultText: document.getElementById('result-text'),
  playersGrid: document.getElementById('players-grid'),
  visibleCard: document.getElementById('visible-card'),
  hand: document.getElementById('hand'),
  turnIndicator: document.getElementById('turn-indicator')
};

let myPlayerId = null;
let myRole = 'player';
let currentRoomCode = '';

function getTeamLabel(team) {
  if (team === 0) return 'Equipo A';
  if (team === 1) return 'Equipo B';
  return 'Sin equipo';
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
    btn.textContent = cardText(card);
    btn.disabled = room?.game?.turnPlayerId !== myPlayerId || myRole !== 'player';
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      socket.emit('play-card', { cardId: card.id });
    });
    elements.hand.appendChild(btn);
  });
}

function renderPlayers(players, room) {
  elements.playersGrid.innerHTML = '';

  players.forEach((player) => {
    const card = document.createElement('div');
    card.className = 'player-card';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = player.id === myPlayerId ? 'Tú' : player.id ? 'Jugador' : 'Espectador';

    const name = document.createElement('div');
    name.textContent = player.name;

    const team = document.createElement('div');
    team.className = 'label';
    team.textContent = getTeamLabel(player.team);

    const handMini = document.createElement('div');
    handMini.className = 'hand-mini';

    if (Array.isArray(player.hand) && player.hand.length > 0) {
      player.hand.forEach((card) => {
        const mini = document.createElement('span');
        mini.className = 'mini-card';
        mini.textContent = `${card.label}`;
        handMini.appendChild(mini);
      });
    } else {
      const mini = document.createElement('span');
      mini.className = 'mini-card';
      mini.textContent = 'Sin mano';
      handMini.appendChild(mini);
    }

    card.append(label, name, team, handMini);
    elements.playersGrid.appendChild(card);
  });
}

function updateRoom(room) {
  if (!room) return;

  currentRoomCode = room.code;
  elements.roomCodeBadge.textContent = `Sala: ${room.code}`;
  elements.roomCode.value = room.code;
  elements.scoreA.textContent = String(room.game?.scores?.[0] ?? 0);
  elements.scoreB.textContent = String(room.game?.scores?.[1] ?? 0);

  const players = room.players || [];
  const myPlayer = players.find((player) => player.id === myPlayerId) || null;
  const myHand = myPlayer?.hand || [];
  renderHand(myHand, room);
  renderPlayers(players, room);

  if (room.game) {
    elements.visibleCard.textContent = room.game.visibleCard ? `${room.game.visibleCard.label} de ${room.game.visibleCard.suit}` : '-';
    elements.statusText.textContent = room.game.status === 'finished' ? 'Partida finalizada' : 'Partida en marcha';
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
    } else if (room.players.length < 4) {
      elements.resultText.textContent = 'Esperando a que haya 4 jugadores para empezar.';
    } else if (room.players.some((player) => player.team === null)) {
      elements.resultText.textContent = 'Cada jugador debe elegir su equipo.';
    } else {
      elements.resultText.textContent = 'La partida ha empezado. Haz tu jugada.';
    }
  } else {
    elements.visibleCard.textContent = '-';
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
