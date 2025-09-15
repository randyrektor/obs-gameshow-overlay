import express from 'express';
import { EventLogger } from './eventLogger';

export function registerEndSessionRoute(app: express.Express, eventLogger: EventLogger) {
  app.post('/api/logs/end-session', (req, res) => {
    try {
      const { sessionId, fps } = req.body;
      const eventsForSession = eventLogger.getEventsForSession(sessionId);
      if (!eventsForSession) {
        return res.status(404).json({ success: false, error: 'Session not found or events are gone.' });
      }
      const xml = eventLogger.exportToDaVinciResolveXML(fps || 29.97, eventsForSession);
      eventLogger.endCurrentSession();
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="davinci-markers-session-${sessionId}.xml"`);
      res.send(xml);
    } catch (error) {
      console.error('Error ending session:', error);
      res.status(500).json({ success: false, error: 'Failed to end session' });
    }
  });
} 