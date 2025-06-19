// Configuration utility for handling URLs in different environments
const getBaseUrl = () => {
  // In production (when served from the same domain as the API), use relative paths
  if (process.env.NODE_ENV === 'production') {
    return '';
  }
  // In development, use localhost
  return 'http://localhost:3001';
};

export const config = {
  websocketUrl: process.env.REACT_APP_WEBSOCKET_URL || getBaseUrl(),
  apiUrl: process.env.REACT_APP_API_URL || getBaseUrl(),
  frontendUrl: process.env.REACT_APP_FRONTEND_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000'),
}; 