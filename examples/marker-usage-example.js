/**
 * Example: Using Exported Marker Data
 * 
 * This example shows how to process the exported JSON marker data
 * for custom animations, analysis, or integration with other software.
 */

// Example marker data structure (from exported JSON)
const exampleMarkers = [
  {
    "name": "contestant_buzz",
    "color": "Red",
    "note": "John buzzed (1st)",
    "start": 450,  // Frame number at 30fps
    "duration": 1
  },
  {
    "name": "score_update",
    "color": "Green", 
    "note": "John: 0 → 10 (+10)",
    "start": 480,
    "duration": 1
  },
  {
    "name": "answer_reveal",
    "color": "Orange",
    "note": "Correct: \"Paris\"",
    "start": 600,
    "duration": 1
  }
];

/**
 * Convert frame numbers to timecode
 */
function framesToTimecode(frames, fps = 30) {
  const totalSeconds = frames / fps;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frameNumber = Math.floor((totalSeconds % 1) * fps);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frameNumber.toString().padStart(2, '0')}`;
}

/**
 * Group markers by event type
 */
function groupMarkersByType(markers) {
  const groups = {};
  
  markers.forEach(marker => {
    if (!groups[marker.name]) {
      groups[marker.name] = [];
    }
    groups[marker.name].push(marker);
  });
  
  return groups;
}

/**
 * Find markers within a time range
 */
function findMarkersInRange(markers, startFrame, endFrame) {
  return markers.filter(marker => 
    marker.start >= startFrame && marker.start <= endFrame
  );
}

/**
 * Create animation triggers for After Effects
 */
function createAfterEffectsTriggers(markers, fps = 30) {
  return markers.map(marker => ({
    time: marker.start / fps,
    event: marker.name,
    data: marker.note,
    color: marker.color
  }));
}

/**
 * Generate subtitle/caption timing
 */
function generateSubtitleTiming(markers) {
  return markers
    .filter(marker => marker.note && marker.note.length > 0)
    .map(marker => ({
      start: framesToTimecode(marker.start),
      end: framesToTimecode(marker.start + 90), // 3 seconds duration
      text: marker.note
    }));
}

/**
 * Create keyframe data for animations
 */
function createKeyframeData(markers, fps = 30) {
  const keyframes = [];
  
  markers.forEach(marker => {
    const time = marker.start / fps;
    
    switch (marker.name) {
      case 'contestant_buzz':
        keyframes.push({
          time,
          type: 'buzz_animation',
          contestant: marker.note.split(' ')[0], // Extract name
          order: parseInt(marker.note.match(/\d+/)[0])
        });
        break;
        
      case 'score_update':
        keyframes.push({
          time,
          type: 'score_animation',
          contestant: marker.note.split(':')[0],
          scoreChange: parseInt(marker.note.match(/[+-]\d+/)[0])
        });
        break;
        
      case 'answer_reveal':
        keyframes.push({
          time,
          type: 'reveal_animation',
          answer: marker.note.match(/"([^"]+)"/)[1]
        });
        break;
    }
  });
  
  return keyframes;
}

/**
 * Export for different software formats
 */
function exportForSoftware(markers, software, fps = 30) {
  switch (software.toLowerCase()) {
    case 'aftereffects':
      return createAfterEffectsTriggers(markers, fps);
      
    case 'premiere':
      return markers.map(marker => ({
        InPoint: framesToTimecode(marker.start, fps),
        OutPoint: framesToTimecode(marker.start + marker.duration, fps),
        Name: marker.name,
        Comments: marker.note
      }));
      
    case 'finalcut':
      return markers.map(marker => ({
        startTime: marker.start / fps,
        duration: marker.duration / fps,
        name: marker.name,
        note: marker.note
      }));
      
    case 'subtitles':
      return generateSubtitleTiming(markers);
      
    default:
      return markers;
  }
}

// Example usage
console.log('=== Marker Analysis Example ===\n');

// Load markers from file (in real usage)
const markers = exampleMarkers;

console.log('1. Timecode conversion:');
markers.forEach(marker => {
  console.log(`${marker.name}: ${framesToTimecode(marker.start)} - ${marker.note}`);
});

console.log('\n2. Grouped by type:');
const grouped = groupMarkersByType(markers);
Object.keys(grouped).forEach(type => {
  console.log(`${type}: ${grouped[type].length} events`);
});

console.log('\n3. Keyframe data for animations:');
const keyframes = createKeyframeData(markers);
keyframes.forEach(kf => {
  console.log(`${kf.time.toFixed(2)}s: ${kf.type} - ${JSON.stringify(kf)}`);
});

console.log('\n4. After Effects triggers:');
const aeTriggers = exportForSoftware(markers, 'aftereffects');
aeTriggers.forEach(trigger => {
  console.log(`${trigger.time.toFixed(2)}s: ${trigger.event} - ${trigger.data}`);
});

console.log('\n5. Subtitle timing:');
const subtitles = exportForSoftware(markers, 'subtitles');
subtitles.forEach(sub => {
  console.log(`${sub.start} → ${sub.end}: ${sub.text}`);
});

// Example: Find all events in first 20 seconds (600 frames at 30fps)
console.log('\n6. Events in first 20 seconds:');
const earlyEvents = findMarkersInRange(markers, 0, 600);
earlyEvents.forEach(event => {
  console.log(`${framesToTimecode(event.start)}: ${event.note}`);
});

module.exports = {
  framesToTimecode,
  groupMarkersByType,
  findMarkersInRange,
  createAfterEffectsTriggers,
  generateSubtitleTiming,
  createKeyframeData,
  exportForSoftware
}; 