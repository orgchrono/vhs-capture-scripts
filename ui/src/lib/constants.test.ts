import { describe, it, expect } from 'vitest';
import { isSupportedVideoFile, SUPPORTED_VIDEO_EXTENSIONS } from './constants';

describe('Video file extension validation for drag and drop', () => {
  it('identifies supported video formats accurately regardless of case', () => {
    expect(isSupportedVideoFile('tape_1994.mkv')).toBe(true);
    expect(isSupportedVideoFile('capture.MKV')).toBe(true);
    expect(isSupportedVideoFile('movie.mp4')).toBe(true);
    expect(isSupportedVideoFile('vhs.avi')).toBe(true);
    expect(isSupportedVideoFile('raw_tape.mov')).toBe(true);
    expect(isSupportedVideoFile('recording.ts')).toBe(true);
    expect(isSupportedVideoFile('dvd_rip.vob')).toBe(true);
    expect(isSupportedVideoFile('stream.m2ts')).toBe(true);
  });

  it('rejects non-video or dangerous files', () => {
    expect(isSupportedVideoFile('notes.txt')).toBe(false);
    expect(isSupportedVideoFile('image.png')).toBe(false);
    expect(isSupportedVideoFile('photo.jpg')).toBe(false);
    expect(isSupportedVideoFile('setup.exe')).toBe(false);
    expect(isSupportedVideoFile('archive.zip')).toBe(false);
    expect(isSupportedVideoFile('no_extension')).toBe(false);
    expect(isSupportedVideoFile('')).toBe(false);
  });

  it('contains essential broadcast video formats in constants', () => {
    expect(SUPPORTED_VIDEO_EXTENSIONS).toContain('mkv');
    expect(SUPPORTED_VIDEO_EXTENSIONS).toContain('mp4');
    expect(SUPPORTED_VIDEO_EXTENSIONS).toContain('avi');
    expect(SUPPORTED_VIDEO_EXTENSIONS).toContain('mov');
  });
});
