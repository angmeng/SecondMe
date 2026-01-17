/**
 * Settings API Route
 * T100: Server Actions for user settings including sleep hours configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';

/**
 * GET /api/settings - Get all settings
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section');

    if (section === 'sleep_hours') {
      const config = await redisClient.getSleepHoursConfig();
      const status = await redisClient.isSleepHoursActive();
      const deferredCount = await redisClient.getDeferredMessageCount();

      return NextResponse.json({
        config,
        status,
        deferredCount,
      });
    }

    // Return all settings
    const sleepHoursConfig = await redisClient.getSleepHoursConfig();
    const sleepStatus = await redisClient.isSleepHoursActive();
    const globalPauseActive = await redisClient.isGlobalPauseActive();

    return NextResponse.json({
      sleepHours: {
        config: sleepHoursConfig,
        status: sleepStatus,
      },
      globalPause: {
        active: globalPauseActive,
      },
    });
  } catch (error: any) {
    console.error('[Settings API] Error getting settings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get settings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings - Update settings
 * Body: { section: 'sleep_hours', config: {...} }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { section, config } = body;

    if (!section) {
      return NextResponse.json({ error: 'section is required' }, { status: 400 });
    }

    if (section === 'sleep_hours') {
      // Validate sleep hours config
      if (config) {
        if (config.startHour !== undefined && (config.startHour < 0 || config.startHour > 23)) {
          return NextResponse.json(
            { error: 'startHour must be between 0 and 23' },
            { status: 400 }
          );
        }
        if (config.endHour !== undefined && (config.endHour < 0 || config.endHour > 23)) {
          return NextResponse.json(
            { error: 'endHour must be between 0 and 23' },
            { status: 400 }
          );
        }
        if (config.startMinute !== undefined && (config.startMinute < 0 || config.startMinute > 59)) {
          return NextResponse.json(
            { error: 'startMinute must be between 0 and 59' },
            { status: 400 }
          );
        }
        if (config.endMinute !== undefined && (config.endMinute < 0 || config.endMinute > 59)) {
          return NextResponse.json(
            { error: 'endMinute must be between 0 and 59' },
            { status: 400 }
          );
        }
        if (config.timezoneOffset !== undefined && (config.timezoneOffset < -12 || config.timezoneOffset > 14)) {
          return NextResponse.json(
            { error: 'timezoneOffset must be between -12 and 14' },
            { status: 400 }
          );
        }
      }

      await redisClient.setSleepHoursConfig(config);

      const updatedConfig = await redisClient.getSleepHoursConfig();
      const status = await redisClient.isSleepHoursActive();

      return NextResponse.json({
        success: true,
        config: updatedConfig,
        status,
      });
    }

    return NextResponse.json({ error: 'Unknown settings section' }, { status: 400 });
  } catch (error: any) {
    console.error('[Settings API] Error updating settings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}
