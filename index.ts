import { config, validateConfig } from './config';
import { logger } from './utils/logger';

const main = async () => {
  logger.info('Starting Playbook AI Assistant...');
  
  const configValidation = validateConfig();
  if (!configValidation.valid) {
    logger.error('Configuration validation failed', { 
      missing: configValidation.missing 
    });
    process.exit(1);
  }

  logger.info('Configuration validated successfully');
  logger.info('Playbook AI Assistant is ready!');
  
  // For Vercel Functions, we don't need a persistent server
  // Each API route is handled individually
};

if (require.main === module) {
  main().catch((error) => {
    logger.error('Failed to start application:', error);
    process.exit(1);
  });
}

export { main };