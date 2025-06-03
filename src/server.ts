import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import fs from 'fs';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 5000,
  pingInterval: 2000
});

app.use(cors());
app.use(express.json());

// Game state
interface Contestant {
  id: string;
  name: string;
  score: number;
  buzzed: boolean;
  connected: boolean;
}

type GameType = 'buzzer' | 'multiple-choice' | 'two-option' | 'timer-only';

interface Question {
  question: string;
  options: string[];
  correctAnswer: string;
}

interface GameConfig {
  question?: string;
  options?: string[];
  questions?: Question[];
  currentQuestionIndex?: number;
  timerDuration?: number; // in seconds
  timerRunning?: boolean;
  timerRemaining?: number;
}

const contestants: Contestant[] = [];
let buzzOrder: string[] = [];
let gameType: GameType = 'buzzer';
let gameConfig: GameConfig = {};
let answers: Record<string, string> = {}; // contestantId -> answer/choice
let revealAnswers = false;
let correctAnswer: string | null = null;
let timerInterval: NodeJS.Timeout | null = null;

let questions: Question[] = [];
let currentQuestionIndex = 0;

// Add socket mapping
const socketToContestant = new Map<string, string>(); // socket.id -> contestantId

function emitGameState() {
  let configToSend = gameConfig;
  if (gameType === 'multiple-choice') {
    // Don't override the config for multiple-choice, just ensure options are present
    configToSend = {
      ...gameConfig,
      options: gameConfig.options || ['A', 'B', 'C', 'D']
    };
  } else if (gameType === 'two-option') {
    // Only send options if valid (length 2, not empty, not 'a')
    const opts = (gameConfig.options || []).filter(
      opt => opt && opt.trim().length > 0 && opt.trim().toLowerCase() !== 'a'
    );
    configToSend = { ...gameConfig, options: opts };
  }
  io.emit('gameState', {
    contestants,
    buzzOrder,
    gameType,
    gameConfig: configToSend,
    answers,
    revealAnswers,
    correctAnswer,
  });
}

function startTimer(duration: number) {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  
  gameConfig.timerRemaining = duration;
  gameConfig.timerRunning = true;
  emitGameState();

  timerInterval = setInterval(() => {
    if (gameConfig.timerRemaining && gameConfig.timerRemaining > 0) {
      gameConfig.timerRemaining--;
      emitGameState();
    } else {
      stopTimer();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  gameConfig.timerRunning = false;
  emitGameState();
}

// Socket.IO event handlers
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join', (contestantId: string) => {
    console.log('Contestant joining:', contestantId);
    const contestant = contestants.find(c => c.id === contestantId);
    if (contestant) {
      socket.join(contestantId);
      contestant.connected = true;
      socketToContestant.set(socket.id, contestantId);
      emitGameState();
    }
    // Always send the current game state to the joining socket
    socket.emit('gameState', {
      contestants,
      buzzOrder,
      gameType,
      gameConfig: gameType === 'multiple-choice' ? {
        ...gameConfig,
        options: gameConfig.options || ['A', 'B', 'C', 'D']
      } : (gameType === 'two-option' ? {
        ...gameConfig,
        options: (gameConfig.options || []).filter(opt => opt && opt.trim().length > 0 && opt.trim().toLowerCase() !== 'a')
      } : gameConfig),
      answers,
      revealAnswers,
      correctAnswer,
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const contestantId = socketToContestant.get(socket.id);
    if (contestantId) {
      const contestant = contestants.find(c => c.id === contestantId);
      if (contestant) {
        console.log(`Setting contestant ${contestant.name} (${contestant.id}) to disconnected`);
        contestant.connected = false;
        socketToContestant.delete(socket.id);
        // Force immediate state update
        io.emit('gameState', {
          contestants,
          buzzOrder,
          gameType,
          gameConfig,
          answers,
          revealAnswers,
          correctAnswer,
        });
      }
    }
  });

  socket.on('buzz', async (contestantId: string) => {
    console.log('Buzz received from:', contestantId);
    if (gameType !== 'buzzer') return;
    const contestant = contestants.find(c => c.id === contestantId);
    if (contestant && !contestant.buzzed) {
      contestant.buzzed = true;
      if (!buzzOrder.includes(contestantId)) {
        buzzOrder.push(contestantId);
      }
      emitGameState();
    }
  });

  socket.on('submitAnswer', ({ contestantId, answer }) => {
    if ((gameType === 'multiple-choice' || gameType === 'two-option') && !revealAnswers) {
      answers[contestantId] = answer;
      emitGameState();
    }
  });

  socket.on('admin:setGameType', (type: GameType) => {
    gameType = type;
    // Reset round state
    buzzOrder = [];
    answers = {};
    revealAnswers = false;
    correctAnswer = null;
    // Clear game config when switching modes
    gameConfig = {};
    // Clear questions when switching from multiple choice
    if (type !== 'multiple-choice') {
      questions = [];
      currentQuestionIndex = 0;
    }
    // Stop timer when switching game types
    stopTimer();
    // Trigger recording for game type change
    emitGameState();
  });

  socket.on('admin:setQuestions', (newQuestions: Question[]) => {
    questions = newQuestions;
    currentQuestionIndex = 0;
    emitGameState();
  });

  socket.on('admin:setGameConfig', (config: GameConfig) => {
    gameConfig = config;
    // Reset round state
    buzzOrder = [];
    answers = {};
    revealAnswers = false;
    correctAnswer = null;
    emitGameState();
  });

  socket.on('admin:setCorrectAnswer', (answer: string) => {
    correctAnswer = answer;
    emitGameState();
  });

  socket.on('admin:revealAnswers', () => {
    revealAnswers = true;
    if (gameType === 'multiple-choice' && correctAnswer) {
      contestants.forEach(contestant => {
        const answer = answers[contestant.id];
        if (answer === correctAnswer) {
          contestant.score += 1;
        }
      });
    }
    emitGameState();
  });

  socket.on('admin:resetBuzzers', () => {
    console.log('Resetting buzzers');
    contestants.forEach(c => c.buzzed = false);
    buzzOrder = [];
    answers = {};
    revealAnswers = false;
    correctAnswer = null;
    emitGameState();
  });

  socket.on('admin:resetScores', () => {
    console.log('Resetting all scores to 0');
    contestants.forEach(c => c.score = 0);
    emitGameState();
  });

  socket.on('admin:updateScore', (data: { contestantId: string, score: number }) => {
    console.log('Score update:', data);
    const contestant = contestants.find(c => c.id === data.contestantId);
    if (contestant) {
      const oldScore = contestant.score;
      contestant.score = data.score;
      
      if (gameType === 'buzzer' && data.score > oldScore) {
        contestants.forEach(c => c.buzzed = false);
        buzzOrder = [];
      }
      emitGameState();
    }
  });

  socket.on('admin:removeContestant', (contestantId: string) => {
    console.log('Removing contestant:', contestantId);
    const idx = contestants.findIndex(c => c.id === contestantId);
    if (idx !== -1) {
      contestants.splice(idx, 1);
      buzzOrder = buzzOrder.filter(id => id !== contestantId);
      delete answers[contestantId];
      emitGameState();
    }
  });

  socket.on('admin:reorderContestants', (newOrder: string[]) => {
    console.log('Reordering contestants:', newOrder);
    // Reorder contestants array to match newOrder
    const idToContestant = Object.fromEntries(contestants.map(c => [c.id, c]));
    const reordered = newOrder.map(id => idToContestant[id]).filter(Boolean);
    if (reordered.length === contestants.length) {
      contestants.splice(0, contestants.length, ...reordered);
      emitGameState();
    }
  });

  socket.on('admin:startTimer', (duration: number) => {
    startTimer(duration);
  });

  socket.on('admin:stopTimer', () => {
    stopTimer();
  });

  socket.on('admin:setTimerDuration', (duration: number) => {
    gameConfig.timerDuration = duration;
    emitGameState();
  });
});

// Admin API endpoints
app.post('/api/contestants', (req, res) => {
  console.log('Adding contestant:', req.body);
  const { name } = req.body;
  const contestant: Contestant = {
    id: Math.random().toString(36).substr(2, 9),
    name,
    score: 0,
    buzzed: false,
    connected: false
  };
  contestants.push(contestant);
  emitGameState();
  res.json(contestant);
});

app.get('/api/contestants', (req, res) => {
  console.log('Getting contestants');
  res.json(contestants);
});

// Create recordings directory if it doesn't exist
const recordingsDir = path.join(os.homedir(), 'Desktop', 'Test Animations');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// Serve recordings directory
app.use('/recordings', express.static(recordingsDir));

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 