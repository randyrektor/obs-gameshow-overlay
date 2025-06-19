# Deployment Guide for OBS Game Show Overlay

This guide will help you deploy your OBS Game Show Overlay application to Railway.

## Prerequisites

1. A Railway account (sign up at [railway.com](https://railway.com))
2. Your code pushed to a GitHub repository
3. Node.js 18+ installed locally for development

## Project Structure

The project has been restructured to combine frontend and backend:

```
obs-gameshow-overlay/
├── src/
│   └── server.ts          # Express server with Socket.IO
├── client-new/            # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   └── utils/
│   │       └── config.ts  # URL configuration
│   └── package.json
├── package.json           # Main package.json with build scripts
├── railway.json           # Railway configuration
├── Dockerfile            # Alternative Docker deployment
└── tsconfig.json
```

## Deployment Steps

### Option 1: Deploy to Railway (Recommended)

1. **Push your code to GitHub**
   ```bash
   git add .
   git commit -m "Prepare for Railway deployment"
   git push origin main
   ```

2. **Deploy on Railway**
   - Go to [railway.com](https://railway.com) and sign in
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Railway will automatically detect the configuration and deploy

3. **Configure Environment Variables (Optional)**
   - In your Railway project dashboard, go to "Variables"
   - Add any custom environment variables if needed
   - The app will work with default settings

4. **Access Your Application**
   - Railway will provide a URL like `https://your-app-name.railway.app`
   - The admin panel will be at the root URL
   - Contestant URLs will be `https://your-app-name.railway.app/contestant/{contestantId}`

### Option 2: Local Development

1. **Install dependencies**
   ```bash
   npm run install:all
   ```

2. **Start development servers**
   ```bash
   npm run dev
   ```
   This will start both the backend (port 3001) and frontend (port 3000)

3. **Build for production**
   ```bash
   npm run build
   npm start
   ```

## How It Works

### Combined Architecture
- The Express server serves the React frontend from the `client-new/build` directory
- Socket.IO handles real-time communication between admin and contestants
- All API endpoints are served from the same domain as the frontend

### URL Configuration
The app automatically handles URLs:
- **Development**: Uses `http://localhost:3001` for API/WebSocket
- **Production**: Uses relative paths (same domain) for API/WebSocket

### Build Process
1. `npm run build:client` - Builds React app to `client-new/build`
2. `npm run build:server` - Compiles TypeScript server
3. `npm start` - Serves the combined application

## Features

- **Real-time multiplayer**: Socket.IO for instant updates
- **Admin panel**: Manage contestants, game types, and scores
- **Contestant views**: Individual URLs for each contestant
- **Multiple game types**: Buzzer, multiple choice, two-option, timer
- **Responsive design**: Works on desktop and mobile
- **OBS integration**: Browser source compatible

## Troubleshooting

### Common Issues

1. **Build fails on Railway**
   - Check that all dependencies are in `package.json`
   - Ensure TypeScript compilation works locally

2. **WebSocket connection fails**
   - Verify the Railway URL is correct
   - Check that the port configuration is correct

3. **Static files not served**
   - Ensure the React build completed successfully
   - Check that `client-new/build` directory exists

### Local Testing

Before deploying, test the production build locally:

```bash
npm run build
npm start
```

Visit `http://localhost:3001` to verify everything works.

## Environment Variables

The app uses these environment variables (all optional):

- `PORT` - Server port (default: 3001)
- `REACT_APP_WEBSOCKET_URL` - WebSocket server URL
- `REACT_APP_API_URL` - API server URL  
- `REACT_APP_FRONTEND_URL` - Frontend URL

In production, these default to relative paths on the same domain.

## Support

For Railway-specific issues, check the [Railway documentation](https://docs.railway.app/).
For application issues, check the console logs in your Railway deployment. 