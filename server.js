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

const RANK_DISPLAY_NAMES = { 1: 'As', 10: 'Sota', 11: 'Caballo', 12: 'Rey' };

function createDeck() {
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      const displayName = RANK_DISPLAY_NAMES[rank.id] || rank.label;
      deck.push({
        id: `${suit}-${rank.id}`,
        suit,
        rank: rank.id,
        label: rank.label,
        value: rank.value,
        pretty: `${displayName} de ${suit}`
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
    mode: room.mode || '2v2',
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
      forcedTumbo: Boolean(room.game.forcedTumbo),
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

function getModeConfig(mode = '2v2') {
  const normalizedMode = mode === '3v3' ? '3v3' : '2v2';
  return {
    mode: normalizedMode,
    requiredPlayers: normalizedMode === '3v3' ? 6 : 4,
    teamSize: normalizedMode === '3v3' ? 3 : 2,
    mandadoLimit: normalizedMode === '3v3' ? 2 : 1,
    roundWinTarget: 2,
    trickSize: normalizedMode === '3v3' ? 6 : 4,
    tumboThreshold: 11
  };
}

function getRequiredPlayersForMode(mode) {
  return getModeConfig(mode).requiredPlayers;
}

function getTeamSizeForMode(mode) {
  return getModeConfig(mode).teamSize;
}

function getMandadoLimitForMode(mode) {
  return getModeConfig(mode).mandadoLimit;
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
  const mode = room.mode || '2v2';
  const requiredPlayers = getRequiredPlayersForMode(mode);
  const teamSize = getTeamSizeForMode(mode);
  const mandadoLimit = getMandadoLimitForMode(mode);
  if (room.players.length !== requiredPlayers) return;
  if (room.players.filter((player) => player.team === 0).length !== teamSize) return;
  if (room.players.filter((player) => player.team === 1).length !== teamSize) return;
  if (!room.players.every((player) => player.role === 'mandador' || player.role === 'mandado')) return;
  if (room.players.filter((player) => player.team === 0 && player.role === 'mandador').length !== 1) return;
  if (room.players.filter((player) => player.team === 1 && player.role === 'mandador').length !== 1) return;
  if (room.players.filter((player) => player.team === 0 && player.role === 'mandado').length !== mandadoLimit) return;
  if (room.players.filter((player) => player.team === 1 && player.role === 'mandado').length !== mandadoLimit) return;

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
    forcedTumbo: false,
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

function compareCards(cardA, cardB, trumpSuit, mode = '2v2', firstCardSuit = null) {
  // En 3v3, las 3 primeras cartas son triunfos globales
  if (mode === '3v3') {
    const aIsGlobalTriumph = isGlobalTriumph3v3(cardA);
    const bIsGlobalTriumph = isGlobalTriumph3v3(cardB);
    
    if (aIsGlobalTriumph && !bIsGlobalTriumph) return 1;
    if (!aIsGlobalTriumph && bIsGlobalTriumph) return -1;
    if (aIsGlobalTriumph && bIsGlobalTriumph) {
      return getCardPriority3v3(cardA, trumpSuit) - getCardPriority3v3(cardB, trumpSuit);
    }
    
    // No son triunfos globales, comprobar si son del palo virado
    const aTrump = cardA.suit === trumpSuit;
    const bTrump = cardB.suit === trumpSuit;
    
    if (aTrump && !bTrump) return 1;
    if (!aTrump && bTrump) return -1;
    if (aTrump && bTrump) {
      return getCardPriority3v3(cardA, trumpSuit) - getCardPriority3v3(cardB, trumpSuit);
    }
    
    // Ni globales ni palo virado: comparar por palo de inicio
    const aFollowsSuit = cardA.suit === firstCardSuit;
    const bFollowsSuit = cardB.suit === firstCardSuit;
    
    if (aFollowsSuit && !bFollowsSuit) return 1;    // A sigue el palo, B no
    if (!aFollowsSuit && bFollowsSuit) return -1;   // B sigue el palo, A no
    if (aFollowsSuit && bFollowsSuit) {
      // Ambas siguen el palo: comparar por rank
      return rankCompare(cardA.rank) - rankCompare(cardB.rank);
    }
    
    // Ninguna sigue el palo: comparar por rank igual
    return rankCompare(cardA.rank) - rankCompare(cardB.rank);
  }

  // En 2v2, usar lógica estándar
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

function rankCompare(rank) {
  // Orden de ranks: 12, 11, 10, 1, 7, 6, 5, 4, 3, 2
  // (mismo orden que en palo virado)
  const rankOrder = { 12: 50, 11: 49, 10: 48, 1: 47, 7: 46, 6: 45, 5: 44, 4: 43, 3: 42, 2: 41 };
  return rankOrder[rank] ?? 0;
}

function isGlobalTriumph3v3(card) {
  // Las 3 cartas máximas en 3v3 son globales (no dependen del palo virado)
  // 1. Tres de bastos
  // 2. Caballo (11) de bastos
  // 3. Perica (10 de oros)
  return (card.rank === 3 && card.suit === 'bastos') ||
         (card.rank === 11 && card.suit === 'bastos') ||
         (card.rank === 10 && card.suit === 'oros');
}

function getCardPriority3v3(card, trumpSuit) {
  // Prioridades para 3v3
  // 1. Tres de bastos = 100
  // 2. Caballo (11) de bastos = 99
  // 3. Perica (10 de oros) = 98
  // 4. Malilla (2 del palo virado) = 97
  // 5. Resto del palo virado: 12, 11, 10, 1, 7, 6, 5, 4, 3 = 50-40
  
  if (card.rank === 3 && card.suit === 'bastos') return 100;
  if (card.rank === 11 && card.suit === 'bastos') return 99;
  if (card.rank === 10 && card.suit === 'oros') return 98;
  
  // Malilla (2 del palo virado)
  if (card.rank === 2 && card.suit === trumpSuit) return 97;
  
  // Si es del palo virado, dar prioridad según orden: 12, 11, 10, 1, 7, 6, 5, 4, 3
  if (card.suit === trumpSuit) {
    const order3v3 = { 12: 50, 11: 49, 10: 48, 1: 47, 7: 46, 6: 45, 5: 44, 4: 43, 3: 42 };
    return order3v3[card.rank] ?? 0;
  }
  
  // No es del palo virado, prioridad muy baja
  return 0;
}

function getCardPriority(card, trumpSuit) {
  if (card.rank === 2 && card.suit !== trumpSuit) return 0;
  return rankPriority[card.rank] ?? 0;
}

// Chico solo se otorga: 1) Al ganar tumbo (2 de 3 manos), o 2) Al alcanzar 13+ en envite

function compareBetLevels(currentLevel, candidateLevel) {
  if (currentLevel === 'chico-fuera') return false;
  if (candidateLevel === 'chico-fuera') return true;
  return Number(candidateLevel) > Number(currentLevel);
}

function awardStoneForRound(room, team) {
  const opponentTeam = 1 - team;
  const teamScore = room.game.scores[team] || 0;
  const hasActiveBet = !!room.game.pendingBet; // Solo si hay apuesta activa (no rechazada)

  // Caso 0: "Chico fuera" — se juega el chico completo de un tirón, sin depender
  // de las piedras acumuladas (ni siquiera si algún equipo está justo en 10).
  // Ganar la baza da directamente el chico.
  if (hasActiveBet && room.game.pendingBet.level === 'chico-fuera') {
    room.game.chicos[team] = Math.min((room.game.chicos[team] || 0) + 1, 3);
    room.game.scores = { 0: 0, 1: 0 };
    room.game.pendingBet = null;
    room.game.betUsedThisRound = true;
    room.game.history.push({
      roundWinner: team,
      reason: 'Chico fuera',
      chicoAwarded: true,
      chicos: { ...room.game.chicos },
      scoreAfter: { ...room.game.scores }
    });

    if (room.game.chicos[team] >= 3) {
      room.game.status = 'finished';
      room.game.finalWinner = team;
    }
    return;
  }

  // Caso 1: Equipo ganador está en 10 piedras → suma 1 y entra en tumbo
  if (teamScore === 10) {
    room.game.scores[team] = 11;
    room.game.pendingBet = null;
    room.game.betUsedThisRound = true;
    room.game.history.push({
      roundWinner: team,
      reason: 'En 10 piedras',
      pointsAwarded: 1,
      scoreAfter: { ...room.game.scores }
    });
    return;
  }

  // Caso 2: Equipo perdedor estaba en 10 piedras → suma 1 al equipo contrario
  const opponentScore = room.game.scores[opponentTeam] || 0;
  if (opponentScore === 10) {
    room.game.scores[opponentTeam] = 11;
    room.game.pendingBet = null;
    room.game.betUsedThisRound = true;
    room.game.history.push({
      roundWinner: team,
      loserIn10: true,
      reason: 'Equipo contrario en 10 piedras',
      pointsAwarded: 1,
      scoreAfter: { ...room.game.scores }
    });
    return;
  }

  // Caso 3: Normal sin envite → suma 2
  if (!hasActiveBet) {
    room.game.scores[team] = Math.min((room.game.scores[team] || 0) + 2, 11);
    room.game.pendingBet = null;
    room.game.betUsedThisRound = true;
    room.game.history.push({
      roundWinner: team,
      reason: 'Ronda normal',
      pointsAwarded: 2,
      scoreAfter: { ...room.game.scores }
    });
    return;
  }

  // Caso 4: Envite a 4/7/9 → suma esos puntos y comprueba si con eso se llega a 13+ (chico)
  const points = Number(room.game.pendingBet.level);
  const nextScore = (room.game.scores[team] || 0) + points;

  if (nextScore >= 13) {
    // Chico: reinicia ambos equipos a 0 y suma 1 chico al ganador
    room.game.chicos[team] = Math.min((room.game.chicos[team] || 0) + 1, 3);
    room.game.scores = { 0: 0, 1: 0 };
    room.game.pendingBet = null;
    room.game.betUsedThisRound = true;
    room.game.history.push({
      roundWinner: team,
      reason: 'Envite con 13+ piedras',
      pointsAwarded: points,
      chicoAwarded: true,
      chicos: { ...room.game.chicos },
      scoreAfter: { ...room.game.scores }
    });

    if (room.game.chicos[team] >= 3) {
      room.game.status = 'finished';
      room.game.finalWinner = team;
    }
    return;
  }

  // Normal con envite pero sin llegar a 13
  room.game.scores[team] = Math.min(nextScore, 11);
  room.game.history.push({
    roundWinner: team,
    reason: 'Envite',
    pointsAwarded: points,
    scoreAfter: { ...room.game.scores }
  });
  
  // Limpiar apuesta después de resolver
  room.game.pendingBet = null;
  room.game.betUsedThisRound = true;
}

function applyRoundForfeit(room, abandoningTeam, reason) {
  const rewardedTeam = 1 - abandoningTeam;

  room.game.history.push({
    round: room.game.round,
    forfeit: true,
    team: abandoningTeam,
    rewardedTeam,
    reason,
    message: `El equipo ${abandoningTeam === 0 ? 'A' : 'B'} abandona la ronda.`
  });

  // Reutiliza la misma lógica de puntuación que una ronda ganada con normalidad:
  // respeta el envite activo si lo había, el caso especial de "en 10 piedras",
  // y el chico automático al llegar a 13+ con envite.
  awardStoneForRound(room, rewardedTeam);

  if (room.game.status === 'finished') {
    return 'finished';
  }

  const tumboThreshold = getModeConfig(room.mode || '2v2').tumboThreshold;
  if (room.game.scores[rewardedTeam] >= tumboThreshold) {
    room.game.tumboTeam = rewardedTeam;
    room.game.forcedTumbo = false;
    room.game.status = 'tumbo';
    room.game.pendingTumbo = true;
    dealFreshHand(room);
    room.game.playedCards = [];
    room.game.handWins = { 0: 0, 1: 0 };
    return 'tumbo';
  }

  return 'continue';
}

function dealFreshHand(room) {
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
}

function reshuffleRound(room, reason = 'abandono', message = 'La ronda se ha abandonado y se han repartido nuevas cartas.') {
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
  room.game.pendingTumbo = false;
  room.game.tumboTeam = null;
  room.game.forcedTumbo = false;
  room.game.challengeTeam = null;
  room.game.nextBetLevel = 4;
  room.game.lastBetTeam = null;
  room.game.betUsedThisRound = false;
  room.game.status = 'playing';
  room.game.turnPlayerId = getRandomStarterId(room) || orderedPlayers[0]?.id || room.players[0]?.id;
  room.game.turnOrder = buildAlternatingTurnOrder(room, room.game.turnPlayerId);
  room.game.history.push({
    round: room.game.round,
    reshuffled: true,
    reason,
    message
  });
}

function resolveTrick(room) {
  const played = room.game.playedCards;
  const trumpSuit = room.game.visibleCard.suit;
  const visiblePlayed = played.filter((entry) => !entry.faceDown);

  const firstCardSuit = visiblePlayed[0]?.card.suit; // Palo de la primera carta jugada
  const winnerEntry = visiblePlayed.reduce((winner, entry) => {
    const currentCard = entry.card;
    const winnerCard = winner.card;
    const comparison = compareCards(currentCard, winnerCard, trumpSuit, room.mode || '2v2', firstCardSuit);
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

  const config = getModeConfig(room.mode || '2v2');
  
  // Si estamos en tumbo (normal o forzado porque ambos equipos llegaron a 11), contar hacia ganar 2 bazas
  if (room.game.tumboTeam !== null || room.game.forcedTumbo) {
    const forced = room.game.forcedTumbo;
    // En tumbo normal, el equipo a batir es tumboTeam. En tumbo forzado no hay un equipo
    // "retado": gana quien llegue primero a 2 bazas.
    const leaderTeam = forced
      ? (room.game.handWins[0] >= 2 ? 0 : (room.game.handWins[1] >= 2 ? 1 : null))
      : (room.game.handWins[room.game.tumboTeam] >= 2 ? room.game.tumboTeam : null);

    if (leaderTeam !== null) {
      // Gana el tumbo: suma 1 chico y reinicia
      room.game.chicos[leaderTeam] = Math.min((room.game.chicos[leaderTeam] || 0) + 1, 3);
      room.game.scores = { 0: 0, 1: 0 };
      room.game.history.push({
        chico: true,
        team: leaderTeam,
        forced,
        chicos: { ...room.game.chicos },
        scoreAfter: { ...room.game.scores },
        message: forced
          ? `El equipo ${leaderTeam === 0 ? 'A' : 'B'} gana el tumbo obligado (ambos equipos estaban en tumbo) y suma 1 chico.`
          : `El equipo ${leaderTeam === 0 ? 'A' : 'B'} gana el tumbo (2 de 3 manos) y suma 1 chico.`
      });

      if (room.game.chicos[leaderTeam] >= 3) {
        room.game.status = 'finished';
        room.game.finalWinner = leaderTeam;
        notifyRoom(room);
        return;
      }

      // Reinicia ronda
      room.game.tumboTeam = null;
      room.game.forcedTumbo = false;
      room.game.playedCards = [];
      room.game.handWins = { 0: 0, 1: 0 };
      room.game.roundAward = { team: null, points: 0, chico: false };
      room.game.pendingBet = null;
      room.game.nextBetLevel = 4;
      room.game.lastBetTeam = null;
      room.game.betUsedThisRound = false;
      room.game.round += 1;

      dealFreshHand(room);
      room.game.status = 'playing';
      room.game.turnPlayerId = getRandomStarterId(room) || room.players[0]?.id;
      room.game.turnOrder = buildAlternatingTurnOrder(room, room.game.turnPlayerId);
      notifyRoom(room);
      return;
    }

    if (!forced) {
      const opposingTeam = 1 - room.game.tumboTeam;
      if (room.game.handWins[opposingTeam] >= 2) {
        // El equipo en tumbo pierde: el contrario se "arraya" 3 piedras.
        const losingTumboTeam = room.game.tumboTeam;
        room.game.scores[opposingTeam] = Math.min((room.game.scores[opposingTeam] || 0) + 3, 11);
        room.game.round += 1;
        room.game.history.push({
          tumbo: true,
          team: losingTumboTeam,
          decision: 'perdido',
          scoreAfter: { ...room.game.scores },
          message: `El equipo ${losingTumboTeam === 0 ? 'A' : 'B'} pierde el tumbo y el equipo ${opposingTeam === 0 ? 'A' : 'B'} se arraya 3 piedras.`
        });
        reshuffleRound(
          room,
          'tumbo-perdido',
          `El equipo ${losingTumboTeam === 0 ? 'A' : 'B'} ha perdido el tumbo. Nuevas cartas repartidas.`
        );
        notifyRoom(room);
        return;
      }
    }
    // En tumbo forzado no hay "arraya": si ninguno llega a 2, se sigue jugando bazas.

    // Sigue en tumbo, pasar turno al siguiente jugador
    room.game.playedCards = [];
    room.game.turnPlayerId = winnerEntry.playerId;
    room.game.turnOrder = buildAlternatingTurnOrder(room, winnerEntry.playerId);
    notifyRoom(room);
    return;
  }

  // Ronda normal (no tumbo)
  if (room.game.handWins[winningTeam] >= config.roundWinTarget) {
    awardStoneForRound(room, winningTeam);

    if (room.game.status === 'finished') {
      notifyRoom(room);
      return;
    }

    if (room.game.scores[winningTeam] >= config.tumboThreshold) {
      room.game.tumboTeam = winningTeam;
      room.game.status = 'tumbo';
      room.game.pendingTumbo = true;
      // Reparte cartas nuevas para el tumbo y reinicia el contador de bazas,
      // así el equipo decide viendo su mano y no arrastra bazas ya ganadas.
      dealFreshHand(room);
      room.game.playedCards = [];
      room.game.handWins = { 0: 0, 1: 0 };
      notifyRoom(room);
      return;
    }

    // Ronda normal resuelta sin tumbo: reparte cartas nuevas
    room.game.playedCards = [];
    room.game.handWins = { 0: 0, 1: 0 };
    room.game.roundAward = { team: null, points: 0, chico: false };
    room.game.pendingBet = null;
    room.game.nextBetLevel = 4;
    room.game.lastBetTeam = null;
    room.game.betUsedThisRound = false;
    room.game.round += 1;

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
    notifyRoom(room);
    return;
  }

  room.game.playedCards = [];

  room.game.turnPlayerId = winnerEntry.playerId;
  room.game.turnOrder = buildAlternatingTurnOrder(room, winnerEntry.playerId);

  notifyRoom(room);
}

io.on('connection', (socket) => {
  socket.on('create-room', ({ name, mode }) => {
    const roomCode = createRoomCode();
    const room = getRoom(roomCode);
    const playerName = String(name || 'Jugador').trim().slice(0, 18) || 'Jugador';
    const selectedMode = mode === '3v3' ? '3v3' : '2v2';

    room.mode = selectedMode;
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

    const requiredPlayers = getRequiredPlayersForMode(room.mode || '2v2');
    if (room.players.length >= requiredPlayers && !room.players.some((player) => player.id === socket.id)) {
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

    const teamSize = getTeamSizeForMode(room.mode || '2v2');
    if (room.players.filter((entry) => entry.team === teamNumber).length >= teamSize) {
      socket.emit('join-error', 'Ese equipo ya está completo.');
      return;
    }

    player.team = teamNumber;
    player.ready = true;

    const requiredPlayers = getRequiredPlayersForMode(room.mode || '2v2');
    if (room.players.length === requiredPlayers && room.players.every((entry) => entry.team !== null && entry.role !== null)) {
      startGame(room);
    }

    notifyRoom(room);
  });

  socket.on('select-role', ({ role }) => {
    const room = getRoomBySocketId(socket.id);
    if (!room || room.game) return;

    const player = room.players.find((entry) => entry.id === socket.id);
    if (!player || player.team === null || player.role !== null || !['mandador', 'mandado'].includes(role)) return;

    const teamPlayers = room.players.filter((entry) => entry.team === player.team);
    const mandadorCount = teamPlayers.filter((entry) => entry.role === 'mandador').length;
    const mandadoCount = teamPlayers.filter((entry) => entry.role === 'mandado').length;

    if (role === 'mandador' && mandadorCount >= 1) {
      socket.emit('join-error', 'Ese equipo ya tiene un mandador.');
      return;
    }

    if (role === 'mandado' && mandadoCount >= getMandadoLimitForMode(room.mode || '2v2')) {
      socket.emit('join-error', 'Ese equipo ya tiene los mandados completos.');
      return;
    }

    player.role = role;

    const requiredPlayers = getRequiredPlayersForMode(room.mode || '2v2');
    if (room.players.length === requiredPlayers && room.players.every((entry) => entry.team !== null && entry.role !== null)) {
      startGame(room);
    }

    notifyRoom(room);
  });

  socket.on('team-chat', ({ text }) => {
    const room = getRoomBySocketId(socket.id);
    if (!room) return;

    const player = room.players.find((entry) => entry.id === socket.id);
    const allowedMessages = ['chilasco', 'medio flu', 'flu', 'malilla', 'ciego', 'rey', '3 de bastos', '11 de bastos', '10 de oros'];
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
    // Se debe servir siempre el palo que sale (sea o no el de la vira);
    // solo si no se tiene ese palo se puede tirar cualquier otra carta (incluido triunfo).
    if (leadSuit && hasLeadSuit && card.suit !== leadSuit) {
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
    const trickSize = room.game.turnOrder.length || getModeConfig(room.mode || '2v2').trickSize;
    if (room.game.playedCards.length >= trickSize) {
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

    const outcome = applyRoundForfeit(room, abandoningTeam, 'abandono');
    if (outcome === 'finished' || outcome === 'tumbo') {
      notifyRoom(room);
      return;
    }
    reshuffleRound(room);
    notifyRoom(room);
  });

  socket.on('renounce-round', () => {
    const room = getRoomBySocketId(socket.id);
    if (!room || !room.game || room.game.status !== 'playing') return;

    const player = room.players.find((entry) => entry.id === socket.id);
    if (!player || player.role !== 'mandador') return;

    const abandoningTeam = player.team;
    if (abandoningTeam === null || abandoningTeam === undefined) return;

    const outcome = applyRoundForfeit(room, abandoningTeam, 'renuncia');

    if (outcome === 'finished' || outcome === 'tumbo') {
      room.game.history.push({
        round: room.game.round,
        renounced: true,
        player: player.name,
        team: abandoningTeam,
        message: 'El mandador ha renunciado.'
      });
      notifyRoom(room);
      return;
    }

    reshuffleRound(room);
    room.game.history.push({
      round: room.game.round,
      renounced: true,
      player: player.name,
      team: abandoningTeam,
      message: 'El mandador ha renunciado y se han repartido nuevas cartas.'
    });
    notifyRoom(room);
  });

  socket.on('send-bet', ({ level }) => {
    const room = getRoomBySocketId(socket.id);
    if (!room || !room.game || room.game.status === 'tumbo' || room.game.status !== 'playing' || room.game.betUsedThisRound) return;
    
    // Bloquear si hay envite pendiente sin aceptar
    if (room.game.pendingBet && !room.game.pendingBet.accepted) return;

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
    room.game.lastBetTeam = player.team; // Bloquear que el mismo team envíe de nuevo
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
    if (!room || !room.game || !room.game.pendingBet || room.game.pendingBet.accepted) return;

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
        room.game.lastBetTeam = player.team; // Bloquear que el mismo team suba de nuevo
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
      const rejectedByTeam = player.team;

      // Rechazar un envío solo otorga las piedras normales de la ronda
      // (2, o el ajuste de "en 10 piedras"), nunca el valor apostado.
      room.game.pendingBet = null;
      awardStoneForRound(room, winningTeam);
      room.game.lastBetTeam = winningTeam;
      room.game.nextBetLevel = null;
      room.game.betUsedThisRound = true;

      room.game.history.push({
        envio: false,
        team: winningTeam,
        rejectedBy: rejectedByTeam,
        level: rejectedBet.level,
        message: `El envío a ${rejectedBet.level} se rechaza. El equipo ${winningTeam === 0 ? 'A' : 'B'} se anota las piedras normales de la ronda.`
      });

      if (room.game.status === 'finished') {
        notifyRoom(room);
        return;
      }

      if (room.game.scores[winningTeam] >= getModeConfig(room.mode || '2v2').tumboThreshold) {
        room.game.tumboTeam = winningTeam;
        room.game.status = 'tumbo';
        room.game.pendingTumbo = true;
        dealFreshHand(room);
        room.game.playedCards = [];
        room.game.handWins = { 0: 0, 1: 0 };
        notifyRoom(room);
        return;
      }

      // Reparte cartas nuevas e incrementa ronda
      reshuffleRound(room);
      room.game.turnPlayerId = room.game.turnOrder?.[0] || room.players[0].id;
      notifyRoom(room);
      return;
    }

    // ACEPTA envite: mantener pendingBet con accepted = true hasta fin de ronda
    room.game.pendingBet.accepted = true;
    const senderTeam = room.game.pendingBet.challengerTeam;
    // Limpiar lastBetTeam para permitir que el proponente pueda subir después
    room.game.lastBetTeam = null;
    room.game.nextBetLevel = room.game.pendingBet.level === 4 ? 7
      : room.game.pendingBet.level === 7 ? 9
        : room.game.pendingBet.level === 9 ? 'chico-fuera' : null;

    // NO setear roundAward aquí, se usará en awardStoneForRound
    // NO setear pendingBet = null, se mantiene para resolver al fin de ronda
    room.game.history.push({
      envio: true,
      team: senderTeam,
      acceptedBy: room.game.pendingBet.targetTeam,
      level: room.game.pendingBet.level,
      message: 'El envío ha sido aceptado y se liquidará al terminar la ronda.'
    });
    
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
      // Rechaza tumbo: equipo contrario suma 1 piedra
      const otherTeam = 1 - tumboTeam;
      const tumboThreshold = getModeConfig(room.mode || '2v2').tumboThreshold;
      room.game.scores[otherTeam] = Math.min((room.game.scores[otherTeam] || 0) + 1, tumboThreshold);
      room.game.challengeTeam = null;
      room.game.history.push({
        tumbo: false,
        team: tumboTeam,
        decision: 'rechaza',
        score: { ...room.game.scores },
        message: 'No se acepta el tumbo; el equipo contrario gana 1 piedra y se reparten nuevas cartas.'
      });

      // Se reparten cartas nuevas (y cambia la vira) para la siguiente mano.
      dealFreshHand(room);
      room.game.playedCards = [];
      room.game.handWins = { 0: 0, 1: 0 };
      room.game.roundAward = { team: null, points: 0, chico: false };
      room.game.pendingBet = null;
      room.game.nextBetLevel = 4;
      room.game.lastBetTeam = null;
      room.game.betUsedThisRound = false;

      // El equipo que rechazó sigue a 11 (su marcador no baja), así que le vuelve
      // a tocar decidir con las cartas nuevas, salvo que el contrario también
      // haya llegado a 11 con la piedra de consolación: en ese caso ambos están
      // obligados a jugar el tumbo, sin pregunta de por medio.
      const otherAlsoInTumbo = room.game.scores[otherTeam] >= tumboThreshold;

      if (otherAlsoInTumbo) {
        room.game.tumboTeam = null;
        room.game.forcedTumbo = true;
        room.game.pendingTumbo = false;
        room.game.status = 'playing';
        room.game.turnPlayerId = getRandomStarterId(room) || room.players[0]?.id;
        room.game.turnOrder = buildAlternatingTurnOrder(room, room.game.turnPlayerId);
        room.game.history.push({
          message: 'Ambos equipos están en tumbo: se juega esta mano obligatoriamente, sin poder rechazarla.'
        });
        notifyRoom(room);
        return;
      }

      room.game.tumboTeam = tumboTeam;
      room.game.forcedTumbo = false;
      room.game.status = 'tumbo';
      room.game.pendingTumbo = true;
      notifyRoom(room);
      return;
    }

    // Acepta tumbo: se juega hasta ganar 2 de 3 manos
    room.game.pendingTumbo = false;
    room.game.challengeTeam = tumboTeam;
    room.game.history.push({
      tumbo: true,
      team: tumboTeam,
      decision: 'acepta',
      message: 'El equipo en tumbo acepta jugar. Se juega hasta ganar 2 de 3 manos.'
    });

    // Continúa jugando desde donde estaba, contando manos hasta ganar 2
    room.game.status = 'playing';
    room.game.tumboTeam = tumboTeam; // Se mantiene para saber que estamos en tumbo
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

    if (!room.game && room.players.length === getRequiredPlayersForMode(room.mode || '2v2')
      && room.players.every((player) => player.team !== null && player.role !== null)) {
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
