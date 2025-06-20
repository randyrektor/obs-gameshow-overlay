import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { eventLogger } from './eventLogger';
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

// Start a new logging session when server starts
eventLogger.startNewSession();

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
    
    // Log game type change
    eventLogger.logGameTypeChange(type, gameConfig);
    
    emitGameState();
  });

  socket.on('admin:setGameConfig', (config: any) => {
    console.log('Setting game config:', config);
    gameConfig = config;
    buzzOrder = [];
    answers = {};
    revealAnswers = false;
    correctAnswer = null;
    
    // Log question change if present
    if (config.currentQuestionIndex !== undefined) {
      const questions = config.questions || [];
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
    
    // Log answer reveal
    eventLogger.logAnswerReveal(correctAnswer || '', answers);
    
    emitGameState();
  });

  socket.on('admin:resetBuzzers', () => {
    contestants.forEach(c => c.buzzed = false);
    buzzOrder = [];
    answers = {};
    revealAnswers = false;
    correctAnswer = null;
    
    // Log buzzer reset
    eventLogger.logEvent('buzzer_reset', { timestamp: Date.now() });
    
    emitGameState();
  });

  // Contestant events
  socket.on('buzz', (contestantId: string) => {
    const contestant = contestants.find(c => c.id === contestantId);
    if (contestant && !contestant.buzzed && gameType === 'buzzer') {
      contestant.buzzed = true;
      buzzOrder.push(contestantId);
      
      // Log contestant buzz
      eventLogger.logContestantBuzz(contestantId, contestant.name, buzzOrder.length);
      
      emitGameState();
    }
  });

  socket.on('submitAnswer', (data: { contestantId: string; answer: string }) => {
    const contestant = contestants.find(c => c.id === data.contestantId);
    if (contestant) {
      answers[data.contestantId] = data.answer;
      
      // Log answer submission
      const isCorrect = correctAnswer ? data.answer === correctAnswer : undefined;
      eventLogger.logAnswerSubmission(data.contestantId, contestant.name, data.answer, isCorrect);
      
      emitGameState();
    }
  });

  // Admin score updates
  socket.on('admin:updateScore', (data: { contestantId: string; score: number }) => {
    const contestant = contestants.find(c => c.id === data.contestantId);
    if (contestant) {
      const oldScore = contestant.score;
      contestant.score = data.score;
      
      // Log score update
      eventLogger.logScoreUpdate(data.contestantId, contestant.name, oldScore, data.score);
      
      emitGameState();
    }
  });

  // Timer events
  socket.on('admin:startTimer', (duration: number) => {
    console.log('Starting timer:', duration);
    startTimer(duration);
    
    // Log timer start
    eventLogger.logTimerStart(duration);
  });

  socket.on('admin:stopTimer', () => {
    console.log('Stopping timer');
    const remainingTime = gameConfig.timerRemaining || 0;
    stopTimer();
    
    // Log timer stop
    eventLogger.logTimerStop(remainingTime);
  });

  // Contestant management
  socket.on('admin:contestantAdded', (contestant: Contestant) => {
    console.log('Contestant added via socket:', contestant);
    contestants.push(contestant);
    
    // Log contestant addition
    eventLogger.logEvent('contestant_added', {
      contestantId: contestant.id,
      contestantName: contestant.name,
      timestamp: Date.now()
    });
    
    emitGameState();
  });

  socket.on('admin:removeContestant', (contestantId: string) => {
    const index = contestants.findIndex(c => c.id === contestantId);
    if (index !== -1) {
      const contestant = contestants[index];
      contestants.splice(index, 1);
      
      // Log contestant removal
      eventLogger.logEvent('contestant_removed', {
        contestantId,
        contestantName: contestant.name,
        timestamp: Date.now()
      });
      
      emitGameState();
    }
  });

  socket.on('admin:resetScores', () => {
    contestants.forEach(contestant => {
      const oldScore = contestant.score;
      contestant.score = 0;
      
      // Log score reset
      eventLogger.logScoreUpdate(contestant.id, contestant.name, oldScore, 0, 'reset');
    });
    
    emitGameState();
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

// Add new endpoints for exporting logs
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

app.post('/api/logs/end-session', (req, res) => {
  try {
    const { sessionId, fps } = req.body;
    
    // This is a simplified approach. A more robust solution would be to
    // find the log file on disk using the sessionId and read its contents.
    const eventsForSession = eventLogger.getEventsForSession(sessionId);

    if (!eventsForSession) {
      return res.status(404).json({ success: false, error: 'Session not found or events are gone.' });
    }

    const xml = eventLogger.exportToDaVinciResolveXML(fps || 29.97, eventsForSession);
    
    // Now that we have the data, we can "end" the session in memory.
    eventLogger.endCurrentSession();

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="davinci-markers-session-${sessionId}.xml"`);
    res.send(xml);

  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ success: false, error: 'Failed to end session' });
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

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 