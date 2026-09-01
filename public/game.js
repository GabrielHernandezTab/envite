const socket = io();

const elements = {
  setupBox: document.getElementById('setup-box'),
  gameBox: document.getElementById('game-box'),
  roomCodeBadge: document.getElementById('room-code-badge'),
  playerName: document.getElementById('player-name'),
  roomCode: document.getElementById('room-code'),
  gameModeSelect: document.getElementById('game-mode'),
  createRoomBtn: document.getElementById('create-room-btn'),
  joinRoomBtn: document.getElementById('join-room-btn'),
  spectateBtn: document.getElementById('spectate-btn'),
  teamABtn: document.getElementById('team-a-btn'),
  teamBBtn: document.getElementById('team-b-btn'),
  mandadorBtn: document.getElementById('mandador-btn'),
  mandadoBtn: document.getElementById('mandado-btn'),
  roleSelectionModal: document.getElementById('role-selection-modal'),
  renounceRoundBtn: document.getElementById('renounce-round-btn'),
  abandonRoundBtn: document.getElementById('abandon-round-btn'),
  returnMenuBtn: document.getElementById('return-menu-btn'),
  closeRoomBtn: document.getElementById('close-room-btn'),
  gameFinishedModal: document.getElementById('game-finished-modal'),
  gameFinishedText: document.getElementById('game-finished-text'),
  playAgainBtn: document.getElementById('play-again-btn'),
  closeFinishedRoomBtn: document.getElementById('close-finished-room-btn'),
  statusText: document.getElementById('status-text'),
  scoreA: document.getElementById('score-a'),
  scoreB: document.getElementById('score-b'),
  chicosA: document.getElementById('chicos-a'),
  chicosB: document.getElementById('chicos-b'),
  roundText: document.getElementById('round-text'),
  resultText: document.getElementById('result-text'),
  playersGrid: document.getElementById('players-grid'),
  teamChatPanel: document.getElementById('team-chat-panel'),
  teamChatLabel: document.getElementById('team-chat-label'),
  teamChatMessages: document.getElementById('team-chat-messages'),
  teamChatForm: document.getElementById('team-chat-form'),
  teamChatInput: document.getElementById('team-chat-input'),
  teamACount: document.getElementById('team-a-count'),
  teamBCount: document.getElementById('team-b-count'),
  teamAPlayers: document.getElementById('team-a-players'),
  teamBPlayers: document.getElementById('team-b-players'),
  seatPositions: document.getElementById('seat-positions'),
  visibleCard: document.getElementById('visible-card'),
  tableCards: document.getElementById('table-cards'),
  hand: document.getElementById('hand'),
  handPanel: document.getElementById('hand-panel'),
  faceDownBtn: document.getElementById('face-down-btn'),
  historyList: document.getElementById('history-list'),
  turnIndicator: document.getElementById('turn-indicator'),
  tumboPanel: document.getElementById('tumbo-panel'),
  tumboYesBtn: document.getElementById('tumbo-yes-btn'),
  tumboNoBtn: document.getElementById('tumbo-no-btn'),
  envitePanel: document.getElementById('envite-panel'),
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
let playFaceDown = false;

function getTeamLabel(team) {
  if (team === 0) return 'Equipo A';
  if (team === 1) return 'Equipo B';
  return 'Sin equipo';
}

function getSuitMeta(suit) {
  const map = {
    oros: { short: 'O', symbol: '♦', symbolClass: 'oros', className: 'red', label: 'oros' },
    copas: { short: 'C', symbol: '♥', symbolClass: 'copas', className: 'red', label: 'copas' },
    espadas: { short: 'E', symbol: '♠', symbolClass: 'espadas', className: 'black', label: 'espadas' },
    bastos: { short: 'B', symbol: '♣', symbolClass: 'bastos', className: 'black', label: 'bastos' }
  };

  return map[suit] || { short: '?', symbol: '?', symbolClass: 'unknown', className: 'black', label: suit };
}

function renderCardFace(card, compact = false) {
  const meta = getSuitMeta(card?.suit || 'oros');
  const el = document.createElement('div');
  el.className = `card-face ${meta.className}`;

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `<span class="card-number">${card?.label || '-'}</span>`;

  const symbol = document.createElement('div');
  symbol.className = `card-symbol suit-symbol ${meta.symbolClass}`;

  const suitIcon = document.createElement('span');
  suitIcon.className = 'suit-icon';
  suitIcon.textContent = meta.symbol;
  symbol.appendChild(suitIcon);

  const footer = document.createElement('div');
  footer.className = 'card-footer';
  footer.innerHTML = `<span class="card-suit-name">${meta.label}</span>`;

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
      socket.emit('play-card', { cardId: card.id, faceDown: playFaceDown });
      playFaceDown = false;
      elements.faceDownBtn.textContent = 'Jugar carta boca abajo: no';
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
    const mini = entry.faceDown ? document.createElement('div') : renderCardFace(entry.card, true);
    if (entry.faceDown) {
      mini.className = 'card-back';
      mini.textContent = '?';
    }
    mini.style.width = '50px';
    mini.style.height = '72px';
    mini.style.display = 'inline-block';

    const label = document.createElement('div');
    label.textContent = entry.faceDown
      ? `${player?.name || 'Jugador'}: carta boca abajo`
      : `${player?.name || 'Jugador'}: ${entry.card.label} de ${entry.card.suit}`;
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
    { className: 'seat seat-bottom-right', angle: 'bottom-right' },
    { className: 'seat seat-top-left', angle: 'top-left' },
    { className: 'seat seat-top-right', angle: 'top-right' }
  ];

  reserved.slice(0, Math.max(4, reserved.length)).forEach((player, index) => {
    const seat = document.createElement('div');
    const seatDef = seatPositions[index] || seatPositions[index % seatPositions.length];
    seat.className = `seat ${seatDef.className}`;
    if (index >= 4) {
      seat.style.top = index === 4 ? '18%' : '18%';
      seat.style.left = index === 4 ? '50%' : '72%';
      seat.style.transform = 'translateX(-50%)';
    }
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
  const teamSize = getTeamSizeForMode(room?.mode || '2v2');

  elements.teamACount.textContent = `${teamA.length} / ${teamSize}`;
  elements.teamBCount.textContent = `${teamB.length} / ${teamSize}`;

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
    team.textContent = `${getTeamLabel(player.team)} · ${player.role || 'Rol pendiente'}`;

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
      <div class="card-header"><span class="card-number">-</span></div>
      <div class="card-symbol">-</div>
      <div class="card-footer"><span class="card-suit-name">-</span></div>
    `;
    return;
  }

  const rendered = renderCardFace(card);
  elements.visibleCard.className = rendered.className;
  elements.visibleCard.replaceChildren(...rendered.childNodes);
}

function renderHistory(history, players) {
  elements.historyList.innerHTML = '';
  const handHistory = (history || []).filter((entry) => entry.trick && entry.winnerTeam !== undefined);

  if (!handHistory.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Todavía no se ha jugado ninguna mano.';
    elements.historyList.appendChild(empty);
    return;
  }

  handHistory.slice(-9).forEach((entry) => {
    const item = document.createElement('div');
    item.className = `history-item team-${entry.winnerTeam === 0 ? 'a' : 'b'}`;
    const winnerName = entry.winnerPlayer || players.find((player) => player.team === entry.winnerTeam)?.name || 'Equipo';
    const handNumber = entry.handWins?.[0] + entry.handWins?.[1] || 1;
    item.innerHTML = `
      <strong>Mano ${handNumber}</strong>
      <span>${winnerName} · Equipo ${entry.winnerTeam === 0 ? 'A' : 'B'}</span>
      <span>Ganó con ${entry.winningCard || 'carta desconocida'}</span>
      <small>${entry.scoreAfter?.[0] ?? 0} - ${entry.scoreAfter?.[1] ?? 0} puntos</small>
    `;
    elements.historyList.appendChild(item);
  });
}

function renderTeamChat(messages, player) {
  const canChat = myRole === 'player' && player?.team !== null && player?.team !== undefined;
  elements.teamChatPanel.classList.toggle('hidden', !canChat);
  if (!canChat) return;

  elements.teamChatLabel.textContent = `Equipo ${player.team === 0 ? 'A' : 'B'} · solo compañeros`;
  elements.teamChatMessages.innerHTML = '';
  (messages || []).forEach((message) => {
    const item = document.createElement('div');
    item.className = `team-chat-message${message.playerId === myPlayerId ? ' own' : ''}`;
    const meta = document.createElement('div');
    meta.className = 'team-chat-meta';
    meta.textContent = message.playerId === myPlayerId ? 'Tú' : message.playerName;
    const text = document.createElement('div');
    text.className = 'team-chat-text';
    text.textContent = message.text;
    item.append(meta, text);
    elements.teamChatMessages.appendChild(item);
  });
  elements.teamChatMessages.scrollTop = elements.teamChatMessages.scrollHeight;
}

function getRequiredPlayersForMode(mode) {
  return mode === '3v3' ? 6 : 4;
}

function getTeamSizeForMode(mode) {
  return mode === '3v3' ? 3 : 2;
}

function updateRoom(room) {
  if (!room) return;

  const mode = room.mode || '2v2';
  const requiredPlayers = getRequiredPlayersForMode(mode);
  const teamSize = getTeamSizeForMode(mode);

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
  elements.roleSelectionModal.classList.toggle('hidden', !myPlayer || myPlayer.team === null || myPlayer.role !== null);
  elements.handPanel.classList.toggle('hidden', !room.game);
  elements.faceDownBtn.textContent = `Jugar carta boca abajo: ${playFaceDown ? 'sí' : 'no'}`;
  renderHand(myHand, room);
  renderTableCards(room.game?.playedCards || [], players);
  renderPlayers(players, room);
  renderHistory(room.game?.history || [], players);
  renderTeamChat(room.teamChats?.[myPlayer?.team] || [], myPlayer);

  if (room.game) {
    renderVisibleCard(room.game.visibleCard);
    const isTumbo = room.game.status === 'tumbo';
    const currentTeamCanSend = myPlayer && myPlayer.role === 'mandador' && myPlayer.team !== null && room.game.status === 'playing'
      && !room.game.pendingBet && !room.game.betUsedThisRound && room.game.nextBetLevel !== null && room.game.nextBetLevel !== undefined
      && room.game.lastBetTeam !== myPlayer.team;
    const isBetTarget = myPlayer && myPlayer.role === 'mandador' && myPlayer.team !== null
      && room.game.pendingBet && room.game.pendingBet.targetTeam === myPlayer.team;

    elements.tumboPanel.classList.toggle('hidden', !isTumbo || myPlayer?.role !== 'mandador' || myPlayer?.team !== room.game.tumboTeam);
    elements.envitePanel.classList.toggle('hidden', !currentTeamCanSend);
    elements.betResponsePanel.classList.toggle('hidden', !isBetTarget);

    [elements.envite4Btn, elements.envite7Btn, elements.envite9Btn, elements.enviteChicoBtn].forEach((button) => {
      button.classList.add('hidden');
    });
    const sendButtons = {
      4: elements.envite4Btn,
      7: elements.envite7Btn,
      9: elements.envite9Btn,
      'chico-fuera': elements.enviteChicoBtn
    };
    sendButtons[room.game.nextBetLevel]?.classList.remove('hidden');

    [elements.betRaise4Btn, elements.betRaise7Btn, elements.betRaise9Btn, elements.betRaiseChicoBtn].forEach((button) => {
      button?.classList.add('hidden');
    });
    const raiseButtons = {
      4: elements.betRaise4Btn,
      7: elements.betRaise7Btn,
      9: elements.betRaise9Btn,
      'chico-fuera': elements.betRaiseChicoBtn
    };
    if (isBetTarget) {
      raiseButtons[room.game.nextBetLevel]?.classList.remove('hidden');
    }

    if (room.game.pendingBet && isBetTarget) {
      const levelLabel = room.game.pendingBet.level === 'chico-fuera' ? 'chico fuera' : `${room.game.pendingBet.level}`;
      elements.betResponseText.textContent = `Envío a ${levelLabel}. ¿Quieres jugar, subirlo o rechazarlo?`;
    }

    elements.statusText.textContent = room.game.status === 'finished'
      ? 'Partida finalizada'
      : room.game.status === 'trick-result'
        ? 'Mano terminada'
        : isTumbo ? 'Tumbo en juego' : 'Partida en marcha';
    elements.roundText.textContent = `Ronda ${room.game.round} · hasta 3 chicos`;

    if (room.game.turnPlayerId === myPlayerId && myRole === 'player') {
      elements.turnIndicator.textContent = 'Es tu turno';
    } else if (myRole === 'spectator') {
      elements.turnIndicator.textContent = 'Modo espectador';
    } else if (room.game.status === 'trick-result') {
      elements.turnIndicator.textContent = 'Mostrando resultado';
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
      const isRoomOwner = room.ownerId === myPlayerId;
      elements.gameFinishedModal.classList.toggle('hidden', !isRoomOwner);
      elements.gameFinishedText.textContent = winner === 0
        ? `Equipo A ha ganado ${room.game.chicos[0]} chicos.`
        : `Equipo B ha ganado ${room.game.chicos[1]} chicos.`;
    } else if (room.game.status === 'trick-result') {
      elements.resultText.textContent = 'Revisad las cartas: la siguiente mano comenzará en un momento.';
    } else if (room.game.status === 'tumbo') {
      elements.gameFinishedModal.classList.add('hidden');
      const team = room.game.tumboTeam === 0 ? 'Equipo A' : 'Equipo B';
      elements.resultText.textContent = `${team} está en tumbo: tiene 11 piedras y debe decidir si acepta o se achica.`;
    } else if (room.players.length < requiredPlayers) {
      elements.resultText.textContent = `Esperando a que haya ${requiredPlayers} jugadores para empezar.`;
    } else if (room.players.some((player) => player.team === null)) {
      elements.resultText.textContent = 'Cada jugador debe elegir su equipo.';
    } else {
      elements.gameFinishedModal.classList.add('hidden');
      elements.resultText.textContent = 'La partida ha empezado. Haz tu jugada.';
    }
  } else {
    elements.gameFinishedModal.classList.add('hidden');
    renderVisibleCard(null);
    elements.tumboPanel.classList.add('hidden');
    elements.statusText.textContent = 'Esperando jugadores';
    elements.roundText.textContent = 'Ronda 1 · hasta 3 chicos';
    elements.resultText.textContent = room.players.length >= requiredPlayers
      ? 'Todos los jugadores están en la sala. Elige equipo para empezar.'
      : `Necesitas ${requiredPlayers} jugadores para iniciar la partida.`;
  }

  const isRoomOwner = room.ownerId === myPlayerId;
  elements.closeRoomBtn.style.display = isRoomOwner ? 'inline-flex' : 'none';
  elements.abandonRoundBtn.style.display = room.game?.status === 'playing' ? 'inline-flex' : 'none';
  elements.renounceRoundBtn.style.display = room.game?.status === 'playing' && myPlayer?.role === 'mandador' ? 'inline-flex' : 'none';
  elements.returnMenuBtn.style.display = 'inline-flex';

  const teamAFull = room.players.filter((player) => player.team === 0).length >= teamSize;
  const teamBFull = room.players.filter((player) => player.team === 1).length >= teamSize;

  elements.teamABtn.style.display = myPlayer && myPlayer.team === null ? 'inline-flex' : 'none';
  elements.teamBBtn.style.display = myPlayer && myPlayer.team === null ? 'inline-flex' : 'none';
  elements.teamABtn.disabled = teamAFull;
  elements.teamBBtn.disabled = teamBFull;
  elements.teamABtn.title = teamAFull ? 'Este equipo ya está completo' : 'Seleccionar equipo A';
  elements.teamBBtn.title = teamBFull ? 'Este equipo ya está completo' : 'Seleccionar equipo B';

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
  const mode = elements.gameModeSelect.value === '3v3' ? '3v3' : '2v2';
  socket.emit('create-room', { name, mode });
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
elements.mandadorBtn.addEventListener('click', () => socket.emit('select-role', { role: 'mandador' }));
elements.mandadoBtn.addEventListener('click', () => socket.emit('select-role', { role: 'mandado' }));
elements.abandonRoundBtn.addEventListener('click', () => socket.emit('abandon-round'));
elements.renounceRoundBtn.addEventListener('click', () => socket.emit('renounce-round'));
elements.faceDownBtn.addEventListener('click', () => {
  playFaceDown = !playFaceDown;
  elements.faceDownBtn.textContent = `Jugar carta boca abajo: ${playFaceDown ? 'sí' : 'no'}`;
});
elements.tumboYesBtn.addEventListener('click', () => socket.emit('tumbo-decision', { accept: true }));
elements.tumboNoBtn.addEventListener('click', () => socket.emit('tumbo-decision', { accept: false }));
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
elements.closeFinishedRoomBtn.addEventListener('click', () => {
  socket.emit('close-room');
});
elements.playAgainBtn.addEventListener('click', () => {
  socket.emit('play-again');
});
elements.teamChatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = String(elements.teamChatInput.value || '').trim().toLowerCase();
  const allowedMessages = ['chilasco', 'medio flu', 'flu', 'malilla', 'ciego', 'rey'];
  if (!allowedMessages.includes(text)) return;
  socket.emit('team-chat', { text });
  elements.teamChatInput.value = '';
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

socket.on('team-chat-history', ({ team, messages }) => {
  renderTeamChat(messages, { team });
});

socket.on('team-chat-message', (message) => {
  const item = document.createElement('div');
  item.className = `team-chat-message${message.playerId === myPlayerId ? ' own' : ''}`;
  const meta = document.createElement('div');
  meta.className = 'team-chat-meta';
  meta.textContent = message.playerId === myPlayerId ? 'Tú' : message.playerName;
  const text = document.createElement('div');
  text.className = 'team-chat-text';
  text.textContent = message.text;
  item.append(meta, text);
  elements.teamChatMessages.appendChild(item);
  elements.teamChatMessages.scrollTop = elements.teamChatMessages.scrollHeight;
});

socket.on('join-error', (message) => {
  elements.resultText.textContent = message;
});

socket.on('room-closed', () => {
  leaveRoom();
});
