import React from 'react';
import { Box, Typography, Card } from '@mui/material';

interface TimerOnlyProps {
  timerRemaining?: number;
  timerRunning?: boolean;
  timerDuration?: number;
}

const TimerOnly: React.FC<TimerOnlyProps> = ({ timerRemaining, timerRunning, timerDuration }) => {
  const formatTime = (seconds: number | undefined): string => {
    if (seconds === undefined) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Show timerDuration when timer is not running, otherwise show timerRemaining
  const displayTime = timerRunning ? timerRemaining : timerDuration;

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        bgcolor: '#1a1a1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Card
        elevation={8}
        sx={{
          bgcolor: '#232323',
          px: { xs: 4, sm: 8 },
          py: { xs: 4, sm: 6 },
          borderRadius: 4,
          minWidth: 320,
          maxWidth: '90vw',
          minHeight: 120,
          maxHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography
          sx={{
            fontSize: { xs: '2.5rem', sm: '4rem', md: '5rem' },
            fontWeight: 'bold',
            color: !timerRunning && displayTime === 0 ? '#ff4444' : '#fff',
            textShadow: !timerRunning && displayTime === 0 ? '0 0 20px #ff4444' : '0 0 20px #fff8',
            fontFamily: 'monospace, monospace',
            textAlign: 'center',
            userSelect: 'none',
            mb: 2,
            animation: !timerRunning && displayTime === 0 ? 'pulse 1s infinite' : undefined,
            '@keyframes pulse': {
              '0%': { opacity: 1 },
              '50%': { opacity: 0.5 },
              '100%': { opacity: 1 },
            },
          }}
        >
          {formatTime(displayTime)}
        </Typography>
        {!timerRunning && displayTime === 0 && (
          <Typography
            variant="h5"
            sx={{
              color: '#ff4444',
              fontWeight: 'bold',
              textAlign: 'center',
              mt: 1,
              animation: 'pulse 1s infinite',
              '@keyframes pulse': {
                '0%': { opacity: 1 },
                '50%': { opacity: 0.5 },
                '100%': { opacity: 1 },
              },
            }}
          >
            TIME'S UP!
          </Typography>
        )}
      </Card>
    </Box>
  );
};

export default TimerOnly; 