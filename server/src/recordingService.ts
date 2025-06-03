import puppeteer, { Browser, Page } from 'puppeteer';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execAsync = promisify(exec);

interface RecordingOptions {
  overlayType: 'multiple-choice' | 'scoreboard';
  duration: number;
  fps: number;
  preRoll: number;
  postRoll: number;
}

class RecordingService {
  private browser: puppeteer.Browser | null = null;
  private page: puppeteer.Page | null = null;
  private isRecording = false;
  private framesDir: string;
  private recordingsDir: string;

  constructor() {
    // Set up frames directory in server folder
    this.framesDir = path.join(process.cwd(), 'frames');
    console.log('Frames directory:', this.framesDir);
    if (!fs.existsSync(this.framesDir)) {
      console.log('Creating frames directory...');
      fs.mkdirSync(this.framesDir, { recursive: true });
    }

    // Set up recordings directory on desktop
    this.recordingsDir = path.join(os.homedir(), 'Desktop', 'Test Animations');
    console.log('Recordings directory:', this.recordingsDir);
    if (!fs.existsSync(this.recordingsDir)) {
      console.log('Creating recordings directory...');
      fs.mkdirSync(this.recordingsDir, { recursive: true });
    }
  }

  async startRecording(options: RecordingOptions): Promise<string> {
    console.log('Starting recording with options:', options);
    
    if (this.isRecording) {
      console.log('Recording already in progress, skipping...');
      throw new Error('Recording already in progress');
    }

    this.isRecording = true;

    try {
      console.log('Launching browser...');
      // Launch browser
      this.browser = await puppeteer.launch({
        headless: 'new',
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--disable-backgrounding', '--disable-gpu', '--disable-infobars']
      });

      console.log('Creating new page...');
      this.page = await this.browser.newPage();

      // Set up page
      await this.page.setViewport({ width: 1920, height: 1080 });
      const url = `http://localhost:3000/${options.overlayType}`;
      console.log('Navigating to:', url);
      await this.page.goto(url);

      // Ensure transparency
      await this.page.evaluate(() => {
        document.body.style.background = 'transparent';
      });

      // Calculate total frames
      const totalFrames = options.duration * options.fps;
      const preRollFrames = options.preRoll * options.fps;
      const postRollFrames = options.postRoll * options.fps;
      console.log(`Capturing ${totalFrames} frames...`);

      // Clear frames directory
      console.log('Clearing frames directory...');
      const files = fs.readdirSync(this.framesDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.framesDir, file));
      }

      // Start capturing frames
      for (let i = 0; i < totalFrames; i++) {
        if (!this.isRecording) {
          console.log('Recording stopped during frame capture');
          break;
        }

        const framePath = path.join(this.framesDir, `frame_${String(i).padStart(3, '0')}.png`);
        console.log(`Capturing frame ${i + 1}/${totalFrames} to ${framePath}`);
        
        await this.page.screenshot({
          path: framePath,
          omitBackground: true,
        });

        // Wait for next frame
        await new Promise(resolve => setTimeout(resolve, 1000 / options.fps));
      }

      // Convert frames to ProRes 4444
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = path.join(this.recordingsDir, `${options.overlayType}_${timestamp}.mov`);
      console.log('Converting frames to video:', outputPath);
      
      const ffmpegCmd = `ffmpeg -framerate ${options.fps} -i ${path.join(this.framesDir, 'frame_%03d.png')} \
        -c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le \
        ${outputPath}`;
      
      console.log('Running FFmpeg command:', ffmpegCmd);
      const { stdout, stderr } = await execAsync(ffmpegCmd);
      console.log('FFmpeg stdout:', stdout);
      if (stderr) console.log('FFmpeg stderr:', stderr);

      console.log('Recording completed successfully');
      return outputPath;
    } catch (error) {
      console.error('Recording error:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async stopRecording(): Promise<void> {
    console.log('Stopping recording...');
    this.isRecording = false;
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    console.log('Cleaning up resources...');
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const recordingService = new RecordingService(); 