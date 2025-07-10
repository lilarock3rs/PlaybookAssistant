import { z } from 'zod';

export const SlackCommandSchema = z.object({
  token: z.string(),
  team_id: z.string(),
  team_domain: z.string(),
  channel_id: z.string(),
  channel_name: z.string(),
  user_id: z.string(),
  user_name: z.string(),
  command: z.string(),
  text: z.string(),
  response_url: z.string(),
  trigger_id: z.string(),
});

export const SearchQuerySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  category: z.string().optional(),
  limit: z.number().min(1).max(20).optional(),
  threshold: z.number().min(0).max(1).optional(),
});

export const PlaybookSchema = z.object({
  clickup_id: z.string(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  content: z.string().min(1, 'Content is required'),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  url: z.string().url('Invalid URL'),
  embedding: z.array(z.number()).optional(),
});

export const validateSlackCommand = (data: unknown) => {
  return SlackCommandSchema.safeParse(data);
};

export const validateSearchQuery = (data: unknown) => {
  return SearchQuerySchema.safeParse(data);
};

export const validatePlaybook = (data: unknown) => {
  return PlaybookSchema.safeParse(data);
};

export const sanitizeText = (text: string): string => {
  return text
    .replace(/[<>]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
};

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
};