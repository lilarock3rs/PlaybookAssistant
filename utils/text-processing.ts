export const extractTextFromHtml = (html: string): string => {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

export const extractKeywords = (text: string): string[] => {
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'were', 'will', 'with', 'the', 'this', 'but', 'they',
    'have', 'had', 'what', 'said', 'each', 'which', 'she', 'do', 'how',
    'their', 'if', 'will', 'up', 'other', 'about', 'out', 'many', 'then',
    'them', 'these', 'so', 'some', 'her', 'would', 'make', 'like', 'into',
    'him', 'time', 'two', 'more', 'very', 'when', 'come', 'may', 'its',
    'only', 'see', 'first', 'way', 'been', 'call', 'who', 'oil', 'sit',
    'now', 'find', 'long', 'down', 'day', 'did', 'get', 'has', 'made',
    'most', 'over', 'said', 'some', 'time', 'very', 'what', 'with', 'have'
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .filter((word, index, arr) => arr.indexOf(word) === index)
    .slice(0, 20);
};

export const calculateTextSimilarity = (text1: string, text2: string): number => {
  const keywords1 = new Set(extractKeywords(text1));
  const keywords2 = new Set(extractKeywords(text2));
  
  const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
  const union = new Set([...keywords1, ...keywords2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
};

export const createSearchableText = (playbook: {
  title: string;
  description?: string;
  content: string;
  tags?: string[];
}): string => {
  const parts = [
    playbook.title,
    playbook.description || '',
    extractTextFromHtml(playbook.content),
    ...(playbook.tags || [])
  ];
  
  return parts.join(' ').trim();
};

export const highlightText = (text: string, query: string): string => {
  if (!query || query.length < 2) {
    return text;
  }
  
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '*$1*');
};

export const extractSummary = (content: string, maxLength: number = 200): string => {
  const cleanContent = extractTextFromHtml(content);
  const sentences = cleanContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  let summary = '';
  for (const sentence of sentences) {
    if (summary.length + sentence.length > maxLength) {
      break;
    }
    summary += sentence.trim() + '. ';
  }
  
  return summary.trim() || cleanContent.substring(0, maxLength) + '...';
};

export const formatForSlack = (text: string): string => {
  return text
    .replace(/\*\*(.*?)\*\*/g, '*$1*')
    .replace(/_(.*?)_/g, '_$1_')
    .replace(/`(.*?)`/g, '`$1`')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<$2|$1>');
};

export const parseHashtags = (text: string): string[] => {
  const hashtags = text.match(/#\w+/g) || [];
  return hashtags.map(tag => tag.substring(1).toLowerCase());
};

export const normalizeQuery = (query: string): string => {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
};