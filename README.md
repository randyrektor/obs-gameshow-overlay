# OBS Game Show Overlay

A browser-based game show overlay system that integrates with OBS Studio using WebSocket. This system allows for managing contestants, scores, and buzzer functionality in a game show setting.

## Features

- Real-time scoreboard updates
- Contestant buzzer system
- Admin panel for managing contestants and scores
- OBS WebSocket integration for overlay control
- Responsive design for both admin and contestant views

## Prerequisites

- Node.js (v14 or higher)
- OBS Studio (v27 or higher)
- OBS WebSocket plugin (included with OBS v28+)

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd obs-gameshow-overlay
```

2. Install backend dependencies:
```bash
npm install
```

3. Install frontend dependencies:
```bash
cd client
npm install
```

4. Create a `.env` file in the root directory:
```
PORT=3001
OBS_PASSWORD=your_obs_websocket_password
```

5. Configure OBS WebSocket:
   - Open OBS Studio
   - Go to Tools > WebSocket Server Settings
   - Enable WebSocket server
   - Set a password (use the same as in your .env file)
   - Click OK

## Running the Application

1. Start the backend server:
```bash
npm run dev
```

2. In a new terminal, start the frontend:
```bash
cd client
npm start
```

3. Access the application:
   - Admin panel: http://localhost:3000/admin
   - Contestant view: http://localhost:3000/contestant/{contestantId}

## Usage

### Admin Panel
- Add contestants using the "Add Contestant" form
- Toggle game state using the "Game Active" switch
- Update scores for each contestant
- Reset buzzers when needed

### Contestant View
- View current score
- Use the buzzer button to buzz in
- See game state and buzzer status

### OBS Integration
The system will automatically connect to OBS WebSocket and control overlays based on game events. Make sure to:
1. Create a browser source in OBS pointing to the contestant view URL
2. Set up appropriate scenes and transitions
3. Configure any additional overlays or effects as needed

## Development

- Backend code is in the `src` directory
- Frontend code is in the `client/src` directory
- The application uses TypeScript for type safety
- Material-UI is used for the user interface
- Socket.IO handles real-time communication

## License

MIT 