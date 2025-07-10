#!/usr/bin/env ts-node

import fetch from 'node-fetch';
import { config } from '../config';
import { logger } from '../utils/logger';

async function setupProject() {
  logger.info('Setting up Playbook AI Assistant...');

  try {
    // 1. Initialize database
    logger.info('Initializing database...');
    const dbResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/db/init`, {
      method: 'POST',
    });

    if (!dbResponse.ok) {
      throw new Error(`Database initialization failed: ${dbResponse.statusText}`);
    }

    const dbResult = await dbResponse.json();
    logger.info('Database initialized successfully', dbResult);

    // 2. Test ClickUp connection
    logger.info('Testing ClickUp connection...');
    const clickupResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/clickup/status`, {
      method: 'GET',
    });

    if (clickupResponse.ok) {
      const clickupResult = await clickupResponse.json();
      logger.info('ClickUp connection successful', clickupResult);
    } else {
      logger.warn('ClickUp connection failed, but continuing setup');
    }

    // 3. Test AI service
    logger.info('Testing AI embedding service...');
    const aiResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/ai/embedding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'Test embedding generation',
      }),
    });

    if (aiResponse.ok) {
      const aiResult = await aiResponse.json();
      logger.info('AI service connection successful', { 
        embedding_dimensions: aiResult.data?.embedding?.length 
      });
    } else {
      logger.warn('AI service connection failed, but continuing setup');
    }

    // 4. Perform initial sync (optional)
    const shouldSync = process.argv.includes('--sync');
    if (shouldSync) {
      logger.info('Performing initial sync...');
      const syncResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/clickup/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          force_sync: true,
          limit: 50,
        }),
      });

      if (syncResponse.ok) {
        const syncResult = await syncResponse.json();
        logger.info('Initial sync completed', syncResult);
      } else {
        logger.warn('Initial sync failed, but setup continues');
      }
    }

    logger.info('Setup completed successfully!');
    logger.info('Next steps:');
    logger.info('1. Configure your Slack App endpoints');
    logger.info('2. Set up ClickUp webhooks (optional)');
    logger.info('3. Test Slack commands in your workspace');

  } catch (error) {
    logger.error('Setup failed:', error as Error);
    process.exit(1);
  }
}

if (require.main === module) {
  setupProject();
}