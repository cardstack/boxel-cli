/**
 * Tests for formatting and utility functions used across commands.
 *
 * formatRelativeTime (milestone.ts, history.ts) and computeFileHash
 * (status.ts, check.ts) are module-private, so we replicate them here.
 */
import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';

// Replicate formatRelativeTime from src/commands/milestone.ts:115-129
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}

// Replicate formatDate from src/commands/history.ts:367-386
function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  } else if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else {
    return 'just now';
  }
}

// Replicate computeFileHash from src/commands/status.ts:22-24
function computeFileHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

describe('formatRelativeTime', () => {
  it('returns "just now" for current time', () => {
    expect(formatRelativeTime(new Date())).toBe('just now');
  });

  it('returns "just now" for 30 seconds ago', () => {
    const date = new Date(Date.now() - 30 * 1000);
    expect(formatRelativeTime(date)).toBe('just now');
  });

  it('returns "1 minute ago" for 60 seconds ago', () => {
    const date = new Date(Date.now() - 61 * 1000);
    expect(formatRelativeTime(date)).toBe('1 minute ago');
  });

  it('returns "5 minutes ago" for 5 minutes ago', () => {
    const date = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('5 minutes ago');
  });

  it('returns "1 hour ago" for 60 minutes ago', () => {
    const date = new Date(Date.now() - 61 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('1 hour ago');
  });

  it('returns "3 hours ago" for 3 hours ago', () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('3 hours ago');
  });

  it('returns "1 day ago" for 25 hours ago', () => {
    const date = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('1 day ago');
  });

  it('returns "6 days ago" for 6 days ago', () => {
    const date = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('6 days ago');
  });

  it('returns localized date for >7 days ago', () => {
    const date = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const result = formatRelativeTime(date);
    // Should be a formatted date, not a relative time
    expect(result).not.toContain('ago');
    expect(result).not.toBe('just now');
  });

  it('uses singular for 1 minute', () => {
    const date = new Date(Date.now() - 90 * 1000);
    expect(formatRelativeTime(date)).toBe('1 minute ago');
  });

  it('uses plural for 2+ minutes', () => {
    const date = new Date(Date.now() - 2 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('2 minutes ago');
  });
});

describe('formatDate (history)', () => {
  it('returns "just now" for current time', () => {
    expect(formatDate(new Date())).toBe('just now');
  });

  it('returns minutes for recent past', () => {
    const date = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatDate(date)).toBe('5 minutes ago');
  });

  it('returns hours for same-day past', () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatDate(date)).toBe('3 hours ago');
  });

  it('returns days for recent week', () => {
    const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatDate(date)).toBe('3 days ago');
  });

  it('returns full date for >7 days', () => {
    const date = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const result = formatDate(date);
    expect(result).not.toContain('ago');
    // Should contain both date and time parts
    expect(result.length).toBeGreaterThan(5);
  });
});

describe('computeFileHash', () => {
  it('returns consistent MD5 hash for same content', () => {
    const hash1 = computeFileHash('hello world');
    const hash2 = computeFileHash('hello world');
    expect(hash1).toBe(hash2);
  });

  it('returns different hashes for different content', () => {
    const hash1 = computeFileHash('hello');
    const hash2 = computeFileHash('world');
    expect(hash1).not.toBe(hash2);
  });

  it('returns 32-character hex string', () => {
    const hash = computeFileHash('test');
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it('handles empty string', () => {
    const hash = computeFileHash('');
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it('handles unicode content', () => {
    const hash = computeFileHash('こんにちは世界 🌍');
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it('matches known MD5 hash', () => {
    // MD5 of empty string is d41d8cd98f00b204e9800998ecf8427e
    expect(computeFileHash('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('handles JSON content', () => {
    const json = JSON.stringify({ data: { meta: {}, attributes: { title: 'Test' } } });
    const hash = computeFileHash(json);
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it('is whitespace-sensitive', () => {
    const hash1 = computeFileHash('{"a":1}');
    const hash2 = computeFileHash('{ "a": 1 }');
    expect(hash1).not.toBe(hash2);
  });
});
