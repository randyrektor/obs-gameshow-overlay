// Configuration utility for handling URLs in different environments
const getBaseUrl = () => {
  // In production (when served from the same domain as the API), use relative paths
  if (process.env.NODE_ENV === 'production') {
    return '';
  }
  // In development, use localhost
  return 'http://localhost:3001';
};

const getFrontendUrl = () => {
  // In production, use the Railway URL
  if (process.env.NODE_ENV === 'production') {
    return 'https://obs-gameshow-overlay-production.up.railway.app';
  }
  // In development, use localhost
  return 'http://localhost:3000';
};

export const config = {
  websocketUrl: process.env.REACT_APP_WEBSOCKET_URL || getBaseUrl(),
  apiUrl: process.env.REACT_APP_API_URL || getBaseUrl(),
  frontendUrl: process.env.REACT_APP_FRONTEND_URL || getFrontendUrl(),
}; 