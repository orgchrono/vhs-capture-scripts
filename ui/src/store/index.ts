import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { studioSlice } from './studioSlice';
import { studioRtkApi } from '../api/studioRtkApi';

export const store = configureStore({
  reducer: {
    studio: studioSlice.reducer,
    [studioRtkApi.reducerPath]: studioRtkApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(studioRtkApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
