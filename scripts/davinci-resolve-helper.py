#!/usr/bin/env python3
"""
DaVinci Resolve Marker Import Helper

This script helps import game event markers into DaVinci Resolve.
It can read the exported JSON markers and create markers in DaVinci Resolve.

Requirements:
- DaVinci Resolve Studio (for API access)
- Python 3.6+
- DaVinci Resolve Python API

Usage:
    python davinci-resolve-helper.py --markers markers.json --timeline "Timeline 1"
"""

import json
import argparse
import sys
from typing import List, Dict, Any
from pathlib import Path

try:
    import DaVinciResolveScript as dvr_script
except ImportError:
    print("Error: DaVinci Resolve Python API not found.")
    print("Please install DaVinci Resolve Studio and ensure the Python API is available.")
    sys.exit(1)

class DaVinciResolveHelper:
    def __init__(self):
        self.resolve = dvr_script.scriptapp("Resolve")
        if not self.resolve:
            print("Error: Could not connect to DaVinci Resolve.")
            sys.exit(1)
        
        self.project_manager = self.resolve.GetProjectManager()
        self.project = self.project_manager.GetCurrentProject()
        
        if not self.project:
            print("Error: No project open in DaVinci Resolve.")
            sys.exit(1)
    
    def get_timeline(self, timeline_name: str = None):
        """Get timeline by name or return current timeline."""
        if timeline_name:
            timeline = self.project.GetTimelineByName(timeline_name)
            if not timeline:
                print(f"Error: Timeline '{timeline_name}' not found.")
                return None
            return timeline
        else:
            return self.project.GetCurrentTimeline()
    
    def create_marker(self, timeline, frame_number: int, name: str, color: str, note: str):
        """Create a marker on the timeline."""
        try:
            # Convert color name to DaVinci Resolve color index
            color_map = {
                'Red': 1,
                'Green': 2, 
                'Blue': 3,
                'Yellow': 4,
                'Purple': 5,
                'Orange': 6,
                'Cyan': 7,
                'Magenta': 8,
                'White': 0
            }
            color_index = color_map.get(color, 0)
            
            # Create marker
            marker = timeline.AddMarker(frame_number, color_index, name, note, 1)
            return marker
        except Exception as e:
            print(f"Error creating marker at frame {frame_number}: {e}")
            return None
    
    def import_markers_from_json(self, json_file: str, timeline_name: str = None, fps: float = 30.0):
        """Import markers from JSON file."""
        try:
            with open(json_file, 'r') as f:
                markers_data = json.load(f)
            
            timeline = self.get_timeline(timeline_name)
            if not timeline:
                return False
            
            print(f"Importing {len(markers_data)} markers to timeline: {timeline.GetName()}")
            
            success_count = 0
            for marker_data in markers_data:
                frame_number = int(marker_data['start'])
                name = marker_data['name']
                color = marker_data['color']
                note = marker_data['note']
                
                if self.create_marker(timeline, frame_number, name, color, note):
                    success_count += 1
                    print(f"✓ Created marker: {name} at frame {frame_number}")
                else:
                    print(f"✗ Failed to create marker: {name} at frame {frame_number}")
            
            print(f"\nImport completed: {success_count}/{len(markers_data)} markers created successfully.")
            return True
            
        except FileNotFoundError:
            print(f"Error: File '{json_file}' not found.")
            return False
        except json.JSONDecodeError:
            print(f"Error: Invalid JSON in file '{json_file}'.")
            return False
        except Exception as e:
            print(f"Error importing markers: {e}")
            return False
    
    def list_timelines(self):
        """List all timelines in the current project."""
        timelines = self.project.GetTimelineList()
        print("Available timelines:")
        for i in range(timelines.GetCount()):
            timeline = timelines.GetItemByIndex(i + 1)
            print(f"  - {timeline.GetName()}")
    
    def export_timeline_markers(self, timeline_name: str = None, output_file: str = None):
        """Export existing markers from timeline."""
        timeline = self.get_timeline(timeline_name)
        if not timeline:
            return False
        
        markers = timeline.GetMarkers()
        if not markers:
            print("No markers found in timeline.")
            return True
        
        marker_list = []
        for marker_id in markers:
            marker = markers[marker_id]
            marker_data = {
                'frame': marker['frameId'],
                'name': marker['name'],
                'color': marker['color'],
                'note': marker['note'],
                'duration': marker['duration']
            }
            marker_list.append(marker_data)
        
        if output_file:
            with open(output_file, 'w') as f:
                json.dump(marker_list, f, indent=2)
            print(f"Exported {len(marker_list)} markers to {output_file}")
        else:
            print(f"Found {len(marker_list)} markers:")
            for marker in marker_list:
                print(f"  Frame {marker['frame']}: {marker['name']} ({marker['color']})")
        
        return True

def main():
    parser = argparse.ArgumentParser(description='DaVinci Resolve Marker Import Helper')
    parser.add_argument('--markers', help='JSON file containing markers to import')
    parser.add_argument('--timeline', help='Timeline name (default: current timeline)')
    parser.add_argument('--fps', type=float, default=30.0, help='Timeline FPS (default: 30.0)')
    parser.add_argument('--list-timelines', action='store_true', help='List available timelines')
    parser.add_argument('--export-markers', help='Export existing markers to JSON file')
    
    args = parser.parse_args()
    
    helper = DaVinciResolveHelper()
    
    if args.list_timelines:
        helper.list_timelines()
    elif args.export_markers:
        helper.export_timeline_markers(args.timeline, args.export_markers)
    elif args.markers:
        success = helper.import_markers_from_json(args.markers, args.timeline, args.fps)
        sys.exit(0 if success else 1)
    else:
        parser.print_help()

if __name__ == '__main__':
    main() 