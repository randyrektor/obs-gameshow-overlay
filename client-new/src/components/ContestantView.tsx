import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from '../utils/config';
import { Box, Button, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Stack } from '@mui/material';
import TimerOnly from './TimerOnly';

interface Contestant {
  id: string;
  name: string;
  score: number;
  buzzed: boolean;
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
  answers?: Record<string, string>;
  revealAnswers?: boolean;
  correctAnswer?: string;
}

const ContestantView: React.FC<{ contestantId: string }> = ({ contestantId }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState>({ contestants: [] });
  const [contestant, setContestant] = useState<Contestant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);

  useEffect(() => {
    const newSocket = io(config.websocketUrl, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    setSocket(newSocket);

    newSocket.emit('join', contestantId);

    // Handle network disconnect
    const handleOffline = () => {
      if (newSocket) {
        console.log('Network offline, closing socket...');
        newSocket.close();
      }
    };

    window.addEventListener('offline', handleOffline);

    newSocket.on('gameState', (state: GameState) => {
      setGameState(state);
      const currentContestant = state.contestants.find(c => c.id === contestantId);
      if (currentContestant) {
        setContestant(currentContestant);
        setError(null);
      } else {
        setError('Contestant not found. Please check the URL and try again.');
      }
      // Only set correct answer for multiple choice mode
      if (state.gameType === 'multiple-choice') {
        setCorrectAnswer(state.correctAnswer || null);
      } else {
        setCorrectAnswer(null);
      }
    });

    return () => {
      window.removeEventListener('offline', handleOffline);
      newSocket.close();
    };
  }, [contestantId]);

  // Helper for buzz order
  const getBuzzOrder = (id: string) => {
    if (!gameState.buzzOrder) return null;
    const idx = gameState.buzzOrder.indexOf(id);
    return idx !== -1 ? idx + 1 : null;
  };

  // Handle buzzer
  const handleBuzz = () => {
    if (socket && contestant && !contestant.buzzed) {
      // Send buzz with client timestamp for accurate timing analysis
      socket.emit('buzz', { 
        contestantId, 
        clientTimestamp: Date.now() 
      });
    }
  };

  // Handle answer/choice
  const handleAnswer = (answer: string) => {
    if (socket && !gameState.revealAnswers) {
      socket.emit('submitAnswer', { contestantId, answer });
    }
  };

  const formatTime = (seconds: number | undefined): string => {
    if (seconds === undefined) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Use gameType from backend as source of truth
  const currentGameType = gameState.gameType;
  const gameTypeLabel =
    currentGameType === 'buzzer' ? 'Standard Buzzer'
    : currentGameType === 'multiple-choice' ? 'Multiple Choice'
    : currentGameType === 'two-option' ? 'Two Option'
    : currentGameType === 'timer-only' ? 'Timer Only'
    : '';

  // Clear locked answer when switching modes
  useEffect(() => {
    if (socket && gameState.answers && gameState.answers[contestantId]) {
      socket.emit('submitAnswer', { contestantId, answer: '' });
    }
  }, [currentGameType]);

  if (error) {
    return (
      <Box sx={{ 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 3
      }}>
        <Paper elevation={3} sx={{ p: 4, width: '100%', maxWidth: 600, textAlign: 'center' }}>
          <Typography variant="h5" color="error" gutterBottom>
            {error}
          </Typography>
          <Typography variant="body1">
            Please make sure you're using the correct URL from the admin panel.
          </Typography>
        </Paper>
      </Box>
    );
  }

  if (!contestant || !currentGameType) {
    return (
      <Box sx={{ 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 3
      }}>
        <Typography>Loading game state...</Typography>
      </Box>
    );
  }

  // Scoreboard (always shown)
  const maxScore = gameState.contestants.length > 0 ? Math.max(...gameState.contestants.map(c => c.score)) : 0;

  // Multiple choice/two-option answers display (when revealed)
  const showAnswers = (currentGameType === 'multiple-choice' || currentGameType === 'two-option') && gameState.revealAnswers;
  const isMC = currentGameType === 'multiple-choice';
  const lockedAnswer = gameState.answers ? gameState.answers[contestantId] : null;

  if (currentGameType === 'timer-only') {
    return (
      <TimerOnly
        timerRemaining={gameState.gameConfig?.timerRemaining}
        timerRunning={gameState.gameConfig?.timerRunning}
        timerDuration={gameState.gameConfig?.timerDuration}
      />
    );
  }

  return (
    <Box sx={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: 'background.default',
      p: 3
    }}>
      {/* Game type label */}
      {gameTypeLabel && (
        <Chip label={gameTypeLabel} color="info" sx={{ mb: 2, fontSize: 18, fontWeight: 700, letterSpacing: 1 }} />
      )}

      {/* Player name indicator for all modes except Timer Only */}
      <Typography variant="h4" gutterBottom sx={{ mb: 2, fontWeight: 700, textAlign: 'center' }}>
        {contestant.name}
      </Typography>

      {/* Timer Display */}
      {(() => {
        // Show timerDuration when timer is not running, otherwise show timerRemaining
        const displayTime = gameState.gameConfig?.timerRunning 
          ? gameState.gameConfig.timerRemaining 
          : gameState.gameConfig?.timerDuration;
        
        if (displayTime !== undefined) {
          return (
            <Typography
              variant="h2"
              sx={{
                mb: 2,
                color: gameState.gameConfig?.timerRunning 
                  ? 'primary.main' 
                  : displayTime === 0 
                    ? 'error.main' 
                    : 'text.secondary',
                transition: 'color 0.3s ease',
              }}
            >
              {formatTime(displayTime)}
            </Typography>
          );
        }
        return null;
      })()}

      {/* Question Progress */}
      {currentGameType === 'multiple-choice' && gameState.gameConfig?.questions && (
        <Typography variant="h6" sx={{ mb: 2 }}>
          Question {gameState.gameConfig.currentQuestionIndex! + 1} of {gameState.gameConfig.questions.length}
        </Typography>
      )}

      {/* Scoreboard */}
      <TableContainer component={Paper} sx={{ maxWidth: 600, mb: 4 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell align="left"><b>Contestant</b></TableCell>
              <TableCell align="center"><b>Score</b></TableCell>
              <TableCell align="center"><b>Status</b></TableCell>
              {currentGameType === 'buzzer' && <TableCell align="center" sx={{ minWidth: 120 }}><b>Buzz Order</b></TableCell>}
              {showAnswers && <TableCell align="center"><b>Answer</b></TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {gameState.contestants.map(c => (
              <TableRow key={c.id} selected={c.id === contestantId}>
                <TableCell align="left">{c.name}</TableCell>
                <TableCell align="center">{c.score}</TableCell>
                <TableCell align="center">
                  {currentGameType === 'buzzer' ? (
                    c.buzzed ? 'Buzzed' : 'Ready'
                  ) : (
                    gameState.answers && gameState.answers[c.id] ? 'Locked In' : 'Ready'
                  )}
                </TableCell>
                {currentGameType === 'buzzer' && (
                  <TableCell align="center">
                    <Box sx={{ minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {getBuzzOrder(c.id) ? (
                        <Chip label={getBuzzOrder(c.id)} color={getBuzzOrder(c.id) === 1 ? 'primary' : 'default'} />
                      ) : null}
                    </Box>
                  </TableCell>
                )}
                {showAnswers && (
                  <TableCell align="center">
                    {gameState.answers && gameState.answers[c.id] ? (
                      <Chip
                        label={gameState.answers[c.id]}
                        color={
                          isMC && correctAnswer && gameState.answers[c.id] === correctAnswer
                            ? 'success'
                            : isMC && correctAnswer && c.id === contestantId && lockedAnswer && lockedAnswer !== correctAnswer
                            ? 'error'
                            : c.id === contestantId
                            ? 'primary'
                            : 'default'
                        }
                      />
                    ) : ''}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Game type UI */}
      {currentGameType === 'buzzer' && (
        <Paper elevation={3} sx={{ p: 4, width: '100%', maxWidth: 600, textAlign: 'center' }}>
          <Typography variant="h2" color="primary" gutterBottom>
            Score: {contestant.score}
          </Typography>
          <Button
            variant="contained"
            color={contestant.buzzed ? "secondary" : "primary"}
            size="large"
            onClick={handleBuzz}
            disabled={contestant.buzzed}
            sx={{
              width: '200px',
              height: '200px',
              borderRadius: '50%',
              fontSize: '1.5rem',
              fontWeight: 'bold',
              mt: 4
            }}
          >
            {contestant.buzzed ? 'BUZZED!' : 'BUZZ IN'}
          </Button>
          <Typography variant="body1" sx={{ mt: 2 }}>
            {contestant.buzzed ? 'You buzzed in!' : 'Ready to buzz in!'}
          </Typography>
        </Paper>
      )}

      {(currentGameType === 'multiple-choice' || currentGameType === 'two-option') && (
        <Paper elevation={3} sx={{ p: 4, width: '100%', maxWidth: 600, textAlign: 'center' }}>
          {currentGameType === 'multiple-choice' && gameState.gameConfig?.question && (
            <Typography variant="h5" gutterBottom sx={{ mb: 3, fontWeight: 500 }}>
              {gameState.gameConfig.question}
            </Typography>
          )}
          <Stack direction="column" spacing={2} sx={{ width: '100%', maxWidth: 500, mx: 'auto' }}>
            {gameState.gameConfig?.options?.map((opt, idx) => {
              const isCorrect = currentGameType === 'multiple-choice' && gameState.revealAnswers && opt === gameState.correctAnswer;
              const isIncorrect = currentGameType === 'multiple-choice' && gameState.revealAnswers && lockedAnswer === opt && opt !== gameState.correctAnswer;
              const isSelected = lockedAnswer === opt;
              
              return (
                <Button
                  key={opt}
                  variant={isSelected ? 'contained' : 'outlined'}
                  color={
                    isCorrect ? 'success' :
                    isIncorrect ? 'error' :
                    isSelected ? 'primary' : 'inherit'
                  }
                  onClick={() => handleAnswer(opt)}
                  disabled={gameState.revealAnswers}
                  sx={{
                    width: '100%',
                    py: 2,
                    px: 3,
                    justifyContent: 'flex-start',
                    textTransform: 'none',
                    fontSize: '1.1rem',
                    fontWeight: 500,
                    textAlign: 'left',
                    whiteSpace: 'normal',
                    height: 'auto',
                    borderWidth: isCorrect || isIncorrect ? 2 : 1,
                    '&:hover': {
                      borderWidth: isCorrect || isIncorrect ? 2 : 1,
                    }
                  }}
                >
                  <Typography sx={{ fontWeight: 600, mr: 2 }}>
                    {currentGameType === 'multiple-choice' ? 
                      `${String.fromCharCode(65 + idx)})` : 
                      `${idx + 1})`}
                  </Typography>
                  {opt}
                  {isCorrect && (
                    <Typography sx={{ ml: 2, color: 'success.main', fontWeight: 600 }}>
                      ✓ Correct
                    </Typography>
                  )}
                  {isIncorrect && (
                    <Typography sx={{ ml: 2, color: 'error.main', fontWeight: 600 }}>
                      ✗ Incorrect
                    </Typography>
                  )}
                </Button>
              );
            })}
          </Stack>
          {showAnswers && (
            <Typography variant="body2" color="secondary" sx={{ mt: 3 }}>
              {currentGameType === 'multiple-choice' ? 
                (lockedAnswer === gameState.correctAnswer ? 
                  'Correct! Your score has been updated.' : 
                  'Answers revealed!') :
                'Answers revealed!'}
            </Typography>
          )}
          {!gameState.revealAnswers && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
              Choose your answer. You can change it until answers are revealed.
            </Typography>
          )}
        </Paper>
      )}
    </Box>
  );
};

export default ContestantView; 