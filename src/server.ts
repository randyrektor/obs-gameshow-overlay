import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Import eventLogger for recording functionality
import { EventLogger } from './eventLogger';
import { registerEndSessionRoute } from './endSessionRoute';

dotenv.config();

const app: express.Express = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 5000,
  pingInterval: 2000
});

// Initialize event logger
const eventLogger = new EventLogger();

app.use(cors());
app.use(express.json());

// Serve static files from the React build
const clientBuildPath = path.join(__dirname, '..', 'client-new', 'build');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
}

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
    questions,
    currentQuestionIndex,
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
      
      // Log timer tick every 5 seconds or when it's about to end
      if (gameConfig.timerRemaining % 5 === 0 || gameConfig.timerRemaining <= 3) {
        eventLogger.logTimerTick(gameConfig.timerRemaining);
      }
      
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

function resumeTimer() {
  if (gameConfig.timerRemaining && gameConfig.timerRemaining > 0 && !gameConfig.timerRunning) {
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
      questions,
      currentQuestionIndex,
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
          questions,
          currentQuestionIndex,
          answers,
          revealAnswers,
          correctAnswer,
        });
      }
    }
  });

  socket.on('buzz', async (data: string | { contestantId: string, clientTimestamp?: number }) => {
    // Capture server receive time immediately for accurate timing
    const serverReceiveTime = Date.now();
    
    // Support both old format (just string) and new format (object with timestamp)
    const contestantId = typeof data === 'string' ? data : data.contestantId;
    const clientTimestamp = typeof data === 'object' ? data.clientTimestamp : undefined;
    
    console.log('Buzz received from:', contestantId, clientTimestamp ? `(client: ${clientTimestamp}, latency: ${serverReceiveTime - clientTimestamp}ms)` : '');
    
    if (gameType !== 'buzzer') return;
    
    const contestant = contestants.find(c => c.id === contestantId);
    if (!contestant) return;
    
    // Atomic check and update - prevent race conditions
    if (contestant.buzzed) {
      console.log(`Duplicate buzz ignored from ${contestant.name}`);
      return;
    }
    
    // Set buzzed flag immediately
    contestant.buzzed = true;
    
    // Add to buzz order only if not already present (additional safety check)
    if (!buzzOrder.includes(contestantId)) {
      buzzOrder.push(contestantId);
    }
    
    // Log contestant buzz with full timing data
    eventLogger.logContestantBuzz(contestantId, contestant.name, buzzOrder.length, serverReceiveTime, clientTimestamp);
    
    emitGameState();
  });

  socket.on('submitAnswer', ({ contestantId, answer }) => {
    if ((gameType === 'multiple-choice' || gameType === 'two-option') && !revealAnswers) {
      answers[contestantId] = answer;
      
      // Log answer submission
      const contestant = contestants.find(c => c.id === contestantId);
      if (contestant) {
        const isCorrect = correctAnswer ? answer === correctAnswer : undefined;
        eventLogger.logAnswerSubmission(contestantId, contestant.name, answer, isCorrect);
      }
      
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
    
    // Log game type change
    eventLogger.logGameTypeChange(type, gameConfig);
    
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
    
    // Log question change if present
    if (config.currentQuestionIndex !== undefined) {
      const currentQuestion = questions[config.currentQuestionIndex];
      eventLogger.logQuestionChange(
        config.currentQuestionIndex,
        currentQuestion?.question,
        currentQuestion?.options
      );
    }
    
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
    
    // Log answer reveal
    eventLogger.logAnswerReveal(correctAnswer || '', answers);
    
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
    contestants.forEach(contestant => {
      const oldScore = contestant.score;
      contestant.score = 0;
      
      // Log score reset
      eventLogger.logScoreUpdate(contestant.id, contestant.name, oldScore, 0, 'reset');
    });
    emitGameState();
  });

  socket.on('admin:updateScore', (data: { contestantId: string, score: number }) => {
    console.log('Score update:', data);
    const contestant = contestants.find(c => c.id === data.contestantId);
    if (contestant) {
      const oldScore = contestant.score;
      contestant.score = data.score;
      
      // Log score update
      eventLogger.logScoreUpdate(contestant.id, contestant.name, oldScore, data.score);
      
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
      const contestant = contestants[idx];
      contestants.splice(idx, 1);
      buzzOrder = buzzOrder.filter(id => id !== contestantId);
      delete answers[contestantId];
      
      // Log contestant removal
      eventLogger.logEvent('contestant_removed', {
        contestantId,
        contestantName: contestant.name,
        timestamp: Date.now()
      });
      
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
    
    // Log timer start
    eventLogger.logTimerStart(duration);
  });

  socket.on('admin:stopTimer', () => {
    const remainingTime = gameConfig.timerRemaining || 0;
    stopTimer();
    
    // Log timer stop
    eventLogger.logTimerStop(remainingTime);
  });

  socket.on('admin:resumeTimer', () => {
    resumeTimer();
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
  
  // Log contestant addition
  eventLogger.logEvent('contestant_added', {
    contestantId: contestant.id,
    contestantName: contestant.name,
    timestamp: Date.now()
  });
  
  emitGameState();
  res.json(contestant);
});

app.get('/api/contestants', (req, res) => {
  console.log('Getting contestants');
  res.json(contestants);
});

// Recording API endpoints
app.post('/api/logs/start-session', (req, res) => {
  try {
    eventLogger.startNewSession();
    res.json({ 
      success: true, 
      sessionId: eventLogger.getSessionId(),
      logFile: eventLogger.getCurrentLogFile()
    });
  } catch (error) {
    console.error('Error starting new session:', error);
    res.status(500).json({ success: false, error: 'Failed to start new session' });
  }
});

app.get('/api/logs/session-info', (req, res) => {
  try {
    const sessionInfo = eventLogger.getSessionInfo();
    res.json({ 
      success: true, 
      sessionInfo
    });
  } catch (error) {
    console.error('Error getting session info:', error);
    res.status(500).json({ success: false, error: 'Failed to get session info' });
  }
});

app.get('/api/logs/export/markers', (req, res) => {
  try {
    const fps = parseInt(req.query.fps as string) || 30;
    const markers = eventLogger.exportToDaVinciResolveMarkers(fps);
    res.json({ success: true, markers });
  } catch (error) {
    console.error('Error exporting markers:', error);
    res.status(500).json({ success: false, error: 'Failed to export markers' });
  }
});

app.get('/api/logs/export/xml', (req, res) => {
  try {
    const fps = parseFloat(req.query.fps as string) || 30;
    const xml = eventLogger.exportToDaVinciResolveXML(fps);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', 'attachment; filename="davinci-markers.xml"');
    res.send(xml);
  } catch (error) {
    console.error('Error exporting XML:', error);
    res.status(500).json({ success: false, error: 'Failed to export XML' });
  }
});

app.get('/api/logs/export/csv', (req, res) => {
  try {
    const csv = eventLogger.exportToCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="game-events.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ success: false, error: 'Failed to export CSV' });
  }
});

// Catch-all handler for React Router - must be last
if (fs.existsSync(clientBuildPath)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

registerEndSessionRoute(app, eventLogger);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 