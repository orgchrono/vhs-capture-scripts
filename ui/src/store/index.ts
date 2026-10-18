import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { studioSlice } from './studioSlice';
import { preferencesSlice, persistPreferences } from './preferencesSlice';
import { studioRtkApi } from '../api/studioRtkApi';

const preferencesPersistenceMiddleware: Middleware = (storeApi) => (next) => (action) => {
  const result = next(action);
  if (
    typeof action === 'object' &&
    action !== null &&
    'type' in action &&
    typeof (action as { type: unknown }).type === 'string' &&
    (action as { type: string }).type.startsWith('preferences/')
  ) {
    const state = storeApi.getState();
    persistPreferences(state.preferences);
  }
  return result;
};

export const store = configureStore({
  reducer: {
    studio: studioSlice.reducer,
    preferences: preferencesSlice.reducer,
    [studioRtkApi.reducerPath]: studioRtkApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(studioRtkApi.middleware, preferencesPersistenceMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
