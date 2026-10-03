import { useContext } from 'react';
import { FocusContext, type FocusContextValue } from './focusContext';

export function useFocus(): FocusContextValue {
  const value = useContext(FocusContext);
  if (!value) throw new Error('useFocus must be used within FocusProvider');
  return value;
}
