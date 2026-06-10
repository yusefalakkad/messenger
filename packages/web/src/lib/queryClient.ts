/**
 * Singleton react-query клиент. Вынесен отдельно от main.tsx, чтобы его можно было
 * импортировать из не-React кода — в первую очередь из resetAppState() при logout.
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});
