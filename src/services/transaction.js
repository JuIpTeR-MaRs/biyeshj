
import { MOCK_CHANNELS, MOCK_CATEGORIES } from '../constants';

export const generateTransaction = () => {
  const channel = MOCK_CHANNELS[Math.floor(Math.random() * MOCK_CHANNELS.length)];
  const amount = parseFloat((Math.random() * 500 + 5).toFixed(2));
  const category = MOCK_CATEGORIES[Math.floor(Math.random() * MOCK_CATEGORIES.length)];

  return {
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    channel,
    amount,
    category,
    status: 'Pending'
  };
};
