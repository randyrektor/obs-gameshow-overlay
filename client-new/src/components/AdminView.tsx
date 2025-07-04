import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from '../utils/config';
import {
  Box,
  Button,
  Typography,
  Paper,
  TextField,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tooltip,
  Chip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Stack,
  Table,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import StopIcon from '@mui/icons-material/Stop';

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
  timerDuration?: number;
  timerRunning?: boolean;
  timerRemaining?: number;
}

interface GameState {
  contestants: Contestant[];
  buzzOrder?: string[];
  gameType?: GameType;
  gameConfig?: GameConfig;
  questions?: Question[];
  currentQuestionIndex?: number;
  answers?: Record<string, string>;
  revealAnswers?: boolean;
  correctAnswer?: string;
}

const AdminView: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState>({ contestants: [] });
  const [newContestantName, setNewContestantName] = useState('');
  const [gameType, setGameType] = useState<GameType>('buzzer');
  const [gameConfig, setGameConfig] = useState<GameConfig>({});
  const [revealAnswers, setRevealAnswers] = useState(false);
  const [optionsInput, setOptionsInput] = useState<string>('');
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timerMinutes, setTimerMinutes] = useState<string>('1');
  const [timerSeconds, setTimerSeconds] = useState<string>('0');
  const [resetScoresDialogOpen, setResetScoresDialogOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<any>(null);

  useEffect(() => {
    const newSocket = io(config.websocketUrl);
    console.log('Connecting to WebSocket server...');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('WebSocket connected successfully');
      // Request current game state from server
      newSocket.emit('join', 'admin');
    });

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    newSocket.on('gameState', (state: GameState) => {
      console.log('Received game state:', state);
      setGameState(state);
      if (state.gameType) {
        console.log('Setting game type:', state.gameType);
        setGameType(state.gameType);
      }
      if (state.gameConfig) {
        console.log('Setting game config:', state.gameConfig);
        setGameConfig(state.gameConfig);
        if (state.gameConfig.currentQuestionIndex !== undefined) {
          setCurrentQuestionIndex(state.gameConfig.currentQuestionIndex);
        }
      }
      if (state.questions) {
        console.log('Setting questions:', state.questions);
        setQuestions(state.questions);
      }
      if (state.currentQuestionIndex !== undefined) {
        console.log('Setting current question index:', state.currentQuestionIndex);
        setCurrentQuestionIndex(state.currentQuestionIndex);
      }
      setRevealAnswers(!!state.revealAnswers);
      setCorrectAnswer(state.correctAnswer || null);
    });

    newSocket.on('contestantAdded', (contestant: Contestant) => {
      console.log('Contestant added:', contestant);
      setGameState(prev => ({
        ...prev,
        contestants: [...prev.contestants, contestant]
      }));
    });

    return () => {
      console.log('Cleaning up WebSocket connection');
      newSocket.close();
    };
  }, []);

  const handleAddContestant = async () => {
    if (!newContestantName.trim()) {
      console.error('Cannot add contestant: name is empty');
      return;
    }
    console.log('Attempting to add contestant:', newContestantName);

    try {
      console.log('Sending POST request to /api/contestants');
      const response = await fetch(`${config.apiUrl}/api/contestants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newContestantName }),
      });

      console.log('Received response:', response.status);
      const data = await response.json();
      
      if (response.ok) {
        console.log('Contestant added successfully:', data);
        if (socket) {
          console.log('Emitting admin:contestantAdded event');
          socket.emit('admin:contestantAdded', data);
        }
        setNewContestantName('');
      } else {
        console.error('Failed to add contestant:', data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error in handleAddContestant:', error);
    }
  };

  const handleUpdateScore = (contestantId: string, newScore: number) => {
    console.log('Updating score:', { contestantId, newScore });
    if (socket) {
      socket.emit('admin:updateScore', { contestantId, score: newScore });
    }
  };

  const handleResetBuzzers = () => {
    console.log('Resetting buzzers');
    if (socket) {
      socket.emit('admin:resetBuzzers');
    }
  };

  const handleResetScores = () => {
    setResetScoresDialogOpen(true);
  };

  const handleConfirmResetScores = () => {
    if (socket) {
      socket.emit('admin:resetScores');
    }
    setResetScoresDialogOpen(false);
  };

  const copyContestantUrl = (contestantId: string) => {
    const url = `${config.frontendUrl}/contestant/${contestantId}`;
    navigator.clipboard.writeText(url);
  };

  const copyAllUrls = () => {
    const formattedList = gameState.contestants
      .map(c => `${c.name}: ${config.frontendUrl}/contestant/${c.id}`)
      .join('\n');
    navigator.clipboard.writeText(formattedList);
  };

  const copyAllUrlsOnly = () => {
    const urlsOnly = gameState.contestants
      .map(c => `${config.frontendUrl}/contestant/${c.id}`)
      .join('\n');
    navigator.clipboard.writeText(urlsOnly);
  };

  const getBuzzOrder = (id: string) => {
    if (!gameState.buzzOrder) return null;
    const idx = gameState.buzzOrder.indexOf(id);
    return idx !== -1 ? idx + 1 : null;
  };

  const handleRemoveContestant = (contestantId: string) => {
    if (socket) {
      socket.emit('admin:removeContestant', contestantId);
    }
  };

  const handleReorder = (result: DropResult) => {
    if (!result.destination || !socket) return;
    const reordered = Array.from(gameState.contestants);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    // Optimistically update the state for a smooth UI transition.
    // The server will send a final gameState update shortly.
    setGameState(prev => ({
      ...prev,
      contestants: reordered
    }));

    socket.emit('admin:reorderContestants', reordered.map(c => c.id));
  };

  const handleGameTypeChange = (e: any) => {
    const type = e.target.value as GameType;
    setGameType(type);
    setGameConfig({});
    setOptionsInput('');
    if (socket) socket.emit('admin:setGameType', type);
  };

  const handleConfigChange = (field: string, value: string) => {
    const newConfig = { ...gameConfig, [field]: value };
    setGameConfig(newConfig);
    if (socket) socket.emit('admin:setGameConfig', newConfig);
  };

  const handleOptionsChange = (value: string) => {
    setOptionsInput(value);
    const opts = value
      .split(',')
      .map(opt => opt.trim())
      .filter(opt => opt.length > 0 && opt.toLowerCase() !== 'a');
    const newConfig = { ...gameConfig, options: opts };
    setGameConfig(newConfig);
    if (socket) socket.emit('admin:setGameConfig', newConfig);
  };

  const handleRevealAnswers = () => {
    if (socket) socket.emit('admin:revealAnswers');
  };

  const handleSetCorrectAnswer = (answer: string) => {
    setCorrectAnswer(answer);
    if (socket) socket.emit('admin:setCorrectAnswer', answer);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n');
      const parsedQuestions: Question[] = lines
        .filter(line => line.trim())
        .map(line => {
          const [question, a, b, c, d, correct] = line.split(',').map(item => item.trim());
          return {
            question,
            options: [a, b, c, d],
            correctAnswer: correct
          };
        });

      setQuestions(parsedQuestions);
      if (socket) {
        socket.emit('admin:setGameType', 'multiple-choice');
        
        socket.emit('admin:setQuestions', parsedQuestions);
        
        const firstQuestion = parsedQuestions[0];
        const newConfig = {
          question: firstQuestion.question,
          options: firstQuestion.options,
          questions: parsedQuestions,
          currentQuestionIndex: 0
        };
        socket.emit('admin:setGameConfig', newConfig);
        
        socket.emit('admin:setCorrectAnswer', firstQuestion.correctAnswer);
      }
    };
    reader.readAsText(file);
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      const question = questions[nextIndex];
      const newConfig = {
        ...gameConfig,
        question: question.question,
        options: question.options,
        questions: questions,
        currentQuestionIndex: nextIndex
      };
      setGameConfig(newConfig);
      if (socket) {
        socket.emit('admin:setGameConfig', newConfig);
        socket.emit('admin:setCorrectAnswer', question.correctAnswer);
      }
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      const prevIndex = currentQuestionIndex - 1;
      setCurrentQuestionIndex(prevIndex);
      const question = questions[prevIndex];
      const newConfig = {
        ...gameConfig,
        question: question.question,
        options: question.options,
        questions: questions,
        currentQuestionIndex: prevIndex
      };
      setGameConfig(newConfig);
      if (socket) {
        socket.emit('admin:setGameConfig', newConfig);
        socket.emit('admin:setCorrectAnswer', question.correctAnswer);
      }
    }
  };

  const handleStartTimer = () => {
    console.log('Starting timer');
    if (socket) {
      const minutes = parseInt(timerMinutes) || 0;
      const seconds = parseInt(timerSeconds) || 0;
      const totalSeconds = minutes * 60 + seconds;
      console.log('Timer duration:', totalSeconds);
      socket.emit('admin:startTimer', totalSeconds);
    }
  };

  const handleStopTimer = () => {
    if (socket) {
      socket.emit('admin:stopTimer');
    }
  };

  const handleResumeTimer = () => {
    if (socket) {
      socket.emit('admin:resumeTimer');
    }
  };

  const handleStopOrResumeTimer = () => {
    if (gameConfig.timerRunning) {
      handleStopTimer();
    } else {
      handleResumeTimer();
    }
  };

  const handleTimerMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTimerMinutes(value);
    const minutes = parseInt(value);
    const seconds = parseInt(timerSeconds) || 0;
    if (!isNaN(minutes) && minutes >= 0) {
      if (socket) {
        const totalSeconds = minutes * 60 + seconds;
        socket.emit('admin:setTimerDuration', totalSeconds);
      }
    }
  };

  const handleTimerSecondsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    // Only allow 0-59
    if (value !== '' && (!/^[0-9]+$/.test(value) || parseInt(value) > 59)) {
      return;
    }
    setTimerSeconds(value);
    const minutes = parseInt(timerMinutes) || 0;
    const seconds = parseInt(value);
    if (!isNaN(seconds) && seconds >= 0 && seconds <= 59) {
      if (socket) {
        const totalSeconds = minutes * 60 + seconds;
        socket.emit('admin:setTimerDuration', totalSeconds);
      }
    }
  };

  const formatTime = (seconds: number | undefined): string => {
    if (seconds === undefined) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatRemainingTime = (milliseconds: number | null): string => {
    if (milliseconds === null) return '';
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const handleStartNewSession = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/logs/start-session`, {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        setSessionId(data.sessionId);
        setIsRecording(true);
        console.log('New recording session started:', data);
        // Fetch initial session info
        fetchSessionInfo();
      } else {
        console.error('Failed to start new session');
      }
    } catch (error) {
      console.error('Error starting new session:', error);
    }
  };

  const fetchSessionInfo = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/logs/session-info`);
      if (response.ok) {
        const data = await response.json();
        setSessionInfo(data.sessionInfo);
        
        // If session is no longer active, update recording state
        if (!data.sessionInfo.isActive && isRecording) {
          setIsRecording(false);
          setSessionId('');
          setSessionInfo(null);
        }
      }
    } catch (error) {
      console.error('Error fetching session info:', error);
    }
  };

  // Poll session info when recording is active
  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(fetchSessionInfo, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleEndSession = async () => {
    if (!sessionId) return;
    try {
      const response = await fetch(`${config.apiUrl}/api/logs/end-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, fps: 29.97 }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `davinci-markers-session-${sessionId.substring(0, 8)}.xml`;
        a.click();
        URL.revokeObjectURL(url);
        console.log('Session ended and XML exported.');
      } else {
        console.error('Failed to end session and export XML');
      }
    } catch (error) {
      console.error('Error ending session:', error);
    } finally {
      setIsRecording(false);
      setSessionId('');
      setSessionInfo(null);
    }
  };

  return (
    <Box sx={{ p: 3, minHeight: '100vh', backgroundColor: 'background.default' }}>
      <Typography variant="h3" gutterBottom sx={{ color: 'primary.main', mb: 4 }}>
        Syntax Admin Panel
      </Typography>

      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Game Control
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleResetBuzzers}
            sx={{ 
              minHeight: 36,
              minWidth: 120
            }}
          >
            Reset Buzzers
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleResetScores}
            sx={{ 
              minHeight: 36,
              minWidth: 120
            }}
          >
            Reset Scores
          </Button>
          
          {/* Recording Session Controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: 'auto' }}>
            {!isRecording ? (
              <Tooltip title="Start a new recording session. Logs all game events (buzzers, scores, answers, timer events) and exports them as DaVinci Resolve marker XML file for video editing timeline integration.">
                <Button
                  variant="contained"
                  onClick={handleStartNewSession}
                  startIcon={<AddIcon />}
                  sx={{ 
                    minHeight: 36,
                    minWidth: 120
                  }}
                >
                  Start Recording
                </Button>
              </Tooltip>
            ) : (
              <Tooltip title="End the current session and export the marker file. Sessions automatically end after 3 hours for data safety.">
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleEndSession}
                  startIcon={<StopIcon />}
                  sx={{ 
                    minHeight: 36,
                    minWidth: 120
                  }}
                >
                  Stop Recording
                </Button>
              </Tooltip>
            )}

            {isRecording && sessionId && (
              <Chip 
                label={
                  sessionInfo ? 
                    `Session: ${sessionId.substring(0, 8)}... (${formatRemainingTime(sessionInfo.remainingTime)} left, ${sessionInfo.totalEvents} events)` :
                    `Session: ${sessionId.substring(0, 8)}...`
                }
                color="primary" 
                variant="outlined"
                onDelete={handleEndSession}
                size="small"
              />
            )}
          </Box>
        </Box>
      </Paper>

      {/* Reset Scores Confirmation Dialog */}
      <Dialog
        open={resetScoresDialogOpen}
        onClose={() => setResetScoresDialogOpen(false)}
      >
        <DialogTitle>Reset All Scores?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to reset all contestant scores to 0? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setResetScoresDialogOpen(false)}
            sx={{ 
              minHeight: 36,
              minWidth: 80
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmResetScores} 
            color="error" 
            variant="contained"
            sx={{ 
              minHeight: 36,
              minWidth: 120
            }}
          >
            Reset Scores
          </Button>
        </DialogActions>
      </Dialog>

      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Game Type
        </Typography>
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Game Type</InputLabel>
          <Select value={gameType} label="Game Type" onChange={handleGameTypeChange}>
            <MenuItem value="buzzer">Standard Buzzer</MenuItem>
            <MenuItem value="multiple-choice">Multiple Choice</MenuItem>
            <MenuItem value="two-option">Two Option (Custom)</MenuItem>
            <MenuItem value="timer-only">Timer Only</MenuItem>
          </Select>
        </FormControl>

        {/* Timer Controls - moved here */}
        <Stack direction="row" alignItems="center" sx={{ mb: 2, flexWrap: 'wrap', gap: 2 }}>
          <TextField
            label="Minutes"
            type="number"
            value={timerMinutes}
            onChange={handleTimerMinutesChange}
            sx={{ width: 120 }}
            inputProps={{ min: 0 }}
          />
          <TextField
            label="Seconds"
            type="number"
            value={timerSeconds}
            onChange={handleTimerSecondsChange}
            sx={{ width: 120 }}
            inputProps={{ min: 0, max: 59 }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleStartTimer}
            sx={{ 
              minHeight: 36,
              minWidth: 120
            }}
          >
            Start Timer
          </Button>
          {gameConfig.timerRemaining !== undefined && (
            <Button
              variant="contained"
              color={gameConfig.timerRunning ? "error" : "success"}
              onClick={handleStopOrResumeTimer}
              sx={{ 
                minHeight: 36,
                minWidth: 120
              }}
            >
              {gameConfig.timerRunning ? 'Stop Timer' : (gameConfig.timerRemaining > 0 ? 'Resume Timer' : 'Stop Timer')}
            </Button>
          )}
          {gameConfig.timerRemaining !== undefined && (
            <Typography variant="h4" sx={{ ml: 2 }}>
              {formatTime(gameConfig.timerRemaining)}
            </Typography>
          )}
          {gameConfig.timerRemaining === undefined && gameConfig.timerDuration !== undefined && (
            <Typography variant="h4" sx={{ ml: 2, color: 'text.secondary' }}>
              {formatTime(gameConfig.timerDuration)}
            </Typography>
          )}
        </Stack>

        {gameType === 'buzzer' && (
          <>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
              Current Options Status
            </Typography>
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Contestant</TableCell>
                  <TableCell align="center">Score</TableCell>
                  <TableCell align="center">Status</TableCell>
                  <TableCell align="center">Buzzer Order</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {gameState.contestants.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell align="center">{c.score}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={c.buzzed ? 'Buzzed' : 'Ready'}
                        color={c.buzzed ? 'info' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      {getBuzzOrder(c.id) ? (
                        <Chip label={getBuzzOrder(c.id)} color={getBuzzOrder(c.id) === 1 ? 'primary' : 'default'} size="small" />
                      ) : (
                        <Typography variant="body2" color="text.secondary">—</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        {(gameType === 'multiple-choice' || gameType === 'two-option') && (
          <>
            {gameType === 'multiple-choice' && (
              <Paper elevation={3} sx={{ mb: 3, bgcolor: 'background.paper' }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 700, width: '100%', textAlign: 'left' }}>
                  Question Management
                </Typography>
                <Stack direction="row" spacing={2} sx={{ mb: 2, width: '100%' }} alignItems="center">
                  <Button 
                    variant="contained" 
                    component="span" 
                    color="warning" 
                    sx={{ 
                      minWidth: 200,
                      minHeight: 36
                    }}
                  >
                    <label htmlFor="csv-upload" style={{ width: '100%', display: 'block', cursor: 'pointer' }}>
                      <input
                        accept=".csv"
                        style={{ display: 'none' }}
                        id="csv-upload"
                        type="file"
                        onChange={handleFileUpload}
                      />
                      Upload Questions CSV
                    </label>
                  </Button>
                  <Typography sx={{ flexGrow: 1 }}>Loaded {questions.length} questions</Typography>
                </Stack>
                <Stack direction="row" spacing={2} sx={{ mb: 2, width: '100%' }} alignItems="center">
                  <Button
                    variant="outlined"
                    onClick={handlePreviousQuestion}
                    disabled={currentQuestionIndex === 0}
                    sx={{ 
                      minHeight: 36,
                      minWidth: 100
                    }}
                  >
                    Previous
                  </Button>
                  <Typography sx={{ flexGrow: 1, textAlign: 'center' }}>
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </Typography>
                  <Button
                    variant="outlined"
                    onClick={handleNextQuestion}
                    disabled={currentQuestionIndex === questions.length - 1}
                    sx={{ 
                      minHeight: 36,
                      minWidth: 100
                    }}
                  >
                    Next
                  </Button>
                </Stack>
                <Divider sx={{ my: 3 }} />
                {gameConfig.question && (
                  <Box sx={{ width: '100%', bgcolor: 'rgba(255, 255, 255, 0.05)', borderRadius: 2, p: 3, mb: 3 }}>
                    <Typography variant="h5" sx={{ mb: 2, fontWeight: 700, width: '100%', textAlign: 'left' }}>
                      {gameConfig.question}
                    </Typography>
                    <Box
                      sx={{
                        display: 'grid',
                        gap: 2,
                        mb: 2,
                        width: '100%',
                        gridTemplateColumns: {
                          xs: 'repeat(2, 1fr)',
                          sm: 'repeat(4, 1fr)'
                        },
                      }}
                    >
                      {gameConfig.options?.map((opt, idx) => (
                        <Button
                          key={opt}
                          variant={correctAnswer === opt ? "contained" : "outlined"}
                          color={correctAnswer === opt ? "success" : "primary"}
                          sx={{
                            minWidth: 0,
                            fontWeight: 600,
                            fontSize: '1.1rem',
                            width: '100%',
                            height: 40,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            justifyContent: 'flex-start',
                            textTransform: 'none',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          <span style={{ fontWeight: 700, whiteSpace: 'nowrap', marginRight: 8 }}>{String.fromCharCode(65 + idx)}:</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt}</span>
                        </Button>
                      ))}
                    </Box>
                  </Box>
                )}
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 700, width: '100%', textAlign: 'left' }}>
                  Current Question Status
                </Typography>
                <Table size="small" sx={{ mb: 2, width: '100%' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Contestant</TableCell>
                      <TableCell align="center">Score</TableCell>
                      <TableCell align="center">Status</TableCell>
                      <TableCell align="center">Answer</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {gameState.contestants.map(c => (
                      <TableRow key={c.id}>
                        <TableCell>{c.name}</TableCell>
                        <TableCell align="center">{c.score}</TableCell>
                        <TableCell align="center">
                          <Chip
                            label={gameState.answers && gameState.answers[c.id] ? 'Locked In' : 'Ready'}
                            color={gameState.answers && gameState.answers[c.id] ? 'info' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="center">
                          {gameState.answers && gameState.answers[c.id] ? (
                            <Chip
                              label={gameState.answers[c.id]}
                              color={
                                gameType === 'multiple-choice' && gameState.revealAnswers && gameState.answers[c.id] === correctAnswer
                                  ? 'success'
                                  : gameType === 'multiple-choice' && gameState.revealAnswers && gameState.answers[c.id] !== correctAnswer
                                  ? 'error'
                                  : 'primary'
                              }
                              size="small"
                            />
                          ) : (
                            <Typography variant="body2" color="text.secondary">—</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleRevealAnswers}
                  disabled={revealAnswers}
                  sx={{ 
                    mt: 2, 
                    fontSize: '1.1rem', 
                    fontWeight: 700, 
                    width: '100%',
                    minHeight: 48
                  }}
                  fullWidth
                >
                  Reveal Answers
                </Button>
              </Paper>
            )}

            {gameType === 'two-option' && (
              <Paper elevation={3} sx={{ mb: 3, bgcolor: 'background.paper' }}>
                <Typography variant="h6" gutterBottom sx={{ width: '100%', textAlign: 'left' }}>
                  Two Options
                </Typography>
                <TextField
                  label="Options (comma-separated)"
                  value={optionsInput}
                  onChange={(e) => handleOptionsChange(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                  placeholder="Option 1, Option 2"
                  helperText="Enter two options separated by a comma"
                />
                {gameConfig.options && gameConfig.options.length === 2 && (
                  <Stack direction="row" spacing={2} sx={{ width: '100%' }}>
                    {gameConfig.options.map((opt, idx) => (
                      <Box
                        key={opt}
                        sx={{
                          minWidth: 120,
                          py: 1.5,
                          px: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600,
                          fontSize: '1.1rem',
                          bgcolor: 'background.paper',
                          border: '1px solid',
                          borderColor: 'divider',
                          boxShadow: 'none',
                          cursor: 'default',
                          userSelect: 'none',
                          borderRadius: 2,
                          flex: 1
                        }}
                      >
                        {idx + 1}: {opt}
                      </Box>
                    ))}
                  </Stack>
                )}
                <Typography variant="h6" sx={{ mt: 3, mb: 2, fontWeight: 700, width: '100%', textAlign: 'left' }}>
                  Current Options Status
                </Typography>
                <Table size="small" sx={{ mb: 2, width: '100%' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Contestant</TableCell>
                      <TableCell align="center">Score</TableCell>
                      <TableCell align="center">Status</TableCell>
                      <TableCell align="center">Answer</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {gameState.contestants.map(c => (
                      <TableRow key={c.id}>
                        <TableCell>{c.name}</TableCell>
                        <TableCell align="center">{c.score}</TableCell>
                        <TableCell align="center">
                          <Chip
                            label={gameState.answers && gameState.answers[c.id] ? 'Locked In' : 'Ready'}
                            color={gameState.answers && gameState.answers[c.id] ? 'info' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="center">
                          {gameState.answers && gameState.answers[c.id] ? (
                            <Chip
                              label={gameState.answers[c.id]}
                              color={gameState.revealAnswers ? 'primary' : 'default'}
                              size="small"
                            />
                          ) : (
                            <Typography variant="body2" color="text.secondary">—</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleRevealAnswers}
                  disabled={revealAnswers}
                  sx={{ 
                    mt: 2, 
                    fontSize: '1.1rem', 
                    fontWeight: 700, 
                    width: '100%',
                    minHeight: 48
                  }}
                  fullWidth
                >
                  Reveal Answers
                </Button>
              </Paper>
            )}
          </>
        )}
      </Paper>

      <Paper elevation={3} sx={{ p: 3 }}>
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: { xs: 'flex-start', sm: 'center' }, 
          mb: 2,
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2
        }}>
          <Typography variant="h4">
            Contestants
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, width: { xs: '100%', sm: 'auto' } }}>
            <Button
              variant="contained"
              startIcon={<ContentCopyIcon />}
              onClick={copyAllUrls}
              sx={{ 
                minHeight: 36,
                flexGrow: 1
              }}
            >
              Copy All
            </Button>
            <Button
              variant="outlined"
              startIcon={<ContentCopyIcon />}
              onClick={copyAllUrlsOnly}
              sx={{ 
                minHeight: 36,
                flexGrow: 1
              }}
            >
              URLs Only
            </Button>
          </Box>
        </Box>
        
        {/* Add Contestant Section */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
          <TextField
            label="Contestant Name"
            value={newContestantName}
            onChange={(e) => setNewContestantName(e.target.value)}
            size="small"
            sx={{ flexGrow: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddContestant();
              }
            }}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddContestant}
            size="small"
            sx={{ 
              minHeight: 40,
              minWidth: 80
            }}
          >
            Add
          </Button>
        </Box>
        
        <DragDropContext onDragEnd={handleReorder}>
          <Droppable droppableId="contestant-list">
            {(provided) => (
              <List ref={provided.innerRef} {...provided.droppableProps} sx={{ p: 0 }}>
                {gameState.contestants.map((contestant, idx) => (
                  <Draggable key={contestant.id} draggableId={contestant.id} index={idx}>
                    {(provided, snapshot) => (
                      <Paper
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        elevation={snapshot.isDragging ? 4 : 1}
                        sx={{
                          mb: 1.5,
                          borderRadius: 2,
                          transition: 'box-shadow 0.2s ease-in-out',
                        }}
                      >
                        <ListItem
                          secondaryAction={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <TextField
                                type="number"
                                label="Score"
                                value={contestant.score}
                                onChange={(e) => handleUpdateScore(contestant.id, parseInt(e.target.value))}
                                size="small"
                                sx={{ width: 100 }}
                              />
                              <Tooltip title="Copy Contestant URL">
                                <IconButton
                                  edge="end"
                                  onClick={() => copyContestantUrl(contestant.id)}
                                  sx={{ mr: 1 }}
                                >
                                  <ContentCopyIcon />
                                </IconButton>
                              </Tooltip>
                              <IconButton edge="end" aria-label="delete" onClick={() => handleRemoveContestant(contestant.id)}>
                                <DeleteIcon />
                              </IconButton>
                            </Box>
                          }
                        >
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {contestant.name}
                                <Box
                                  sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    bgcolor: contestant.connected ? 'success.main' : 'error.main',
                                    ml: 1,
                                    transition: 'background-color 0.3s ease'
                                  }}
                                />
                              </Box>
                            }
                            secondary={
                              <Box>
                                <Typography variant="body2" color="text.secondary">
                                  ID: {contestant.id}
                                </Typography>
                              </Box>
                            }
                          />
                        </ListItem>
                      </Paper>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </List>
            )}
          </Droppable>
        </DragDropContext>
      </Paper>
    </Box>
  );
};

export default AdminView; 