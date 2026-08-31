const socket = io();

const elements = {
  setupBox: document.getElementById('setup-box'),
  gameBox: document.getElementById('game-box'),
  roomCodeBadge: document.getElementById('room-code-badge'),
  playerName: document.getElementById('player-name'),
  roomCode: document.getElementById('room-code'),
  createRoomBtn: document.getElementById('create-room-btn'),
  joinRoomBtn: document.getElementById('join-room-btn'),
  resetBtn: document.getElementById('reset-btn'),
  statusText: document.getElementById('status-text'),
  scoreA: document.getElementById('score-a'),
  scoreB: document.getElementById('score-b'),
  roundText: document.getElementById('round-text'),
  resultText: document.getElementById('result-text'),
  playersGrid: document.getElementById('players-grid'),
  choices: document.getElementById('choices')
};

let myPlayerId = null;
let selectedValue = null;
let roomCode = '';

function setChoiceButtonsDisabled(disabled) {
  document.querySelectorAll('.choice-btn').forEach((button) => {
    button.disabled = disabled;
  });
}

function renderChoiceButtons() {
  const buttons = [];
  for (let value = 1; value <= 9; value += 1) {
    const button = document.createElement('button');
    button.className = 'choice-btn';
    button.textContent = value;
    button.type = 'button';
    if (selectedValue === value) {
      button.classList.add('selected');
    }
    button.addEventListener('click', () => {
      selectedValue = value;
      renderChoiceButtons();
      socket.emit('play-choice', value);
    });
    buttons.push(button);
  }
  elements.choices.innerHTML = '';
  buttons.forEach((button) => elements.choices.appendChild(button));
}

function getTeamLabel(team) {
  return team === 0 ? 'Equipo A' : team === 1 ? 'Equipo B' : 'Sin equipo';
}

function renderPlayers(players) {
  elements.playersGrid.innerHTML = '';

  players.forEach((player) => {
    const card = document.createElement('div');
    card.className = 'player-card';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = player.id === myPlayerId ? 'Tú' : 'Jugador';

    const name = document.createElement('div');
    name.textContent = player.name;

    const team = document.createElement('div');
    team.className = 'label';
    team.textContent = getTeamLabel(player.team);

    const choice = document.createElement('div');
    choice.className = 'choice';
    choice.textContent = player.choice ?? '—';

    card.append(label, name, team, choice);
    elements.playersGrid.appendChild(card);
  });
}

function updateRoom(room) {
  roomCode = room.code;
  elements.roomCodeBadge.textContent = `Sala: ${room.code}`;
  elements.roomCode.value = room.code;

  const players = room.players || [];
  renderPlayers(players);

  if (room.game) {
    const { scores, round, maxRounds, status } = room.game;
    elements.scoreA.textContent = String(scores?.[0] ?? 0);
    elements.scoreB.textContent = String(scores?.[1] ?? 0);
    elements.roundText.textContent = `Ronda ${Math.min(round, maxRounds)} de ${maxRounds}`;

    if (status === 'playing') {
      elements.statusText.textContent = 'Partida en marcha';
    } else if (status === 'finished') {
      const finalWinner = room.lastResult?.teamWinner;
      if (finalWinner === 'empate') {
        elements.statusText.textContent = 'Empate final';
      } else {
        elements.statusText.textContent = `Ganó ${finalWinner === 0 ? 'Equipo A' : 'Equipo B'}`;
      }
    }

    const myPlayer = players.find((player) => player.id === myPlayerId);
    const canPlay = myPlayer && myPlayer.choice === null && status === 'playing';
    setChoiceButtonsDisabled(!canPlay);

    if (room.lastResult) {
      if (room.lastResult.final) {
        const winner = room.lastResult.teamWinner;
        if (winner === 'empate') {
          elements.resultText.textContent = `Resultado final: empate ${room.lastResult.scores[0]} - ${room.lastResult.scores[1]}`;
        } else {
          elements.resultText.textContent = `Resultado final: ${winner === 0 ? 'Equipo A' : 'Equipo B'} gana ${room.lastResult.scores[0]} - ${room.lastResult.scores[1]}`;
        }
      } else {
        const totals = room.lastResult.totals;
        const winner = room.lastResult.winner;
        const resultText = winner === 'empate'
          ? `Empate: ${totals[0]} - ${totals[1]}`
          : `Gana ${winner === 0 ? 'Equipo A' : 'Equipo B'}: ${totals[0]} - ${totals[1]}`;
        elements.resultText.textContent = resultText;
      }
    } else if (status === 'playing') {
      elements.resultText.textContent = 'Espera a que todos elijan su valor.';
    }
  } else {
    elements.statusText.textContent = 'Esperando jugadores';
    elements.roundText.textContent = 'Ronda 1 de 5';
    elements.resultText.textContent = 'Necesitas 4 jugadores para iniciar la partida.';
    elements.scoreA.textContent = '0';
    elements.scoreB.textContent = '0';
    setChoiceButtonsDisabled(true);
  }

  const readyToStart = players.length === 4;
  elements.setupBox.classList.toggle('hidden', readyToStart || room.code);
  elements.gameBox.classList.toggle('hidden', !room.code || players.length < 1);
}

function createRoom() {
  const name = elements.playerName.value.trim() || 'Jugador';
  socket.emit('create-room', name);
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

elements.createRoomBtn.addEventListener('click', createRoom);
elements.joinRoomBtn.addEventListener('click', joinRoom);
elements.resetBtn.addEventListener('click', () => {
  socket.emit('reset-game');
  selectedValue = null;
  renderChoiceButtons();
});

socket.on('joined-room', ({ code }) => {
  myPlayerId = socket.id;
  roomCode = code;
  elements.gameBox.classList.remove('hidden');
  elements.setupBox.classList.add('hidden');
  elements.roomCodeBadge.textContent = `Sala: ${code}`;
});

socket.on('room-state', (room) => {
  updateRoom(room);
});

socket.on('join-error', (message) => {
  elements.resultText.textContent = message;
});

renderChoiceButtons();
setChoiceButtonsDisabled(true);
