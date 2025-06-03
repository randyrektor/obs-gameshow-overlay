import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { recordingService } from './recordingService';
import path from 'path';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

// Create recordings directory if it doesn't exist
const recordingsDir = path.join(__dirname, '../recordings');
if (!require('fs').existsSync(recordingsDir)) {
  require('fs').mkdirSync(recordingsDir, { recursive: true });
}

// Serve recordings directory
app.use('/recordings', express.static(path.join(__dirname, '../recordings')));

// Recording endpoints
app.post('/start-recording', async (req, res) => {
  try {
    const { overlayType, duration, fps, preRoll, postRoll } = req.body;
    const outputPath = await recordingService.startRecording({
      overlayType,
      duration,
      fps,
      preRoll,
      postRoll
    });
    res.json({ success: true, videoPath: outputPath });
  } catch (error) {
    console.error('Error starting recording:', error);
    res.status(500).json({ success: false, error: 'Failed to start recording' });
  }
});

app.post('/stop-recording', async (req, res) => {
  try {
    await recordingService.stopRecording();
    res.json({ success: true });
  } catch (error) {
    console.error('Error stopping recording:', error);
    res.status(500).json({ success: false, error: 'Failed to stop recording' });
  }
});

// Game state
interface Contestant {
  id: string;
  name: string;
  score: number;
  buzzed: boolean;
}

interface GameState {
  contestants: Contestant[];
  buzzOrder: string[];
  gameType: 'buzzer' | 'multiple-choice' | 'two-option' | 'timer-only';
  gameConfig: any;
  answers: Record<string, string>;
  revealAnswers: boolean;
  correctAnswer: string | null;
}

const contestants: Contestant[] = [];
let buzzOrder: string[] = [];
let gameType: 'buzzer' | 'multiple-choice' | 'two-option' | 'timer-only' = 'buzzer';
let gameConfig: any = {};
let answers: Record<string, string> = {};
let revealAnswers = false;
let correctAnswer: string | null = null;
let timerInterval: NodeJS.Timeout | null = null;

function emitGameState() {
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

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join', (room: string) => {
    socket.join(room);
    console.log(`Client ${socket.id} joined room: ${room}`);
    // Send current game state to the joining socket
    console.log('Sending initial game state:', {
      contestants,
      buzzOrder,
      gameType,
      gameConfig,
      answers,
      revealAnswers,
      correctAnswer,
    });
    socket.emit('gameState', {
      contestants,
      buzzOrder,
      gameType,
      gameConfig,
      answers,
      revealAnswers,
      correctAnswer,
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  // Admin events
  socket.on('admin:setGameType', (type: 'buzzer' | 'multiple-choice' | 'two-option' | 'timer-only') => {
    console.log('Setting game type:', type);
    gameType = type;
    buzzOrder = [];
    answers = {};
    revealAnswers = false;
    correctAnswer = null;
    gameConfig = {};
    emitGameState();
  });

  socket.on('admin:setGameConfig', (config: any) => {
    console.log('Setting game config:', config);
    gameConfig = config;
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
    emitGameState();
  });

  socket.on('admin:resetBuzzers', () => {
    contestants.forEach(c => c.buzzed = false);
    buzzOrder = [];
    answers = {};
    revealAnswers = false;
    correctAnswer = null;
    emitGameState();
  });

  socket.on('admin:resetScores', () => {
    contestants.forEach(c => c.score = 0);
    emitGameState();
  });

  socket.on('admin:updateScore', (data: { contestantId: string, score: number }) => {
    console.log('Updating score:', data);
    const contestant = contestants.find(c => c.id === data.contestantId);
    if (contestant) {
      contestant.score = data.score;
      emitGameState();
    }
  });

  socket.on('admin:removeContestant', (contestantId: string) => {
    const idx = contestants.findIndex(c => c.id === contestantId);
    if (idx !== -1) {
      contestants.splice(idx, 1);
      buzzOrder = buzzOrder.filter(id => id !== contestantId);
      delete answers[contestantId];
      emitGameState();
    }
  });

  socket.on('admin:reorderContestants', (newOrder: string[]) => {
    const idToContestant = Object.fromEntries(contestants.map(c => [c.id, c]));
    const reordered = newOrder.map(id => idToContestant[id]).filter(Boolean);
    if (reordered.length === contestants.length) {
      contestants.splice(0, contestants.length, ...reordered);
      emitGameState();
    }
  });

  socket.on('admin:startTimer', (duration: number) => {
    console.log('Starting timer:', duration);
    startTimer(duration);
  });

  socket.on('admin:stopTimer', () => {
    console.log('Stopping timer');
    stopTimer();
  });

  socket.on('admin:setTimerDuration', (duration: number) => {
    gameConfig.timerDuration = duration;
    emitGameState();
  });

  socket.on('admin:contestantAdded', (contestant: Contestant) => {
    console.log('Contestant added via socket:', contestant);
    const existingIndex = contestants.findIndex(c => c.id === contestant.id);
    if (existingIndex === -1) {
      contestants.push(contestant);
      emitGameState();
    }
  });
});

// Admin API endpoints
app.post('/api/contestants', (req, res) => {
  console.log('Received request to add contestant:', req.body);
  const { name } = req.body;
  
  if (!name) {
    console.error('No name provided in request');
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const contestant: Contestant = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      score: 0,
      buzzed: false
    };
    console.log('Creating new contestant:', contestant);
    contestants.push(contestant);
    console.log('Current contestants:', contestants);
    emitGameState();
    console.log('Emitting game state after adding contestant');
    res.json(contestant);
  } catch (error) {
    console.error('Error adding contestant:', error);
    res.status(500).json({ error: 'Failed to add contestant' });
  }
});

app.get('/api/contestants', (req, res) => {
  console.log('Getting all contestants:', contestants);
  res.json(contestants);
});

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 