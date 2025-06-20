# Event Logging & DaVinci Resolve Integration Guide

This guide explains how to use the event logging system to create precise markers in DaVinci Resolve for post-production animation timing.

## Overview

The logging system captures all game events with millisecond-precision timestamps and exports them in formats compatible with DaVinci Resolve. This allows you to create frame-accurate markers for animations, transitions, and effects that align perfectly with when events occurred during recording.

## What Events Are Logged

The system automatically logs the following events:

- **Contestant Buzzes**: When contestants buzz in, including order
- **Score Updates**: All score changes with before/after values
- **Game Type Changes**: When switching between game modes
- **Question Changes**: New questions and multiple choice options
- **Answer Submissions**: Contestant answers with correctness
- **Answer Reveals**: When correct answers are shown
- **Timer Events**: Start, stop, and periodic ticks
- **Contestant Management**: Adding/removing contestants
- **Session Management**: Session start/end events

## How to Use the Logging System

### 1. Start a New Session

1. Open the Admin Panel in your browser
2. Expand the "Event Logging & DaVinci Resolve Export" section
3. Click "Start New Session" to begin logging
4. A session ID will be displayed to confirm logging is active

### 2. Run Your Game

Play your gameshow normally. All events will be automatically logged with timestamps.

### 3. Export Markers

After your recording session, export the markers in your preferred format:

#### JSON Format (Recommended)
- **30fps**: `Export JSON Markers (30fps)` - For standard video
- **60fps**: `Export JSON Markers (60fps)` - For high frame rate video

#### XML Format
- **30fps**: `Export XML (30fps)` - DaVinci Resolve XML format
- **60fps**: `Export XML (60fps)` - High frame rate XML

#### CSV Format
- `Export CSV` - For spreadsheet analysis or custom processing

## DaVinci Resolve Integration

### Method 1: Python Script (Recommended)

1. **Install Requirements**:
   - DaVinci Resolve Studio (required for API access)
   - Python 3.6+
   - DaVinci Resolve Python API

2. **Use the Helper Script**:
   ```bash
   # Import markers to current timeline
   python scripts/davinci-resolve-helper.py --markers davinci-markers-1234567890.json
   
   # Import to specific timeline
   python scripts/davinci-resolve-helper.py --markers markers.json --timeline "My Timeline"
   
   # List available timelines
   python scripts/davinci-resolve-helper.py --list-timelines
   ```

### Method 2: Manual Import

1. **Export JSON markers** from the admin panel
2. **Open DaVinci Resolve** and load your recorded video
3. **Create a new timeline** or use existing one
4. **Import markers manually**:
   - Open the exported JSON file
   - For each marker, note the frame number (`start` field)
   - In DaVinci Resolve, go to that frame and press `M` to create a marker
   - Set the marker name and color according to the JSON data

### Method 3: XML Import

1. **Export XML format** from the admin panel
2. **Import into DaVinci Resolve**:
   - File → Import → Timeline
   - Select the exported XML file
   - The markers will be imported with the timeline

## Marker Colors and Meanings

The system uses color-coded markers for easy identification:

- **Red**: Contestant buzzes
- **Green**: Score updates
- **Blue**: Game type changes
- **Yellow**: Question changes
- **Purple**: Answer submissions
- **Orange**: Answer reveals
- **Cyan**: Timer starts
- **Magenta**: Timer stops
- **White**: Timer ticks and other events

## Frame Rate Considerations

### Choosing the Right Frame Rate

- **30fps**: Standard video, most common
- **60fps**: High frame rate video, smoother motion
- **24fps**: Film standard
- **25fps**: PAL video standard

### Frame Rate Conversion

If your recording frame rate differs from the export frame rate:

1. **Calculate the conversion factor**:
   ```
   conversion_factor = export_fps / recording_fps
   ```

2. **Adjust frame numbers**:
   ```
   adjusted_frame = original_frame * conversion_factor
   ```

## Advanced Usage

### Custom Event Logging

You can add custom events by calling the logger directly:

```typescript
// In your server code
eventLogger.logEvent('custom_event', {
  description: 'Custom event description',
  data: { /* your data */ }
});
```

### Batch Processing

For multiple recordings, you can process all log files:

```bash
# Process all JSON files in a directory
for file in logs/*.json; do
  python scripts/davinci-resolve-helper.py --markers "$file" --timeline "Timeline"
done
```

### Integration with Other Software

The JSON format is easily parseable for integration with:
- Adobe Premiere Pro
- Final Cut Pro
- After Effects
- Custom animation software

## Troubleshooting

### Common Issues

1. **Markers don't align**: Check frame rate settings
2. **Missing events**: Ensure logging session was started
3. **DaVinci Resolve API errors**: Verify DaVinci Resolve Studio is installed
4. **Permission errors**: Check file write permissions in logs directory

### Debug Information

- Log files are stored in `server/logs/` directory
- Each session creates a timestamped JSON file
- Console logs show real-time event logging
- Session IDs help track multiple recordings

## File Structure

```
obs-gameshow-overlay/
├── server/
│   ├── logs/                    # Log files directory
│   │   ├── game_session_2024-01-15T10-30-00.json
│   │   └── game_session_2024-01-15T11-45-00.json
│   ├── src/
│   │   ├── eventLogger.ts       # Logging service
│   │   └── index.ts             # Server with logging integration
│   └── ...
├── scripts/
│   └── davinci-resolve-helper.py # DaVinci Resolve integration script
└── client-new/
    └── src/
        └── components/
            └── AdminView.tsx    # Admin panel with export controls
```

## Best Practices

1. **Start a new session** for each recording
2. **Use consistent frame rates** across recording and export
3. **Test marker placement** with a short recording first
4. **Backup log files** before major editing sessions
5. **Use descriptive marker names** for easy identification
6. **Group related events** using marker colors
7. **Document your workflow** for team consistency

## Support

For issues or questions:
1. Check the console logs for error messages
2. Verify all dependencies are installed
3. Test with a simple recording first
4. Review the troubleshooting section above 