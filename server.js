const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const suits = ['oros', 'copas', 'espadas', 'bastos'];
const rankPriority = {
  2: 10,
  12: 9,
  11: 8,
  10: 7,
  1: 6,
  7: 5,
  6: 4,
  5: 3,
  4: 2,
  3: 1
};
const ranks = [
  { id: 1, label: '1', value: 1 },
  { id: 2, label: '2', value: 2 },
  { id: 3, label: '3', value: 3 },
  { id: 4, label: '4', value: 4 },
  { id: 5, label: '5', value: 5 },
  { id: 6, label: '6', value: 6 },
  { id: 7, label: '7', value: 7 },
  { id: 10, label: '10', value: 10 },
  { id: 11, label: '11', value: 11 },
  { id: 12, label: '12', value: 12 }
];

app.use(express.static('public'));

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function createDeck() {
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({
        id: `${suit}-${rank.id}`,
        suit,
        rank: rank.id,
        label: rank.label,
        value: rank.value,
        pretty: `${rank.label} de ${suit}`
      });
    }
  }
  return shuffle(deck);
}

function createRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      code,
      players: [],
      spectators: [],
      game: null,
      ownerId: null,
      teamChats: { 0: [], 1: [] }
    });
  }
  return rooms.get(code);
}

function getRoomBySocketId(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some((player) => player.id === socketId)) {
      return room;
    }
    if (room.spectators.some((spec) => spec.id === socketId)) {
      return room;
    }
  }
  return null;
}

function serializeRoom(room, viewerId = null) {
  return {
    code: room.code,
    ownerId: room.ownerId,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      team: player.team,
      role: player.role,
      score: player.score,
      ready: player.ready,
      hand: player.id === viewerId ? player.hand : [],
      seat: player.seat,
      isHost: player.id === room.ownerId
    })),
    spectators: room.spectators.map((spec) => ({
      id: spec.id,
      name: spec.name
    })),
    game: room.game ? {
      status: room.game.status,
      round: room.game.round,
      maxRounds: room.game.maxRounds,
      scores: room.game.scores,
      chicos: room.game.chicos,
      handWins: room.game.handWins,
      visibleCard: room.game.visibleCard,
      turnPlayerId: room.game.turnPlayerId,
      playedCards: room.game.playedCards.map((entry) => ({
        playerId: entry.playerId,
        card: entry.faceDown ? null : entry.card,
        faceDown: Boolean(entry.faceDown)
      })),
      history: room.game.history,
      trickWinner: room.game.trickWinner,
      tumboTeam: room.game.tumboTeam,
      pendingTumbo: room.game.pendingTumbo,
      challengeTeam: room.game.challengeTeam,
      pendingBet: room.game.pendingBet,
      nextBetLevel: room.game.nextBetLevel,
      lastBetTeam: room.game.lastBetTeam,
      betUsedThisRound: room.game.betUsedThisRound
    } : null,
    teamChats: room.players.reduce((chats, player) => {
      if (player.id === viewerId && player.team !== null) {
        chats[player.team] = (room.teamChats?.[player.team] || []).slice(-50);
      }
      return chats;
    }, {}),
    teamCounts: {
      0: room.players.filter((player) => player.team === 0).length,
      1: room.players.filter((player) => player.team === 1).length
    }
  };
}

function notifyRoom(room) {
  room.players.forEach((player) => {
    io.to(player.id).emit('room-state', serializeRoom(room, player.id));
  });
  room.spectators.forEach((spectator) => {
    io.to(spectator.id).emit('room-state', serializeRoom(room, spectator.id));
  });
}

function getMostBalancedTeam(room) {
  const teamA = room.players.filter((player) => player.team === 0).length;
  const teamB = room.players.filter((player) => player.team === 1).length;
  if (teamA <= teamB) return 0;
  return 1;
}

function buildAlternatingTurnOrder(room, starterId = null) {
  const aPlayers = room.players
    .filter((player) => player.team === 0)
    .sort((a, b) => a.seat - b.seat);
  const bPlayers = room.players
    .filter((player) => player.team === 1)
    .sort((a, b) => a.seat - b.seat);

  const ordered = [];
  for (let i = 0; i < Math.max(aPlayers.length, bPlayers.length); i += 1) {
    if (aPlayers[i]) ordered.push(aPlayers[i]);
    if (bPlayers[i]) ordered.push(bPlayers[i]);
  }

  if (!ordered.length) return [];

  let startIndex = 0;
  if (starterId) {
    const starterIndex = ordered.findIndex((player) => player.id === starterId);
    if (starterIndex >= 0) {
      startIndex = starterIndex;
    }
  }

  return [...ordered.slice(startIndex), ...ordered.slice(0, startIndex)].map((player) => player.id);
}

function getRandomStarterId(room) {
  const players = room.players.filter((player) => player.team === 0 || player.team === 1);
  return players[Math.floor(Math.random() * players.length)]?.id || null;
}

function startGame(room) {
  if (room.players.length !== 4) return;
  if (room.players.filter((player) => player.team === 0).length !== 2) return;
  if (room.players.filter((player) => player.team === 1).length !== 2) return;
  if (!room.players.every((player) => player.role === 'mandador' || player.role === 'mandado')) return;

  const deck = createDeck();
  const visibleCard = deck.pop();
  const orderedPlayers = room.players.slice().sort((a, b) => a.seat - b.seat);
  const starterId = getRandomStarterId(room);

  room.players.forEach((player) => {
    player.hand = [];
    player.score = 0;
  });

  for (let i = 0; i < 3; i += 1) {
    orderedPlayers.forEach((player) => {
      player.hand.push(deck.pop());
    });
  }

  room.game = {
    status: 'playing',
    round: 1,
    maxRounds: null,
    cardsPerPlayer: 3,
    deck,
    visibleCard,
    scores: { 0: 0, 1: 0 },
    chicos: { 0: 0, 1: 0 },
    handWins: { 0: 0, 1: 0 },
    playedCards: [],
    history: [],
    trickWinner: null,
    turnPlayerId: starterId,
    turnOrder: buildAlternatingTurnOrder(room, starterId),
    tumboTeam: null,
    pendingTumbo: false,
    challengeTeam: null,
    pendingBet: null,
    roundAward: { team: null, points: 0, chico: false },
    nextBetLevel: 4,
    lastBetTeam: null,
    betUsedThisRound: false
  };

  notifyRoom(room);
}

function compareCards(cardA, cardB, trumpSuit) {
  const aTrump = cardA.suit === trumpSuit;
  const bTrump = cardB.suit === trumpSuit;

  if (aTrump && !bTrump) return 1;
  if (!aTrump && bTrump) return -1;
  if (aTrump && bTrump) {
    return getCardPriority(cardA, trumpSuit) - getCardPriority(cardB, trumpSuit);
  }
  if (cardA.suit !== cardB.suit) return -1;
  return getCardPriority(cardA, trumpSuit) - getCardPriority(cardB, trumpSuit);
}

function getCardPriority(card, trumpSuit) {
  if (card.rank === 2 && card.suit !== trumpSuit) return 0;
  return rankPriority[card.rank] ?? 0;
}

function maybeAwardChico(room, team) {
  const other = 1 - team;
  room.game.handWins[team] += 1;

  if (room.game.handWins[team] >= 2 && room.game.handWins[other] < 2) {
    room.game.chicos[team] += 1;
    room.game.handWins = { 0: 0, 1: 0 };
    room.game.history.push({
      chico: true,
      team,
      chicos: { ...room.game.chicos }
    });

    if (room.game.chicos[team] >= 3) {
      room.game.status = 'finished';
      room.game.finalWinner = team;
      return true;
    }
  }

  return false;
}

function compareBetLevels(currentLevel, candidateLevel) {
  if (currentLevel === 'chico-fuera') return false;
  if (candidateLevel === 'chico-fuera') return true;
  return Number(candidateLevel) > Number(currentLevel);
}

function awardStoneForRound(room, team) {
  const roundAward = room.game.roundAward || { team: null, points: 0, chico: false };
  const opponentTeam = 1 - team;
  const noBetNoAward = roundAward.points <= 0 && !room.game.pendingBet;

  if (noBetNoAward && (room.game.scores[team] || 0) === 10) {
    const applyProgress = (score, delta) => {
      const next = (score || 0) + delta;
      if (next >= 13) return 0;
      if (next === 12) return 11;
      return next;
    };

    room.game.scores[team] = applyProgress(room.game.scores[team], 1);
    room.game.scores[opponentTeam] = applyProgress(room.game.scores[opponentTeam], 1);

    const teamWinsChico = room.game.scores[team] === 0 || room.game.scores[team] === 11;
    const opponentWinsChico = room.game.scores[opponentTeam] === 0 || room.game.scores[opponentTeam] === 11;
    if (teamWinsChico) room.game.chicos[team] = Math.min((room.game.chicos[team] || 0) + 1, 3);
    if (opponentWinsChico) room.game.chicos[opponentTeam] = Math.min((room.game.chicos[opponentTeam] || 0) + 1, 3);

    room.game.history.push({
      roundWinner: team,
      reason: '10 en juego y pierde',
      pointsAwarded: 1,
      chicoAwarded: teamWinsChico || opponentWinsChico,
      scoreAfter: { ...room.game.scores },
      handWins: { ...room.game.handWins }
    });
  } else {
    const points = roundAward.points > 0
      ? (roundAward.team === null || roundAward.team === team ? roundAward.points : 0)
      : 2;
    const beforeScore = room.game.scores[team] || 0;
    const nextScore = beforeScore + points;

    if (nextScore >= 13) {
      room.game.scores[team] = 0;
    } else if (nextScore === 12) {
      room.game.scores[team] = 11;
    } else {
      room.game.scores[team] = nextScore;
    }

    if (nextScore >= 13 || nextScore === 11) {
      room.game.chicos[team] = Math.min((room.game.chicos[team] || 0) + 1, 3);
    }

    room.game.history.push({
      roundWinner: team,
      reason: '2 de 3 manos',
      pointsAwarded: points,
      chicoAwarded: nextScore >= 13 || nextScore === 11,
      scoreAfter: { ...room.game.scores },
      handWins: { ...room.game.handWins }
    });
  }

  room.game.handWins = { 0: 0, 1: 0 };
  room.game.roundAward = { team: null, points: 0, chico: false };
  room.game.nextBetLevel = 4;
  room.game.lastBetTeam = null;
  room.game.betUsedThisRound = false;
  room.game.playedCards = [];
  room.game.round += 1;

  if (room.game.chicos[team] >= 3) {
    room.game.status = 'finished';
    room.game.finalWinner = team;
    return;
  }

  const orderedPlayers = room.players.slice().sort((a, b) => a.seat - b.seat);
  room.players.forEach((player) => {
    player.hand = [];
  });

  const deck = createDeck();
  room.game.visibleCard = deck.pop();
  for (let i = 0; i < 3; i += 1) {
    orderedPlayers.forEach((player) => {
      player.hand.push(deck.pop());
    });
  }

  room.game.deck = deck;
  room.game.status = 'playing';
  room.game.turnPlayerId = getRandomStarterId(room) || orderedPlayers[0]?.id || room.players[0]?.id;
  room.game.turnOrder = buildAlternatingTurnOrder(room, room.game.turnPlayerId);
}

function applyRoundForfeit(room, abandoningTeam, reason) {
  const rewardedTeam = 1 - abandoningTeam;
  const activeBet = room.game.pendingBet || null;
  const overridePoints = room.game.roundAward?.points > 0 ? room.game.roundAward.points : null;
  const awardedPoints = activeBet
    ? (activeBet.level === 'chico-fuera' ? 1 : Number(activeBet.level))
    : overridePoints ?? 2;
  const chicoAwarded = false;

  room.game.scores[rewardedTeam] = Math.min((room.game.scores[rewardedTeam] || 0) + awardedPoints, 11);

  room.game.history.push({
    round: room.game.round,
    forfeit: true,
    team: abandoningTeam,
    rewardedTeam,
    points: awardedPoints,
    envite: Boolean(activeBet || overridePoints),
    reason,
    scoreAfter: { ...room.game.scores },
    chicoAwarded,
    message: activeBet || overridePoints
      ? `El equipo ${abandoningTeam === 0 ? 'A' : 'B'} abandona la ronda y el equipo ${rewardedTeam === 0 ? 'A' : 'B'} recibe ${awardedPoints} puntos por envío.`
      : `El equipo ${abandoningTeam === 0 ? 'A' : 'B'} abandona la ronda y el equipo ${rewardedTeam === 0 ? 'A' : 'B'} recibe 2 puntos.`
  });

  if (room.game.chicos[rewardedTeam] >= 3) {
    room.game.status = 'finished';
    room.game.finalWinner = rewardedTeam;
    return true;
  }

  room.game.pendingBet = null;
  room.game.roundAward = { team: rewardedTeam, points: awardedPoints, chico: chicoAwarded };
  room.game.nextBetLevel = 4;
  room.game.lastBetTeam = null;
  room.game.betUsedThisRound = false;
  return false;
}

function reshuffleRound(room) {
  const orderedPlayers = room.players.slice().sort((a, b) => a.seat - b.seat);
  const deck = createDeck();

  room.players.forEach((player) => {
    player.hand = [];
  });

  room.game.visibleCard = deck.pop();
  for (let i = 0; i < 3; i += 1) {
    orderedPlayers.forEach((player) => {
      player.hand.push(deck.pop());
    });
  }

  room.game.deck = deck;
  room.game.playedCards = [];
  room.game.handWins = { 0: 0, 1: 0 };
  room.game.roundAward = { team: null, points: 0, chico: false };
  room.game.pendingBet = null;
  room.game.nextBetLevel = 4;
  room.game.lastBetTeam = null;
  room.game.betUsedThisRound = false;
  room.game.status = 'playing';
  room.game.turnPlayerId = getRandomStarterId(room) || orderedPlayers[0]?.id || room.players[0]?.id;
  room.game.turnOrder = buildAlternatingTurnOrder(room, room.game.turnPlayerId);
  room.game.history.push({
    round: room.game.round,
    reshuffled: true,
    reason: 'abandono',
    message: 'La ronda se ha abandonado y se han repartido nuevas cartas.'
  });
}

function resolveTrick(room) {
  const played = room.game.playedCards;
  const trumpSuit = room.game.visibleCard.suit;
  const visiblePlayed = played.filter((entry) => !entry.faceDown);

  const winnerEntry = visiblePlayed.reduce((winner, entry) => {
    const currentCard = entry.card;
    const winnerCard = winner.card;
    const comparison = compareCards(currentCard, winnerCard, trumpSuit);
    return comparison > 0 ? entry : winner;
  }, visiblePlayed[0] || played[0]);

  const winningTeam = room.players.find((player) => player.id === winnerEntry.playerId)?.team;
  room.game.handWins[winningTeam] = (room.game.handWins[winningTeam] || 0) + 1;

  room.game.history.push({
    trick: room.game.round,
    winnerTeam: winningTeam,
    winnerPlayer: room.players.find((player) => player.id === winnerEntry.playerId)?.name,
    winningCard: winnerEntry.faceDown ? 'carta boca abajo' : winnerEntry.card.pretty,
    handWins: { ...room.game.handWins },
    scoreAfter: { ...room.game.scores },
    played: played.map((entry) => ({
      player: room.players.find((player) => player.id === entry.playerId)?.name,
      card: entry.faceDown ? 'carta boca abajo' : entry.card.pretty,
      team: room.players.find((player) => player.id === entry.playerId)?.team
    }))
  });

  room.game.trickWinner = {
    team: winningTeam,
    playerId: winnerEntry.playerId,
    card: winnerEntry.card
  };

  if (!room.game.pendingTumbo && room.game.handWins[winningTeam] >= 2) {
    awardStoneForRound(room, winningTeam);

    if (room.game.status === 'finished') {
      notifyRoom(room);
      return;
    }

    if (room.game.scores[winningTeam] >= 11) {
      room.game.tumboTeam = winningTeam;
      room.game.status = 'tumbo';
      room.game.pendingTumbo = true;
      room.game.playedCards = [];
      notifyRoom(room);
      return;
    }

    notifyRoom(room);
    return;
  }

  room.game.playedCards = [];

  room.game.turnPlayerId = winnerEntry.playerId;
  room.game.turnOrder = buildAlternatingTurnOrder(room, winnerEntry.playerId);

  notifyRoom(room);
}

io.on('connection', (socket) => {
  socket.on('create-room', ({ name }) => {
    const roomCode = createRoomCode();
    const room = getRoom(roomCode);
    const playerName = String(name || 'Jugador').trim().slice(0, 18) || 'Jugador';

    room.players.push({
      id: socket.id,
      name: playerName,
      team: null,
      role: null,
      score: 0,
      ready: false,
      hand: [],
      seat: room.players.length,
      isHost: room.players.length === 0
    });

    room.ownerId = socket.id;
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.role = 'player';
    socket.emit('joined-room', { code: room.code, role: 'player' });
    notifyRoom(room);
  });

  socket.on('join-room', ({ roomCode, name }) => {
    const code = String(roomCode || '').toUpperCase();
    const room = rooms.get(code);
    const playerName = String(name || 'Jugador').trim().slice(0, 18) || 'Jugador';

    if (!room) {
      socket.emit('join-error', 'La sala no existe.');
      return;
    }

    if (room.players.length >= 4 && !room.players.some((player) => player.id === socket.id)) {
      socket.emit('join-error', 'La sala está completa.');
      return;
    }

    if (room.players.some((player) => player.id === socket.id)) {
      socket.emit('joined-room', { code: room.code, role: 'player' });
      return;
    }

    room.players.push({
      id: socket.id,
      name: playerName,
      team: null,
      role: null,
      score: 0,
      ready: false,
      hand: [],
      seat: room.players.length,
      isHost: false
    });

    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.role = 'player';
    socket.emit('joined-room', { code: room.code, role: 'player' });
    notifyRoom(room);
  });

  socket.on('spectate-room', ({ roomCode, name }) => {
    const code = String(roomCode || '').toUpperCase();
    const room = rooms.get(code);
    const spectatorName = String(name || 'Espectador').trim().slice(0, 18) || 'Espectador';

    if (!room) {
      socket.emit('join-error', 'No existe esa sala.');
      return;
    }

    if (room.spectators.some((spectator) => spectator.id === socket.id)) {
      socket.emit('joined-room', { code: room.code, role: 'spectator' });
      return;
    }

    room.spectators.push({
      id: socket.id,
      name: spectatorName
    });

    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.role = 'spectator';
    socket.emit('joined-room', { code: room.code, role: 'spectator' });
    notifyRoom(room);
  });

  socket.on('select-team', ({ team }) => {
    const room = getRoomBySocketId(socket.id);
    if (!room || room.game) return;

    const player = room.players.find((entry) => entry.id === socket.id);
    if (!player) return;

    const teamNumber = Number(team);
    if (![0, 1].includes(teamNumber)) return;

    if (player.team !== null) {
      socket.emit('join-error', 'Ya has elegido un equipo y no puedes cambiarlo.');
      return;
    }

    if (room.players.filter((entry) => entry.team === teamNumber).length >= 2) {
      socket.emit('join-error', 'Ese equipo ya está completo.');
      return;
    }

    player.team = teamNumber;
    player.ready = true;

    if (room.players.length === 4 && room.players.every((entry) => entry.team !== null && entry.role !== null)) {
      startGame(room);
    }

    notifyRoom(room);
  });

  socket.on('select-role', ({ role }) => {
    const room = getRoomBySocketId(socket.id);
    if (!room || room.game) return;

    const player = room.players.find((entry) => entry.id === socket.id);
    if (!player || player.team === null || player.role !== null || !['mandador', 'mandado'].includes(role)) return;

    player.role = role;

    if (room.players.length === 4 && room.players.every((entry) => entry.team !== null && entry.role !== null)) {
      startGame(room);
    }

    notifyRoom(room);
  });

  socket.on('team-chat', ({ text }) => {
    const room = getRoomBySocketId(socket.id);
    if (!room) return;

    const player = room.players.find((entry) => entry.id === socket.id);
    const allowedMessages = ['chilasco', 'medio flu', 'flu', 'malilla', 'rey'];
    const messageText = String(text || '').trim().toLowerCase();
    if (!player || player.team === null || !allowedMessages.includes(messageText)) return;

    const message = {
      playerId: player.id,
      playerName: player.name,
      text: messageText,
      timestamp: Date.now()
    };
    room.teamChats = room.teamChats || { 0: [], 1: [] };
    room.teamChats[player.team] = [...(room.teamChats[player.team] || []), message].slice(-50);

    room.players
      .filter((entry) => entry.team === player.team)
      .forEach((entry) => {
        io.to(entry.id).emit('team-chat-message', message);
      });
  });

  socket.on('play-card', ({ cardId, faceDown = false }) => {
    const room = getRoomBySocketId(socket.id);
    if (!room || !room.game || room.game.status !== 'playing') return;

    const player = room.players.find((entry) => entry.id === socket.id);
    if (!player) return;
    if (room.game.turnPlayerId !== socket.id) return;

    const card = player.hand.find((entry) => entry.id === cardId);
    if (!card) return;

    const leadSuit = room.game.playedCards[0]?.card?.suit;
    const hasLeadSuit = leadSuit && player.hand.some((entry) => entry.suit === leadSuit);
    const trumpSuit = room.game.visibleCard?.suit;
    if (leadSuit === trumpSuit && hasLeadSuit && card.suit !== leadSuit) {
      socket.emit('join-error', `Debes seguir el palo ${leadSuit} si lo tienes.`);
      return;
    }

    player.hand = player.hand.filter((entry) => entry.id !== cardId);
    room.game.playedCards.push({
      playerId: socket.id,
      card,
      faceDown: Boolean(faceDown)
    });

    if (!room.game.turnOrder || !room.game.turnOrder.length) {
      room.game.turnOrder = buildAlternatingTurnOrder(room, room.game.turnPlayerId);
    }

    const currentIndex = room.game.turnOrder.indexOf(socket.id);
    if (room.game.playedCards.length === 4) {
      const gameAtTrickEnd = room.game;
      room.game.status = 'trick-result';
      room.game.turnPlayerId = null;
      notifyRoom(room);
      setTimeout(() => {
        if (rooms.get(room.code) !== room || room.game !== gameAtTrickEnd || room.game.status !== 'trick-result') return;
        room.game.status = 'playing';
        resolveTrick(room);
      }, 2200);
      return;
    }

    const nextPlayerId = room.game.turnOrder[(currentIndex + 1) % room.game.turnOrder.length];
    room.game.turnPlayerId = nextPlayerId;
    notifyRoom(room);
  });

  socket.on('abandon-round', () => {
    const room = getRoomBySocketId(socket.id);
    if (!room || !room.game || room.game.status !== 'playing') return;

    const player = room.players.find((entry) => entry.id === socket.id);
    if (!player) return;

    const abandoningTeam = player.team;
    if (abandoningTeam === null || abandoningTeam === undefined) return;

    const hadFinished = applyRoundForfeit(room, abandoningTeam, 'abandono');
    reshuffleRound(room);
    if (hadFinished) {
      notifyRoom(room);
      return;
    }
    notifyRoom(room);
  });

  socket.on('renounce-round', () => {
    const room = getRoomBySocketId(socket.id);
    if (!room || !room.game || room.game.status !== 'playing') return;

    const player = room.players.find((entry) => entry.id === socket.id);
    if (!player || player.role !== 'mandador') return;

    const abandoningTeam = player.team;
    if (abandoningTeam === null || abandoningTeam === undefined) return;

    const hadFinished = applyRoundForfeit(room, abandoningTeam, 'renuncia');
    reshuffleRound(room);
    room.game.history.push({
      round: room.game.round,
      renounced: true,
      player: player.name,
      team: abandoningTeam,
      message: 'El mandador ha renunciado y se han repartido nuevas cartas.'
    });
    if (hadFinished) {
      notifyRoom(room);
      return;
    }
    notifyRoom(room);
  });

  socket.on('send-bet', ({ level }) => {
    const room = getRoomBySocketId(socket.id);
    if (!room || !room.game || room.game.status !== 'playing' || room.game.pendingBet || room.game.betUsedThisRound) return;

    const player = room.players.find((entry) => entry.id === socket.id);
    if (!player || player.role !== 'mandador' || player.team === null) return;
    if (room.game.nextBetLevel === null || room.game.nextBetLevel === undefined) return;

    const value = String(level).toLowerCase();
    const validLevels = ['4', '7', '9', 'chico-fuera'];
    if (!validLevels.includes(value)) return;

    const betValue = value === 'chico-fuera' ? 'chico-fuera' : Number(value);
    if (betValue !== room.game.nextBetLevel) return;
    if (room.game.lastBetTeam === player.team) return;

    room.game.betUsedThisRound = true;

    room.game.pendingBet = {
      challengerTeam: player.team,
      targetTeam: 1 - player.team,
      level: betValue,
      previousLevel: null,
      accepted: null
    };
    room.game.nextBetLevel = betValue === 4 ? 7
      : betValue === 7 ? 9
        : betValue === 9 ? 'chico-fuera' : null;

    room.game.history.push({
      envio: true,
      team: player.team,
      level: betValue,
      message: value === 'chico-fuera' ? 'Chico fuera propuesto' : `Envío a ${betValue} propuesto`
    });

    notifyRoom(room);
  });

  socket.on('bet-response', ({ accept, level }) => {
    const room = getRoomBySocketId(socket.id);
    if (!room || !room.game || !room.game.pendingBet) return;

    const player = room.players.find((entry) => entry.id === socket.id);
    if (!player || player.role !== 'mandador' || player.team !== room.game.pendingBet.targetTeam) return;

    if (accept === 'raise' && level !== undefined) {
      const candidateLevel = level === 'chico-fuera' ? level : Number(level);

      if (candidateLevel === room.game.nextBetLevel && compareBetLevels(room.game.pendingBet.level, candidateLevel)) {
        const previousChallenger = room.game.pendingBet.challengerTeam;
        const previousLevel = room.game.pendingBet.level;
        room.game.pendingBet = {
          challengerTeam: player.team,
          targetTeam: previousChallenger,
          level: candidateLevel,
          previousLevel,
          accepted: null
        };
        room.game.nextBetLevel = candidateLevel === 7 ? 9
          : candidateLevel === 9 ? 'chico-fuera' : null;
        room.game.history.push({
          envio: true,
          team: player.team,
          response: 'subida',
          level: candidateLevel,
          message: 'Se ha subido el envío.'
        });
        notifyRoom(room);
        return;
      }
    }

    if (accept === false) {
      const rejectedBet = room.game.pendingBet;
      const winningTeam = rejectedBet.challengerTeam;
      const awardedLevel = rejectedBet.previousLevel ?? rejectedBet.level;

      if (rejectedBet.previousLevel === null && rejectedBet.level === 4) {
        room.game.scores[winningTeam] = Math.min((room.game.scores[winningTeam] || 0) + 2, 11);
        room.game.roundAward = {
          team: winningTeam,
          points: 2,
          chico: false
        };
        room.game.history.push({
          envio: false,
          team: winningTeam,
          rejectedBy: player.team,
          level: awardedLevel,
          reason: 'abandono',
          pointsAwarded: 2,
          message: `El equipo ${player.team === 0 ? 'A' : 'B'} rechaza el primer envío y abandona la ronda; el equipo ${winningTeam === 0 ? 'A' : 'B'} gana 2 piedras.`
        });
        room.game.pendingBet = null;
        room.game.nextBetLevel = null;
        room.game.lastBetTeam = null;
        notifyRoom(room);
        return;
      }

      room.game.roundAward = {
        team: winningTeam,
        points: awardedLevel === 'chico-fuera' ? 1 : Number(awardedLevel),
        chico: false
      };
      room.game.history.push({
        envio: false,
        team: winningTeam,
        rejectedBy: player.team,
        level: awardedLevel,
        message: `El envío se rechaza y el equipo ${winningTeam === 0 ? 'A' : 'B'} gana los puntos del valor ${awardedLevel}.`
      });
      room.game.pendingBet = null;
      room.game.nextBetLevel = null;
      notifyRoom(room);
      return;
    }

    room.game.pendingBet.accepted = true;
    const senderTeam = room.game.pendingBet.challengerTeam;
    room.game.roundAward = {
      team: null,
      points: room.game.pendingBet.level === 'chico-fuera' ? 1 : Number(room.game.pendingBet.level),
      chico: false
    };
    room.game.lastBetTeam = senderTeam;
    room.game.nextBetLevel = room.game.pendingBet.level === 4 ? 7
      : room.game.pendingBet.level === 7 ? 9
        : room.game.pendingBet.level === 9 ? 'chico-fuera' : null;

    room.game.history.push({
      envio: true,
      team: senderTeam,
      acceptedBy: room.game.pendingBet.targetTeam,
      level: room.game.pendingBet.level,
      message: 'El envío ha sido aceptado y se liquidará al terminar la ronda.'
    });
    room.game.pendingBet = null;
    notifyRoom(room);
  });

  socket.on('tumbo-decision', ({ accept }) => {
    const room = getRoomBySocketId(socket.id);
    if (!room || !room.game || room.game.status !== 'tumbo') return;

    const player = room.players.find((entry) => entry.id === socket.id);
    if (!player || player.role !== 'mandador') return;

    const tumboTeam = room.game.tumboTeam;
    if (player.team !== tumboTeam) return;

    room.game.pendingTumbo = false;

    if (accept === false) {
      const otherTeam = 1 - tumboTeam;
      room.game.scores[otherTeam] = Math.min((room.game.scores[otherTeam] || 0) + 1, 11);
      room.game.tumboTeam = null;
      room.game.pendingTumbo = false;
      room.game.challengeTeam = null;
      room.game.history.push({
        tumbo: false,
        team: tumboTeam,
        decision: 'rechaza',
        score: { ...room.game.scores },
        message: 'No se acepta el tumbo; el equipo contrario gana 1 piedra y se reparten nuevas cartas.'
      });
      reshuffleRound(room);
      room.game.turnPlayerId = room.game.turnOrder?.[0] || room.players[0].id;
      notifyRoom(room);
      return;
    }

    const opposingTeam = 1 - tumboTeam;
    room.game.challengeTeam = tumboTeam;
    room.game.history.push({
      tumbo: true,
      team: tumboTeam,
      decision: 'acepta',
      message: 'El equipo en tumbo acepta jugar y define el chico.'
    });

    const tumboScore = room.game.scores[tumboTeam] || 0;
    const canWinChico = tumboScore >= 11;
    if (canWinChico) {
      room.game.scores[tumboTeam] = 0;
      room.game.chicos[tumboTeam] += 1;
      room.game.history.push({
        chico: true,
        team: tumboTeam,
        chicos: { ...room.game.chicos },
        scoreAfter: { ...room.game.scores },
        scoreBefore: tumboScore,
        message: tumboScore > 13
          ? `El equipo ${tumboTeam === 0 ? 'A' : 'B'} supera 13 piedras, reinicia a 0 y suma 1 chico.`
          : `El equipo ${tumboTeam === 0 ? 'A' : 'B'} gana el tumbo con ${tumboScore} piedras y suma 1 chico.`
      });
      if (room.game.chicos[tumboTeam] >= 3) {
        room.game.status = 'finished';
        room.game.finalWinner = tumboTeam;
        notifyRoom(room);
        return;
      }
    } else {
      room.game.scores[opposingTeam] = Math.min(room.game.scores[opposingTeam] + 3, 11);
    }

    room.game.status = 'playing';
    room.game.tumboTeam = null;
    room.game.pendingTumbo = false;
    room.game.turnPlayerId = room.game.turnOrder?.[0] || room.players[0].id;
    notifyRoom(room);
  });

  socket.on('close-room', () => {
    const room = getRoomBySocketId(socket.id);
    if (!room) return;

    const player = room.players.find((entry) => entry.id === socket.id);
    if (!player || room.ownerId !== socket.id) return;

    io.to(room.code).emit('room-closed');
    rooms.delete(room.code);
  });

  socket.on('play-again', () => {
    const room = getRoomBySocketId(socket.id);
    if (!room || room.ownerId !== socket.id || !room.game || room.game.status !== 'finished') return;

    room.players.forEach((player) => {
      player.team = null;
      player.role = null;
      player.score = 0;
      player.ready = false;
      player.hand = [];
    });
    room.game = null;
    notifyRoom(room);
  });

  socket.on('return-to-lobby', () => {
    const room = getRoomBySocketId(socket.id);
    if (room) {
      const playerIndex = room.players.findIndex((entry) => entry.id === socket.id);
      if (playerIndex >= 0) {
        room.players.splice(playerIndex, 1);
      }
      const spectatorIndex = room.spectators.findIndex((entry) => entry.id === socket.id);
      if (spectatorIndex >= 0) {
        room.spectators.splice(spectatorIndex, 1);
      }
      if (room.players.length === 0 && room.spectators.length === 0) {
        rooms.delete(room.code);
      } else {
        notifyRoom(room);
      }
    }
    socket.data.roomCode = null;
    socket.data.role = null;
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocketId(socket.id);
    if (!room) return;

    const playerIndex = room.players.findIndex((entry) => entry.id === socket.id);
    if (playerIndex >= 0) {
      room.players.splice(playerIndex, 1);
    }
    const spectatorIndex = room.spectators.findIndex((entry) => entry.id === socket.id);
    if (spectatorIndex >= 0) {
      room.spectators.splice(spectatorIndex, 1);
    }

    if (room.players.length === 0 && room.spectators.length === 0) {
      rooms.delete(room.code);
      return;
    }

    if (room.players.length > 0 && room.ownerId === socket.id) {
      room.ownerId = room.players[0].id;
      room.players[0].isHost = true;
    }

    if (!room.game && room.players.length === 4 && room.players.every((player) => player.team !== null && player.role !== null)) {
      startGame(room);
    }

    notifyRoom(room);
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor Envite Canario listo en http://0.0.0.0:${PORT}`);
});
