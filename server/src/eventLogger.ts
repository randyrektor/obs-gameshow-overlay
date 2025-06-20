import fs from 'fs';
import path from 'path';

export interface GameEvent {
  timestamp: number; // Unix timestamp in milliseconds
  eventType: string;
  eventData: any;
  sessionId: string;
}

export interface DaVinciResolveMarker {
  name: string;
  color: string;
  note: string;
  start: number; // Frame number
  duration: number; // Frames
}

export class EventLogger {
  private events: GameEvent[] = [];
  private sessionId: string;
  private logDir: string;
  private currentLogFile: string | null = null;
  private sessionStartTime: number | null = null;
  private sessionTimeout: NodeJS.Timeout | null = null;
  private readonly SESSION_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

  constructor() {
    this.sessionId = this.generateSessionId();
    this.logDir = path.join(process.cwd(), 'logs');
    
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  startNewSession(): void {
    // Clear any existing timeout
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = null;
    }

    this.sessionId = this.generateSessionId();
    this.events = [];
    this.sessionStartTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.currentLogFile = path.join(this.logDir, `game_session_${timestamp}.json`);
    
    // Set up automatic timeout
    this.sessionTimeout = setTimeout(() => {
      console.log(`Session ${this.sessionId} automatically ended after 3 hours`);
      this.endCurrentSession();
    }, this.SESSION_TIMEOUT_MS);
    
    // Log session start
    this.logEvent('session_start', {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      autoTimeout: this.SESSION_TIMEOUT_MS
    });
  }

  endCurrentSession(): void {
    if (!this.currentLogFile) {
      console.warn("Attempted to end a session that was not started.");
      return;
    }

    // Clear the timeout
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = null;
    }

    this.logEvent('session_end', {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      sessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0
    });

    // Reset for the next session
    this.currentLogFile = null;
    this.sessionId = this.generateSessionId(); // Prepare a new ID for the next session
    this.events = [];
    this.sessionStartTime = null;
    console.log(`Session ${this.sessionId} ended.`);
  }

  logEvent(eventType: string, eventData: any): void {
    if (!this.currentLogFile) {
      // Don't log events if no session is active
      return;
    }

    const event: GameEvent = {
      timestamp: Date.now(),
      eventType,
      eventData,
      sessionId: this.sessionId
    };

    this.events.push(event);
    
    // Write to file immediately for persistence
    if (this.currentLogFile) {
      fs.writeFileSync(this.currentLogFile, JSON.stringify(this.events, null, 2));
    }

    console.log(`[EVENT] ${eventType}:`, eventData);
  }

  // Game-specific event logging methods
  logContestantBuzz(contestantId: string, contestantName: string, buzzOrder: number): void {
    this.logEvent('contestant_buzz', {
      contestantId,
      contestantName,
      buzzOrder,
      action: 'buzz'
    });
  }

  logScoreUpdate(contestantId: string, contestantName: string, oldScore: number, newScore: number, reason?: string): void {
    this.logEvent('score_update', {
      contestantId,
      contestantName,
      oldScore,
      newScore,
      scoreChange: newScore - oldScore,
      reason: reason || 'manual_update'
    });
  }

  logGameTypeChange(gameType: string, config?: any): void {
    this.logEvent('game_type_change', {
      gameType,
      config
    });
  }

  logQuestionChange(questionIndex: number, question?: string, options?: string[]): void {
    this.logEvent('question_change', {
      questionIndex,
      question,
      options
    });
  }

  logAnswerSubmission(contestantId: string, contestantName: string, answer: string, isCorrect?: boolean): void {
    this.logEvent('answer_submission', {
      contestantId,
      contestantName,
      answer,
      isCorrect
    });
  }

  logAnswerReveal(correctAnswer: string, allAnswers: Record<string, string>): void {
    this.logEvent('answer_reveal', {
      correctAnswer,
      allAnswers
    });
  }

  logTimerStart(duration: number): void {
    this.logEvent('timer_start', {
      duration,
      startTime: Date.now()
    });
  }

  logTimerStop(remainingTime: number): void {
    this.logEvent('timer_stop', {
      remainingTime,
      stopTime: Date.now()
    });
  }

  logTimerTick(remainingTime: number): void {
    this.logEvent('timer_tick', {
      remainingTime,
      timestamp: Date.now()
    });
  }

  // Export methods for DaVinci Resolve
  exportToDaVinciResolveMarkers(fps: number = 30): DaVinciResolveMarker[] {
    const markers: DaVinciResolveMarker[] = [];
    if (this.events.length === 0) {
      return markers;
    }
    
    this.events.forEach((event, index) => {
      const frameNumber = Math.floor((event.timestamp - this.events[0].timestamp) / 1000 * fps);
      
      let marker: DaVinciResolveMarker = {
        name: event.eventType,
        color: this.getEventColor(event.eventType),
        note: this.formatEventNote(event),
        start: frameNumber,
        duration: 1 // 1 frame duration
      };

      markers.push(marker);
    });

    return markers;
  }

  exportToCSV(): string {
    const headers = ['Timestamp', 'EventType', 'EventData', 'SessionId'];
    const rows = this.events.map(event => [
      new Date(event.timestamp).toISOString(),
      event.eventType,
      JSON.stringify(event.eventData),
      event.sessionId
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  exportToDaVinciResolveXML(fps: number = 30, events: GameEvent[] | null = null): string {
    const eventsToExport = events || this.events;
    const markers = this.exportEventsToMarkers(eventsToExport, fps);
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<xmeml version="4">\n';
    xml += '  <sequence>\n';
    xml += '    <markers>\n';
    
    markers.forEach(marker => {
      xml += `      <marker>\n`;
      xml += `        <name>${this.escapeXml(marker.name)}</name>\n`;
      xml += `        <color>${marker.color}</color>\n`;
      xml += `        <note>${this.escapeXml(marker.note)}</note>\n`;
      xml += `        <start>${marker.start}</start>\n`;
      xml += `        <duration>${marker.duration}</duration>\n`;
      xml += `      </marker>\n`;
    });
    
    xml += '    </markers>\n';
    xml += '  </sequence>\n';
    xml += '</xmeml>';
    
    return xml;
  }

  private getEventColor(eventType: string): string {
    const colorMap: Record<string, string> = {
      'session_start': 'Blue',
      'session_end': 'Blue',
      'contestant_buzz': 'Red',
      'score_update': 'Green',
      'game_type_change': 'Blue',
      'question_change': 'Yellow',
      'answer_submission': 'Purple',
      'answer_reveal': 'Orange',
      'timer_start': 'Cyan',
      'timer_stop': 'Magenta',
      'timer_tick': 'White'
    };
    
    return colorMap[eventType] || 'White';
  }

  private formatEventNote(event: GameEvent): string {
    switch (event.eventType) {
      case 'contestant_buzz':
        return `${event.eventData.contestantName} buzzed (${event.eventData.buzzOrder}${this.getOrdinalSuffix(event.eventData.buzzOrder)})`;
      case 'score_update':
        return `${event.eventData.contestantName}: ${event.eventData.oldScore} → ${event.eventData.newScore} (${event.eventData.scoreChange > 0 ? '+' : ''}${event.eventData.scoreChange})`;
      case 'game_type_change':
        return `Game type: ${event.eventData.gameType}`;
      case 'question_change':
        return `Question ${event.eventData.questionIndex + 1}`;
      case 'answer_submission':
        return `${event.eventData.contestantName}: "${event.eventData.answer}"`;
      case 'answer_reveal':
        return `Correct: "${event.eventData.correctAnswer}"`;
      case 'timer_start':
        return `Timer started (${event.eventData.duration}s)`;
      case 'timer_stop':
        return `Timer stopped (${event.eventData.remainingTime}s remaining)`;
      default:
        return JSON.stringify(event.eventData);
    }
  }

  private getOrdinalSuffix(num: number): string {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  getEvents(): GameEvent[] {
    return [...this.events];
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getCurrentLogFile(): string | null {
    return this.currentLogFile;
  }

  getSessionInfo(): { 
    sessionId: string; 
    isActive: boolean; 
    startTime: number | null; 
    remainingTime: number | null;
    totalEvents: number;
  } {
    const isActive = this.currentLogFile !== null;
    let remainingTime = null;
    
    if (isActive && this.sessionStartTime) {
      const elapsed = Date.now() - this.sessionStartTime;
      remainingTime = Math.max(0, this.SESSION_TIMEOUT_MS - elapsed);
    }

    return {
      sessionId: this.sessionId,
      isActive,
      startTime: this.sessionStartTime,
      remainingTime,
      totalEvents: this.events.length
    };
  }

  // Add a way to get events for a specific, now completed, session
  getEventsForSession(sessionId: string): GameEvent[] | null {
    if (this.events.length > 0 && this.events[0].sessionId === sessionId) {
      return [...this.events];
    }
    return null;
  }

  // A new method to export from a given set of events, not just the current live ones
  exportEventsToDaVinciResolveXML(events: GameEvent[], fps: number = 30): string {
    const markers = this.exportEventsToMarkers(events, fps);
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<xmeml version="4">\n';
    xml += '  <sequence>\n';
    xml += '    <markers>\n';
    
    markers.forEach(marker => {
      xml += `      <marker>\n`;
      xml += `        <name>${this.escapeXml(marker.name)}</name>\n`;
      xml += `        <color>${marker.color}</color>\n`;
      xml += `        <note>${this.escapeXml(marker.note)}</note>\n`;
      xml += `        <start>${marker.start}</start>\n`;
      xml += `        <duration>${marker.duration}</duration>\n`;
      xml += `      </marker>\n`;
    });
    
    xml += '    </markers>\n';
    xml += '  </sequence>\n';
    xml += '</xmeml>';
    
    return xml;
  }
  
  private exportEventsToMarkers(events: GameEvent[], fps: number = 30): DaVinciResolveMarker[] {
      const markers: DaVinciResolveMarker[] = [];
      if (events.length === 0) {
        return markers;
      }
      
      const startTime = events[0].timestamp;

      events.forEach((event) => {
        const frameNumber = Math.floor((event.timestamp - startTime) / 1000 * fps);
        
        let marker: DaVinciResolveMarker = {
          name: event.eventType,
          color: this.getEventColor(event.eventType),
          note: this.formatEventNote(event),
          start: frameNumber,
          duration: 1 // 1 frame duration
        };
  
        markers.push(marker);
      });
  
      return markers;
  }
}

export const eventLogger = new EventLogger(); 